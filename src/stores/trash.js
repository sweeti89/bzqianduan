// 回收站：删除的事务/待办/账目保留 7 天可恢复（本机数据，不参与联机同步）
// 账目"移入回收站"时凭证附件保留（恢复后仍可用），"彻底删除"才清理附件
import { defineStore } from 'pinia'
import { load, save, uid } from '../data/db'
import { deleteByRecord } from '../data/attachments'
import { useAffairStore } from './affairs'
import { useTodoStore } from './todos'
import { useFeesStore } from './fees'

const KEY = 'trash'
const RETENTION = 7 * 24 * 3600 * 1000

export const TRASH_TYPE_META = {
  affair: { label: '事务', tag: 'primary' },
  todo: { label: '待办', tag: 'warning' },
  fee: { label: '账目', tag: 'danger' },
}

export const useTrashStore = defineStore('trash', {
  state: () => ({ items: load(KEY, []) }),

  getters: {
    list(state) {
      const cutoff = Date.now() - RETENTION
      return [...state.items]
        .filter((i) => i.deletedAt > cutoff)
        .sort((a, b) => b.deletedAt - a.deletedAt)
    },
  },

  actions: {
    persist() {
      const cutoff = Date.now() - RETENTION
      save(KEY, this.items.filter((i) => i.deletedAt > cutoff))
    },
    add(type, data) {
      this.items.push({
        id: uid(),
        type,
        data: JSON.parse(JSON.stringify(data)),
        deletedAt: Date.now(),
      })
      this.persist()
    },
    restore(id) {
      const idx = this.items.findIndex((i) => i.id === id)
      if (idx < 0) return false
      const item = this.items[idx]
      if (item.type === 'affair') useAffairStore().restoreItem(item.data)
      else if (item.type === 'todo') useTodoStore().restoreItem(item.data)
      else if (item.type === 'fee') useFeesStore().restoreRecord(item.data)
      this.items.splice(idx, 1)
      this.persist()
      return true
    },
    async purge(id) {
      const idx = this.items.findIndex((i) => i.id === id)
      if (idx < 0) return
      const item = this.items[idx]
      if (item.type === 'fee') {
        try {
          await deleteByRecord(item.data.id)
        } catch (e) {
          console.error('清理凭证失败', e)
        }
      }
      this.items.splice(idx, 1)
      this.persist()
    },
    async clearAll() {
      const feeItems = this.items.filter((i) => i.type === 'fee')
      for (const item of feeItems) {
        await deleteByRecord(item.data.id).catch(() => {})
      }
      this.items = []
      this.persist()
    },
  },
})
