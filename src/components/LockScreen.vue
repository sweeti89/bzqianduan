<script setup>
import { ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { verify, markUnlocked, resetAll } from '../data/lock'

const emit = defineEmits(['unlocked'])

const value = ref('')
const errorText = ref('')
let checking = false

async function onSubmit() {
  if (checking) return
  if (!value.value.trim()) return showToast('请输入口令')
  checking = true
  try {
    if (await verify(value.value)) {
      markUnlocked()
      emit('unlocked')
    } else {
      errorText.value = '口令不对，再试试'
      showToast('口令不对，再试试')
      value.value = ''
    }
  } finally {
    checking = false
  }
}

async function forget() {
  try {
    await showConfirmDialog({
      title: '重置应用',
      message:
        '忘记口令只能清空本设备的全部数据（名册、班费、事务、口令）并重新开始。若云端开着联机同步，重新开启后可再拉取云端数据。确定吗？',
    })
  } catch {
    return
  }
  resetAll()
}
</script>

<template>
  <div class="lock-screen">
    <div class="lock-body">
      <div class="lock-icon">
        <van-icon name="shield-o" />
      </div>
      <div class="lock-title">班委助手已锁定</div>
      <div class="lock-sub">输入访问口令解锁</div>
      <van-form @submit="onSubmit" class="lock-form">
        <van-field
          v-model="value"
          type="password"
          placeholder="访问口令"
          :error="!!errorText"
          autocomplete="current-password"
          class="lock-field"
        />
        <van-button block round type="primary" native-type="submit" class="lock-btn">
          解锁
        </van-button>
      </van-form>
      <div class="lock-forget" @click="forget">忘记口令？</div>
    </div>
  </div>
</template>

<style scoped>
.lock-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: linear-gradient(160deg, #1989fa 0%, #3aa2ff 55%, #6cc0ff 100%);
  display: flex;
  flex-direction: column;
}
.lock-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16vh;
  color: #fff;
}
.lock-icon {
  font-size: 52px;
  margin-bottom: 14px;
}
.lock-title {
  font-size: 20px;
  font-weight: 700;
}
.lock-sub {
  font-size: 13px;
  opacity: 0.9;
  margin: 8px 0 26px;
}
.lock-form {
  width: 78vw;
}
.lock-screen :deep(.van-field) {
  border-radius: 8px;
  overflow: hidden;
}
.lock-btn {
  margin-top: 16px;
}
.lock-forget {
  margin-top: 30px;
  font-size: 12px;
  opacity: 0.85;
  text-decoration: underline dotted;
  cursor: pointer;
}
</style>
