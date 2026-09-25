<script setup>
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { showConfirmDialog, showImagePreview, showToast } from 'vant'
import { useFeesStore } from '../stores/fees'
import { useRosterStore } from '../stores/roster'
import { useIdentityStore } from '../stores/identity'
import { useTrashStore } from '../stores/trash'
import { getFile, putFile, deleteFile, getFilesByRecord } from '../data/attachments'
import { uid } from '../data/db'

const show = defineModel('show', { type: Boolean, default: false })
const props = defineProps({
  // null = 记一笔，否则为编辑
  record: { type: Object, default: null },
})
const emit = defineEmits(['saved'])

const DEFAULT_HANDLER = '周彦志'
const MAX_FILE_SIZE = 10 * 1024 * 1024

const fees = useFeesStore()
const roster = useRosterStore()
const identity = useIdentityStore()
const trashStore = useTrashStore()
const isEdit = computed(() => !!props.record)

const EXPENSE_TAGS = ['活动经费', '奖品礼品', '打印材料', '快递邮费', '日常用品', '其他']
const INCOME_TAGS = ['退款', '返还', '其他']

function emptyForm() {
  return {
    type: '支出',
    amount: '',
    date: dayjs().format('YYYY-MM-DD'),
    category: '',
    handler: identity.member?.name || '',
    note: '',
  }
}
const form = ref(emptyForm())
const calShow = ref(false)
const pickerShow = ref(false)
const memberSearch = ref('')
const minDate = new Date(new Date().setFullYear(new Date().getFullYear() - 2))
const maxDate = new Date(new Date().setFullYear(new Date().getFullYear() + 2))

// 凭证：existing = 已保存的；uploadList = 本次新加的
const existing = ref([]) // [{ id, name, type, size, blob }]
const removedIds = ref([])
const uploadList = ref([]) // [{ key, file, url, name }]

watch(show, async (v) => {
  if (!v) return
  form.value = props.record
    ? { ...props.record, amount: String(props.record.amount) }
    : emptyForm()
  uploadList.value = []
  removedIds.value = []
  existing.value = []
  if (props.record?.attachments?.length) {
    try {
      const files = await getFilesByRecord(props.record.id)
      const map = new Map(files.map((f) => [f.id, f]))
      existing.value = props.record.attachments
        .filter((a) => map.has(a.id))
        .map((a) => ({ ...a, blob: map.get(a.id).blob }))
    } catch (e) {
      console.error('读取凭证失败', e)
    }
  }
})

const tags = computed(() => (form.value.type === '收入' ? INCOME_TAGS : EXPENSE_TAGS))

const filteredMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  if (!q) return roster.members
  return roster.members.filter((m) =>
    [m.name, m.studentId, m.dorm].some((v) => String(v || '').toLowerCase().includes(q))
  )
})

function onConfirmDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  form.value.date = `${y}-${m}-${day}`
  calShow.value = false
}

function selectMember(m) {
  form.value.handler = m.name
  pickerShow.value = false
}

const isImage = (a) => (a.type || '').startsWith('image/')
function objUrl(a) {
  if (!a._url) a._url = URL.createObjectURL(a.blob)
  return a._url
}

function onAfterRead(detail) {
  const file = detail.file
  // 类型白名单：只收图片和 PDF（accept 只是提示，用户可能绕过）
  const okType = /^image\//.test(file.type) || file.type === 'application/pdf'
  if (!okType) return showToast('只支持图片或 PDF 凭证')
  if (file.size > MAX_FILE_SIZE) return showToast('单个文件不能超过 10MB')
  uploadList.value.push({
    key: uid(),
    file,
    url: URL.createObjectURL(file),
    name: file.name || '凭证文件',
  })
}

function removeExisting(a) {
  removedIds.value.push(a.id)
  existing.value = existing.value.filter((x) => x.id !== a.id)
}

async function previewAtt(a) {
  let blob = a.blob
  if (!blob) {
    const f = await getFile(a.id)
    blob = f?.blob
  }
  if (!blob) return showToast('找不到文件')
  const url = URL.createObjectURL(blob)
  if ((blob.type || '').startsWith('image/')) {
    showImagePreview({ images: [url], onClose: () => URL.revokeObjectURL(url) })
  } else {
    window.open(url)
  }
}

async function onSubmit() {
  const amount = Number(form.value.amount)
  if (!amount || amount <= 0) return showToast('请填写正确的金额')
  if (!form.value.handler.trim()) return showToast('请选择经办人')
  const data = {
    type: form.value.type,
    amount,
    date: form.value.date,
    category: form.value.category.trim(),
    handler: form.value.handler.trim(),
    note: form.value.note.trim(),
  }

  // 保留未被删除的旧凭证 + 新凭证入库
  const kept = (form.value.attachments || []).filter(
    (a) => !removedIds.value.includes(a.id)
  )
  const newMetas = []
  try {
    if (isEdit.value) {
      for (const u of uploadList.value) {
        const attId = uid()
        await putFile({
          id: attId,
          recordId: form.value.id,
          name: u.name,
          type: u.file.type,
          blob: u.file,
        })
        newMetas.push({ id: attId, name: u.name, type: u.file.type, size: u.file.size })
      }
      fees.updateRecord(form.value.id, { ...data, attachments: [...kept, ...newMetas] })
      for (const id of removedIds.value) await deleteFile(id)
    } else {
      // 先建账拿到 id，再把凭证文件挂上去
      const rec = fees.addRecord({ ...data, attachments: [] })
      for (const u of uploadList.value) {
        const attId = uid()
        await putFile({
          id: attId,
          recordId: rec.id,
          name: u.name,
          type: u.file.type,
          blob: u.file,
        })
        newMetas.push({ id: attId, name: u.name, type: u.file.type, size: u.file.size })
      }
      if (newMetas.length) fees.updateRecord(rec.id, { attachments: newMetas })
    }
  } catch (e) {
    console.error(e)
    return showToast('凭证保存失败，请重试')
  }

  show.value = false
  emit('saved')
}

async function onDelete() {
  try {
    await showConfirmDialog({
      title: '删除记录',
      message: `将「${form.value.category || '未分类'} ¥${form.value.amount}」移入回收站，7 天内可恢复。确定吗？`,
    })
  } catch {
    return
  }
  // 凭证附件保留，彻底删除时才清理
  trashStore.add('fee', { ...form.value, amount: Number(form.value.amount) })
  fees.archiveRecord(form.value.id)
  show.value = false
  showToast('已移入回收站')
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '88%' }">
    <div class="form-wrap">
      <div class="form-title">{{ isEdit ? '编辑记录' : '记一笔' }}</div>
      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field label="类型">
            <template #input>
              <van-radio-group v-model="form.type" direction="horizontal">
                <van-radio name="支出">支出</van-radio>
                <van-radio name="收入">收入</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field
            v-model="form.amount"
            label="金额"
            type="number"
            placeholder="必填"
            required
          />
          <van-field
            :model-value="form.date"
            label="日期"
            readonly
            is-link
            @click="calShow = true"
          />
          <van-field v-model="form.category" label="分类" maxlength="12" placeholder="如：打印材料" />
          <div class="tag-row">
            <van-tag
              v-for="t in tags"
              :key="t"
              plain
              type="primary"
              class="tag"
              @click="form.category = t"
            >
              {{ t }}
            </van-tag>
          </div>
          <van-field
            :model-value="form.handler"
            label="经办人"
            placeholder="必选，从名册里挑"
            readonly
            is-link
            required
            @click="pickerShow = true"
          />
          <div v-if="form.handler" class="tag-row">
            <van-tag closeable type="primary" @close="form.handler = ''">{{ form.handler }}，点 × 换人</van-tag>
          </div>
          <van-field
            v-model="form.note"
            label="备注"
            type="textarea"
            rows="1"
            autosize
            maxlength="100"
            placeholder="具体做了什么，如：购买班会零食 40 份"
          />
          <van-field label="凭证">
            <template #input>
              <div class="att-area">
                <div v-for="a in existing" :key="a.id" class="att-item" @click="previewAtt(a)">
                  <van-image v-if="isImage(a)" :src="objUrl(a)" fit="cover" class="att-thumb" />
                  <div v-else class="att-file">
                    <van-icon name="description-o" />
                    <span class="att-name">{{ a.name }}</span>
                  </div>
                  <van-icon name="clear" class="att-del" @click.stop="removeExisting(a)" />
                </div>
                <div v-for="u in uploadList" :key="u.key" class="att-item">
                  <van-image v-if="isImage(u)" :src="u.url" fit="cover" class="att-thumb" />
                  <div v-else class="att-file">
                    <van-icon name="description-o" />
                    <span class="att-name">{{ u.name }}</span>
                  </div>
                  <van-icon
                    name="clear"
                    class="att-del"
                    @click.stop="uploadList = uploadList.filter((x) => x.key !== u.key)"
                  />
                </div>
                <van-uploader :after-read="onAfterRead" accept="image/*,.pdf">
                  <div class="att-add">
                    <van-icon name="photograph" />
                    <span>添加</span>
                  </div>
                </van-uploader>
              </div>
            </template>
          </van-field>
        </van-cell-group>
        <div class="form-actions">
          <van-button v-if="isEdit && identity.isMonitor" round plain type="danger" class="btn-delete" @click="onDelete">
            删除
          </van-button>
          <van-button round block type="primary" native-type="submit">保存</van-button>
        </div>
      </van-form>
    </div>

    <van-calendar
      v-model:show="calShow"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onConfirmDate"
    />

    <van-popup v-model:show="pickerShow" position="bottom" round :style="{ height: '70%' }">
      <van-search v-model="memberSearch" placeholder="搜索姓名 / 学号 / 宿舍" />
      <div class="member-list">
        <van-cell-group>
          <van-cell
            v-for="m in filteredMembers"
            :key="m.id"
            :title="m.name"
            :label="`学号 ${m.studentId || '—'}${m.dorm ? ' · ' + m.dorm : ''}`"
            clickable
            @click="selectMember(m)"
          >
            <template #value>
              <van-tag v-if="m.duty" type="primary">{{ m.duty }}</van-tag>
            </template>
          </van-cell>
        </van-cell-group>
        <van-empty v-if="!filteredMembers.length" description="没有匹配的成员" />
      </div>
    </van-popup>
  </van-popup>
</template>

<style scoped>
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 32px 4px;
}
.tag {
  cursor: pointer;
}
.member-list {
  height: calc(100% - 54px);
  overflow-y: auto;
}
.form-actions {
  display: flex;
  gap: 12px;
}
.btn-delete {
  flex: 0 0 96px;
}
.att-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.att-item {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  background: #f7f8fa;
  cursor: pointer;
}
.att-thumb {
  width: 100%;
  height: 100%;
}
.att-file {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 10px;
  color: #646566;
  padding: 4px;
}
.att-file .van-icon {
  font-size: 20px;
  color: #1989fa;
}
.att-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.att-del {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 16px;
  color: #969799;
  background: #fff;
  border-radius: 0 0 0 6px;
}
.att-add {
  width: 64px;
  height: 64px;
  border: 1px dashed #dcdee0;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11px;
  color: #969799;
}
.att-add .van-icon {
  font-size: 20px;
}
</style>
