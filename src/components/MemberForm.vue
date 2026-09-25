<script setup>
import { computed, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useRosterStore } from '../stores/roster'
import { hasPin, clearPersonPin } from '../data/pins'

const show = defineModel('show', { type: Boolean, default: false })
const props = defineProps({
  // null = 新增，否则为编辑
  member: { type: Object, default: null },
  // 权限：只有班长能改职务、删除成员
  canEditDuty: { type: Boolean, default: true },
  canDelete: { type: Boolean, default: true },
})
const emit = defineEmits(['saved'])

const store = useRosterStore()
const isEdit = computed(() => !!props.member)

function emptyForm() {
  return { name: '', studentId: '', gender: '', dorm: '', phone: '', duty: '', note: '' }
}
const form = ref(emptyForm())
const hasPinFor = ref(false)

watch(show, (v) => {
  if (v) {
    form.value = props.member ? { ...props.member } : emptyForm()
    hasPinFor.value = props.member ? hasPin(props.member.id) : false
  }
})

async function onSubmit() {
  const data = { ...form.value }
  data.name = data.name.trim()
  if (!data.name) return showToast('请填写姓名')
  data.studentId = data.studentId.trim()
  if (data.studentId) {
    const dup = store.findByStudentId(data.studentId)
    if (dup && dup.id !== data.id) {
      try {
        await showConfirmDialog({
          title: '学号重复',
          message: `学号 ${data.studentId} 已存在（${dup.name}），仍要保存吗？`,
        })
      } catch {
        return
      }
    }
  }
  if (isEdit.value) store.updateMember(data.id, data)
  else store.addMember(data)
  show.value = false
  emit('saved')
}

async function onDelete() {
  try {
    await showConfirmDialog({
      title: '删除成员',
      message: `确定删除「${form.value.name}」吗？删除后不可恢复。`,
    })
  } catch {
    return
  }
  store.removeMember(form.value.id)
  show.value = false
  showToast('已删除')
}

// 班长重置某成员的个人密码：该成员下次选身份时重新设置
async function resetPersonPin() {
  try {
    await showConfirmDialog({
      title: '重置个人密码',
      message: `将清除「${form.value.name}」的个人密码，该成员下次选择身份时需要重新设置。确定吗？`,
    })
  } catch {
    return
  }
  clearPersonPin(props.member.id)
  hasPinFor.value = false
  showToast('已重置')
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '88%' }">
    <div class="form-wrap">
      <div class="form-title">{{ isEdit ? '编辑成员' : '添加成员' }}</div>
      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field v-model="form.name" label="姓名" placeholder="必填" required maxlength="20" />
          <van-field v-model="form.studentId" label="学号" type="tel" maxlength="20" placeholder="如 2024010101" />
          <van-field v-model="form.gender" label="性别" maxlength="2" placeholder="男 / 女" />
          <van-field v-model="form.dorm" label="宿舍" maxlength="20" placeholder="如 1-301" />
          <van-field v-model="form.phone" label="手机" type="tel" maxlength="15" />
          <van-field
            v-model="form.duty"
            label="职务"
            maxlength="20"
            placeholder="班长 / 团支书 / 学习委员…"
            :disabled="!canEditDuty"
          />
          <van-field v-model="form.note" label="备注" type="textarea" rows="1" autosize maxlength="100" />
        </van-cell-group>
        <div v-if="canDelete && isEdit && hasPinFor" class="pin-reset">
          <van-button size="small" plain type="warning" @click="resetPersonPin">
            重置该成员的个人密码
          </van-button>
        </div>
        <div class="form-actions">
          <van-button
            v-if="isEdit && canDelete"
            round
            plain
            type="danger"
            class="btn-delete"
            @click="onDelete"
          >
            删除
          </van-button>
          <van-button round block type="primary" native-type="submit">保存</van-button>
        </div>
      </van-form>
    </div>
  </van-popup>
</template>

<style scoped>
.form-actions {
  display: flex;
  gap: 12px;
}
.btn-delete {
  flex: 0 0 96px;
}
.pin-reset {
  padding: 12px 32px 0;
}
</style>
