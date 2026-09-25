<script setup>
import { computed, ref } from 'vue'
import { showToast } from 'vant'
import { useRosterStore } from '../stores/roster'
import { useIdentityStore } from '../stores/identity'
import { hasPin, verifyPersonPin, setPersonPin } from '../data/pins'

const roster = useRosterStore()
const identity = useIdentityStore()
const search = ref('')

// 流程：list 选人 → 该身份已有密码则 verify，没有则 set（首次，输两遍）→ 认领
const mode = ref('list') // list | verify | set
const pendingMember = ref(null)
const pwd = ref('')
const confirmPwd = ref('')
const errorText = ref('')
let checking = false

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return roster.members
  return roster.members.filter((m) =>
    [m.name, m.studentId].some((v) => String(v || '').toLowerCase().includes(q))
  )
})

function pick(m) {
  if (!m) return
  pendingMember.value = m
  pwd.value = ''
  confirmPwd.value = ''
  errorText.value = ''
  mode.value = hasPin(m.id) ? 'verify' : 'set'
}

function back() {
  mode.value = 'list'
  pendingMember.value = null
  pwd.value = ''
  confirmPwd.value = ''
  errorText.value = ''
}

async function submitVerify() {
  if (checking) return
  checking = true
  try {
    if (await verifyPersonPin(pendingMember.value.id, pwd.value)) {
      claim()
    } else {
      errorText.value = '密码不对'
      pwd.value = ''
      showToast('密码不对')
    }
  } finally {
    checking = false
  }
}

async function submitSet() {
  if (checking) return
  if (pwd.value.length < 4) {
    errorText.value = '至少 4 位'
    return showToast('至少 4 位')
  }
  if (confirmPwd.value !== pwd.value) {
    errorText.value = '两次输入不一致'
    confirmPwd.value = ''
    return showToast('两次输入不一致')
  }
  checking = true
  try {
    await setPersonPin(pendingMember.value.id, pwd.value)
    claim()
  } finally {
    checking = false
  }
}

function claim() {
  identity.setIdentity(pendingMember.value.id)
  showToast(`身份已设为：${pendingMember.value.name}`)
}
</script>

<template>
  <div class="picker-page">
    <div class="picker-head">
      <div class="picker-logo"><van-icon name="checked" /></div>
      <div class="picker-title">班委助手</div>
      <div class="picker-sub">
        {{ mode === 'list'
          ? '在名册里点选「你是谁」，选择后需输入该身份的个人密码'
          : mode === 'verify'
            ? `${pendingMember?.name}，请输入你的个人密码`
            : `首次使用：为「${pendingMember?.name}」设置个人密码` }}
      </div>
    </div>

    <!-- 选人 -->
    <template v-if="mode === 'list'">
      <van-search v-model="search" placeholder="搜索姓名 / 学号" />
      <div class="picker-list">
        <van-cell-group inset>
          <van-cell
            v-for="m in filtered"
            :key="m.id"
            :title="m.name"
            :label="m.studentId"
            clickable
            @click="pick(m)"
          >
            <template #value>
              <van-tag v-if="m.duty" type="primary">{{ m.duty }}</van-tag>
            </template>
          </van-cell>
        </van-cell-group>
        <van-empty v-if="!filtered.length" description="没有匹配的成员" />
      </div>
    </template>

    <!-- 验证已有密码 -->
    <template v-else-if="mode === 'verify'">
      <div class="pin-box">
        <van-field
          v-model="pwd"
          type="password"
          label="个人密码"
          placeholder="输入该身份的个人密码"
          :error="!!errorText"
          clearable
        />
        <van-button block round type="primary" class="pin-btn" @click="submitVerify">进入</van-button>
        <div class="pin-back" @click="back">← 返回重新选择</div>
      </div>
    </template>

    <!-- 首次设置密码 -->
    <template v-else>
      <div class="pin-box">
        <van-field
          v-model="pwd"
          type="password"
          label="设置密码"
          placeholder="字母+数字，至少 4 位"
          clearable
        />
        <van-field
          v-model="confirmPwd"
          type="password"
          label="确认密码"
          placeholder="再输入一次"
          clearable
        />
        <div v-if="errorText" class="pin-error">{{ errorText }}</div>
        <van-button block round type="primary" class="pin-btn" @click="submitSet">保存并进入</van-button>
        <div class="pin-back" @click="back">← 返回重新选择</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.picker-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 30px;
}
.picker-head {
  padding: 12vh 24px 20px;
  background: linear-gradient(160deg, #1989fa 0%, #3aa2ff 60%, #6cc0ff 100%);
  color: #fff;
  text-align: center;
}
.picker-logo {
  font-size: 44px;
  margin-bottom: 10px;
}
.picker-title {
  font-size: 22px;
  font-weight: 700;
}
.picker-sub {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.92;
  line-height: 1.6;
}
.picker-list {
  margin-top: 12px;
}
.pin-box {
  margin-top: 20px;
  padding: 0 16px;
}
.pin-btn {
  margin-top: 20px;
}
.pin-back {
  margin-top: 18px;
  text-align: center;
  font-size: 12px;
  color: #969799;
  cursor: pointer;
}
.pin-error {
  margin-top: 10px;
  text-align: center;
  font-size: 12px;
  color: #ee0a24;
}
</style>
