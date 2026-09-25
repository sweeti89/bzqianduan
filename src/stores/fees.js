import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import { load, save, uid } from '../data/db'

const KEY = 'fees'

function initialState() {
  const saved = load(KEY, null)
  if (saved && typeof saved === 'object') {
    return {
      initialBalance: saved.initialBalance ?? null,
      records: Array.isArray(saved.records) ? saved.records : [],
    }
  }
  return { initialBalance: null, records: [] }
}

const round = (v) => Math.round(Number(v) * 100) / 100

export const useFeesStore = defineStore('fees', {
  state: initialState,

  getters: {
    totalIncome(state) {
      return round(
        state.records.filter((r) => r.type === '收入').reduce((s, r) => s + r.amount, 0)
      )
    },
    totalExpense(state) {
      return round(
        state.records.filter((r) => r.type === '支出').reduce((s, r) => s + r.amount, 0)
      )
    },
    balance(state) {
      return round((state.initialBalance || 0) + this.totalIncome - this.totalExpense)
    },
    monthIncome(state) {
      const ym = dayjs().format('YYYY-MM')
      return round(
        state.records
          .filter((r) => r.type === '收入' && (r.date || '').startsWith(ym))
          .reduce((s, r) => s + r.amount, 0)
      )
    },
    monthExpense(state) {
      const ym = dayjs().format('YYYY-MM')
      return round(
        state.records
          .filter((r) => r.type === '支出' && (r.date || '').startsWith(ym))
          .reduce((s, r) => s + r.amount, 0)
      )
    },
    // 支出按分类汇总，金额从多到少
    byCategory(state) {
      const map = new Map()
      for (const r of state.records) {
        if (r.type !== '支出') continue
        const key = (r.category || '').trim() || '未分类'
        map.set(key, (map.get(key) || 0) + r.amount)
      }
      return [...map.entries()]
        .map(([name, amount]) => ({ name, amount: round(amount) }))
        .sort((a, b) => b.amount - a.amount)
    },
    sortedRecords(state) {
      return [...state.records].sort(
        (a, b) =>
          (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)
      )
    },
  },

  actions: {
    persist() {
      save(KEY, { initialBalance: this.initialBalance, records: this.records })
    },
    setInitialBalance(v) {
      this.initialBalance = round(v)
      this.persist()
    },
    // 返回新建的记录（凭证文件要挂到它的 id 上）
    addRecord({ type, amount, date, category = '', handler = '', note = '', attachments = [] }) {
      const rec = {
        id: uid(),
        type,
        amount: round(amount),
        date,
        category: (category || '').trim(),
        handler: (handler || '').trim(),
        note: (note || '').trim(),
        attachments,
        createdAt: Date.now(),
      }
      this.records.push(rec)
      this.persist()
      return rec
    },
    updateRecord(id, data) {
      const i = this.records.findIndex((r) => r.id === id)
      if (i >= 0) {
        const next = { ...this.records[i], ...data, id }
        // 只在本次给了金额时才覆盖，避免部分更新（如只补凭证）把金额冲成 NaN
        if (data.amount !== undefined) next.amount = round(data.amount)
        this.records[i] = next
        this.persist()
      }
    },
    // 移入回收站：凭证附件保留（恢复后仍可用），"彻底删除"才清理
    archiveRecord(id) {
      this.records = this.records.filter((r) => r.id !== id)
      this.persist()
    },
    // 回收站恢复
    restoreRecord(data) {
      this.records.push(JSON.parse(JSON.stringify(data)))
      this.persist()
    },
  },
})
