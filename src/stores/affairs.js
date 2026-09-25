import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import { load, save, uid } from '../data/db'

const KEY = 'affairs'

// 事务状态：未开始 / 进行中 / 已结束
export const AFFAIR_STATUS = {
  notstarted: { label: '未开始', tag: 'default', color: '#c8c9cc' },
  doing: { label: '进行中', tag: 'primary', color: '#1989fa' },
  ended: { label: '已结束', tag: 'success', color: '#07c160' },
}

export const useAffairStore = defineStore('affairs', {
  state: () => ({
    items: load(KEY, []).map((a) => ({
      ...a,
      // 迁移：旧数据用 done 布尔，统一成状态字段
      status: a.status || (a.done ? 'ended' : 'doing'),
    })),
  }),

  getters: {
    sorted(state) {
      return [...state.items].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        const da = a.deadline || '9999-12-31'
        const db = b.deadline || '9999-12-31'
        if (da !== db) return da < db ? -1 : 1
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
    },
    pendingCount(state) {
      return state.items.filter((t) => !t.done).length
    },
    // 临近截止：未完成且已设截止日，含已过期与 3 天内到期
    dueSoon(state) {
      const limit = dayjs().add(3, 'day').format('YYYY-MM-DD')
      return state.items
        .filter((t) => !t.done && t.deadline && t.deadline <= limit)
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
    },
  },

  actions: {
    persist() {
      save(KEY, this.items)
    },
    add({ title, note = '', deadline = '', owner = '', members = [], scope = 'class', ownerId = null, status = 'doing' }) {
      const rec = {
        id: uid(),
        title: title.trim(),
        note: (note || '').trim(),
        deadline,
        owner: (owner || '').trim(),
        done: status === 'ended',
        status,
        members,
        scope,
        ownerId,
        createdAt: Date.now(),
      }
      this.items.push(rec)
      this.persist()
      return rec
    },
    update(id, data) {
      const i = this.items.findIndex((t) => t.id === id)
      if (i >= 0) {
        const next = { ...this.items[i], ...data, id }
        // 状态与 done 保持同步
        if (data.status) next.done = data.status === 'ended'
        this.items[i] = next
        this.persist()
      }
    },
    // 快捷切换状态
    setStatus(id, status) {
      this.update(id, { status })
    },
    remove(id) {
      this.items = this.items.filter((t) => t.id !== id)
      this.persist()
    },
    // 回收站恢复
    restoreItem(data) {
      const rec = JSON.parse(JSON.stringify(data))
      if (!rec.status) rec.status = rec.done ? 'ended' : 'doing'
      this.items.push(rec)
      this.persist()
    },
    toggleMember(id, memberId) {
      const t = this.items.find((t) => t.id === id)
      if (!t) return
      const m = t.members.find((m) => m.memberId === memberId)
      if (m) {
        m.checked = !m.checked
        this.persist()
      }
    },
  },
})
