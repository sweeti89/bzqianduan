import { defineStore } from 'pinia'
import { load, save, uid } from '../data/db'

const KEY = 'todos'

function initialState() {
  const items = load(KEY, [])
  // 迁移：旧版"个人"待办没有归属字段，归到本机当时使用的身份名下
  const myId = load('identity', null)
  let changed = false
  for (const t of items) {
    if (t.type === '个人' && !t.ownerId && myId) {
      t.ownerId = myId
      changed = true
    }
  }
  if (changed) save(KEY, items)
  return items
}

export const useTodoStore = defineStore('todos', {
  state: () => ({ items: initialState() }),

  getters: {
    sorted(state) {
      return [...state.items].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        const da = a.date || '9999-12-31'
        const db = b.date || '9999-12-31'
        if (da !== db) return da < db ? -1 : 1
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
    },
    pendingCount(state) {
      return state.items.filter((t) => !t.done).length
    },
  },

  actions: {
    persist() {
      save(KEY, this.items)
    },
    add({ title, date = '', type = '个人', ownerId = null }) {
      this.items.push({
        id: uid(),
        title,
        date,
        type,
        ownerId,
        done: false,
        createdAt: Date.now(),
      })
      this.persist()
    },
    toggle(id) {
      const t = this.items.find((t) => t.id === id)
      if (t) {
        t.done = !t.done
        this.persist()
      }
    },
    remove(id) {
      this.items = this.items.filter((t) => t.id !== id)
      this.persist()
    },
    // 回收站恢复
    restoreItem(data) {
      this.items.push(JSON.parse(JSON.stringify(data)))
      this.persist()
    },
  },
})
