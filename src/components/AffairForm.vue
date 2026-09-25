<script setup>
import { computed, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useAffairStore } from '../stores/affairs'
import { useRosterStore } from '../stores/roster'
import { useIdentityStore } from '../stores/identity'
import { useTrashStore } from '../stores/trash'

const show = defineModel('show', { type: Boolean, default: false })
const props = defineProps({
  // null = 新建，否则为编辑
  affair: { type: Object, default: null },
  // 新建时的默认范围：class=班级事务 | personal=个人事务
  defaultScope: { type: String, default: 'class' },
})
const emit = defineEmits(['saved'])

const affairs = useAffairStore()
const roster = useRosterStore()
const identity = useIdentityStore()
const trashStore = useTrashStore()
const isEdit = computed(() => !!props.affair)

function emptyForm() {
  return {
    title: '',
    note: '',
    deadline: '',
    owner: '',
    done: false,
    members: [],
    scope: props.defaultScope === 'personal' ? 'personal' : 'class',
    status: 'doing',
  }
}
const form = ref(emptyForm())

const calShow = ref(false)
const pickerShow = ref(false)
const pickerMode = ref('member') // 'owner' 选负责人 | 'member' 连续添加清单成员
const memberSearch = ref('')
const minDate = new Date(new Date().setFullYear(new Date().getFullYear() - 1))
const maxDate = new Date(new Date().setFullYear(new Date().getFullYear() + 2))

watch(show, (v) => {
  if (!v) return
  form.value = props.affair
    ? JSON.parse(JSON.stringify({ ...props.affair }))
    : emptyForm()
  memberSearch.value = ''
})

const addedIds = computed(() => new Set(form.value.members.map((m) => m.memberId)))

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
  form.value.deadline = `${y}-${m}-${day}`
  calShow.value = false
}

function selectOwner(m) {
  form.value.owner = m.name
  pickerShow.value = false
}

function openPicker(mode) {
  pickerMode.value = mode
  memberSearch.value = ''
  pickerShow.value = true
}

function onPickMember(m) {
  if (pickerMode.value === 'owner') selectOwner(m)
  else addMember(m)
}

function addMember(m) {
  if (addedIds.value.has(m.id)) return showToast('已在清单里')
  form.value.members.push({ memberId: m.id, name: m.name, checked: false })
}

// 一键把全班加入清单
function addAllMembers() {
  let added = 0
  for (const m of roster.members) {
    if (!addedIds.value.has(m.id)) {
      form.value.members.push({ memberId: m.id, name: m.name, checked: false })
      added++
    }
  }
  showToast(added ? `已添加 ${added} 名成员` : '成员都已添加')
}

// 一键全部已交 / 全部未交
function setAllChecked(v) {
  form.value.members.forEach((m) => (m.checked = v))
}

const AVATAR_COLORS = ['#1989fa', '#07c160', '#ff9766', '#7d5cff', '#f5a623', '#0aa88f']

const undoneMembers = computed(() => form.value.members.filter((m) => !m.checked))

async function copyUndone() {
  const names = undoneMembers.value.map((m) => m.name)
  if (!names.length) return showToast('都交齐了，没有未交名单')
  const text = `【${form.value.title}】未交名单（${names.length}人）：${names.join('、')}`
  try {
    await navigator.clipboard.writeText(text)
    showToast('未交名单已复制，去群里催交吧')
  } catch {
    showToast('复制失败，请手动记录')
  }
}

async function onSubmit() {
  if (!form.value.title.trim()) return showToast('请填写标题')
  const data = { ...form.value, title: form.value.title.trim() }
  if (isEdit.value) affairs.update(data.id, data)
  else affairs.add({ ...data, ownerId: identity.memberId })
  show.value = false
  emit('saved')
}

async function toggleDone() {
  affairs.update(form.value.id, { done: !form.value.done })
  show.value = false
  showToast(form.value.done ? '已重新打开' : '已完成')
}

async function onDelete() {
  try {
    await showConfirmDialog({
      title: '删除事务',
      message: `确定删除「${form.value.title}」吗？`,
    })
  } catch {
    return
  }
  const rec = affairs.items.find((t) => t.id === form.value.id)
  if (rec) trashStore.add('affair', JSON.parse(JSON.stringify(rec)))
  affairs.remove(form.value.id)
  show.value = false
  showToast('已删除')
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '88%' }">
    <div class="form-wrap">
      <div class="form-title">{{ isEdit ? '编辑事务' : '新建事务' }}</div>
      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field label="范围">
            <template #input>
              <van-radio-group v-model="form.scope" direction="horizontal" :disabled="isEdit">
                <van-radio name="class">班级事务</van-radio>
                <van-radio name="personal">个人事务</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field label="状态">
            <template #input>
              <van-radio-group v-model="form.status" direction="horizontal">
                <van-radio name="notstarted">未开始</van-radio>
                <van-radio name="doing">进行中</van-radio>
                <van-radio name="ended">已结束</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field v-model="form.title" label="标题" placeholder="必填，如：收资助申请表" required maxlength="30" />
          <van-field
            :model-value="form.deadline"
            label="截止日期"
            placeholder="可选"
            readonly
            is-link
            @click="calShow = true"
          />
          <van-field
            v-if="form.scope === 'class'"
            :model-value="form.owner"
            label="负责人"
            placeholder="从名册选，可不填"
            readonly
            is-link
            @click="openPicker('owner')"
          />
          <van-field
            v-model="form.note"
            label="说明"
            type="textarea"
            rows="1"
            autosize
            maxlength="100"
            :placeholder="form.scope === 'personal' ? '个人计划、要做的事…' : '具体要求、交到哪里…'"
          />
        </van-cell-group>

        <!-- 成员清单（仅班级事务） -->
        <template v-if="form.scope === 'class'">
          <div class="section-head">
            <span>成员清单（{{ form.members.filter((m) => m.checked).length }}/{{ form.members.length }} 已完成）</span>
            <span class="quick-actions">
              <van-tag plain type="success" class="qa" @click="setAllChecked(true)">全部已交</van-tag>
              <van-tag plain type="warning" class="qa" @click="setAllChecked(false)">全部未交</van-tag>
              <van-tag plain type="primary" class="add-tag" @click="openPicker('member')">+ 添加</van-tag>
            </span>
          </div>
          <van-cell-group v-if="form.members.length" inset class="member-box">
            <van-cell v-for="(m, i) in form.members" :key="m.memberId">
              <template #icon>
                <span
                  class="m-avatar"
                  :style="{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }"
                >{{ m.name.slice(0, 1) }}</span>
              </template>
              <template #title>
                <van-checkbox :model-value="m.checked" shape="square" class="m-check"
                  @update:model-value="m.checked = !m.checked">
                  <span :class="{ checked: m.checked }">{{ m.name }}</span>
                </van-checkbox>
              </template>
              <template #value>
                <van-icon name="clear" class="m-del" @click="form.members = form.members.filter((x) => x.memberId !== m.memberId)" />
              </template>
            </van-cell>
          </van-cell-group>
          <div v-else class="member-empty">还没有添加成员，添加后可以逐个勾选进度</div>
          <div v-if="form.members.length" class="undone-row">
            <span class="undone-text">未交 {{ form.members.filter((m) => !m.checked).length }} 人：{{ form.members.filter((m) => !m.checked).map((m) => m.name).join('、') || '—' }}</span>
            <van-button size="mini" plain type="primary" @click="copyUndone">复制名单</van-button>
          </div>
        </template>
        <div v-else class="member-empty">个人事务只有你自己可见</div>

        <div class="form-actions">
          <van-button v-if="isEdit" round plain type="danger" class="btn-third" @click="onDelete">删除</van-button>
          <van-button v-if="isEdit" round plain type="primary" class="btn-third" @click="toggleDone">
            {{ form.done ? '重新打开' : '标记完成' }}
          </van-button>
          <van-button round block type="primary" native-type="submit">保存</van-button>
        </div>
      </van-form>
    </div>

    <van-calendar v-model:show="calShow" :min-date="minDate" :max-date="maxDate" @confirm="onConfirmDate" />

    <!-- 选人（负责人 / 添加成员共用）：负责人点选即回填，添加成员连续点选 -->
    <van-popup v-model:show="pickerShow" position="bottom" round :style="{ height: '70%' }" close-on-click-overlay>
      <van-search v-model="memberSearch" placeholder="搜索姓名 / 学号 / 宿舍" />
      <div class="picker-bar">
        <span class="picker-tip">
          {{ pickerMode === 'owner' ? '点姓名设为负责人' : '点姓名加入清单，可连续添加' }}
        </span>
        <van-tag
          v-if="pickerMode === 'member'"
          plain
          type="success"
          class="add-all"
          @click="addAllMembers"
        >
          添加全部成员
        </van-tag>
      </div>
      <div class="member-list">
        <van-cell-group>
          <van-cell
            v-for="m in filteredMembers"
            :key="m.id"
            :title="m.name"
            :label="`学号 ${m.studentId || '—'}${m.dorm ? ' · ' + m.dorm : ''}`"
            clickable
            @click="onPickMember(m)"
          >
            <template #value>
              <van-tag v-if="pickerMode === 'member' && addedIds.has(m.id)" type="success">已加</van-tag>
              <van-tag v-else-if="m.duty" type="primary">{{ m.duty }}</van-tag>
            </template>
          </van-cell>
        </van-cell-group>
        <van-empty v-if="!filteredMembers.length" description="没有匹配的成员" />
      </div>
    </van-popup>
  </van-popup>
</template>

<style scoped>
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px 8px;
  font-size: 13px;
  font-weight: 600;
}
.add-tag {
  cursor: pointer;
  font-weight: 400;
}
.quick-actions {
  display: flex;
  gap: 8px;
}
.qa {
  cursor: pointer;
  font-weight: 400;
}
.m-avatar {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  margin-top: 2px;
}
.picker-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px 8px;
}
.picker-tip {
  font-size: 11px;
  color: #969799;
}
.add-all {
  cursor: pointer;
  font-weight: 400;
}
.member-box {
  max-height: 40vh;
  overflow-y: auto;
}
.m-check {
  width: 100%;
}
.m-check .checked {
  color: #c8c9cc;
  text-decoration: line-through;
}
.m-del {
  font-size: 16px;
  color: #c8c9cc;
  cursor: pointer;
}
.member-empty {
  padding: 12px 20px;
  font-size: 12px;
  color: #969799;
}
.undone-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px 0;
}
.undone-text {
  flex: 1;
  font-size: 12px;
  color: #969799;
  line-height: 1.5;
}
.form-actions {
  display: flex;
  gap: 10px;
}
.btn-third {
  flex: 0 0 88px;
}
.member-list {
  height: calc(100% - 76px);
  overflow-y: auto;
}
</style>
