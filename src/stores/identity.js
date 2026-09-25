// 身份与权限：本机绑定"我是谁"（从名册选），角色由名册职务自动判定。
// - duty 含"班长" → monitor（全部权限，含期初余额设置/修改）
// - duty 有其他职务 → committee（班委：日常全权，账目受限）
// - duty 为空 → member（普通同学：只读 + 隐私隐藏）
// 注意：这是 UI 层权限，防误操作与随意改动；联机场景下不防存心篡改。
import { defineStore } from 'pinia'
import { load, save } from '../data/db'
import { useRosterStore } from './roster'

const KEY = 'identity'

export const ROLE_LABEL = { monitor: '班长', committee: '班委', member: '同学' }

export const useIdentityStore = defineStore('identity', {
  state: () => ({ memberId: load(KEY, null) }),

  getters: {
    member(state) {
      if (!state.memberId) return null
      return useRosterStore().members.find((m) => m.id === state.memberId) || null
    },
    role(state) {
      if (!state.memberId) return 'guest'
      const m = this.member
      // 身份对应的人被从名册删除时，按普通同学处理
      if (!m) return 'member'
      const duty = (m.duty || '').trim()
      if (duty.includes('班长')) return 'monitor'
      return duty ? 'committee' : 'member'
    },
    isMonitor() {
      return this.role === 'monitor'
    },
    canManage() {
      return this.role === 'monitor' || this.role === 'committee'
    },
    label() {
      return ROLE_LABEL[this.role] || '未选择身份'
    },
  },

  actions: {
    persist() {
      save(KEY, this.memberId)
    },
    setIdentity(memberId) {
      this.memberId = memberId
      this.persist()
    },
    clearIdentity() {
      this.memberId = null
      this.persist()
    },
  },
})
