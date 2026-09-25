import { defineStore } from 'pinia'
import { load, save, uid } from '../data/db'
import seedRoster from '../data/seed.json'

const KEY = 'roster'

// 首次使用（本地还没有数据）时，用内置的班级名册初始化；
// 用户之后清空名册也不会重新触发（保存过空数组就视为已有数据）。
function initialState() {
  const saved = load(KEY, null)
  if (Array.isArray(saved)) {
    // 迁移：老数据里没有任何"班长"职务时，把班长（闫天昊）补上，
    // 否则权限体系没有管理员（本应用为单一班级定制）
    if (!saved.some((m) => (m.duty || '').includes('班长'))) {
      const monitor = saved.find((m) => m.name === '闫天昊')
      if (monitor) monitor.duty = '班长'
    }
    save(KEY, saved)
    return saved
  }
  const seeded = seedRoster.map((m) => ({
    gender: '',
    dorm: '',
    phone: '',
    duty: '',
    note: '',
    id: uid(),
    ...m,
  }))
  save(KEY, seeded)
  return seeded
}

// Excel 导入时自动识别列用的表头别名（匹配前会统一转小写、去空格）
export const HEADER_MAP = {
  name: ['姓名', '名字', 'name'],
  studentId: ['学号', '学籍号', 'student id', 'studentid'],
  gender: ['性别', 'gender'],
  dorm: ['宿舍', '宿舍号', '寝室', '寝室号', 'dorm', 'room'],
  phone: ['手机', '手机号', '电话', '联系电话', 'phone', 'tel'],
  duty: ['职务', '班级职务', '岗位', 'duty'],
  note: ['备注', '说明', 'note', 'remark'],
}

export const useRosterStore = defineStore('roster', {
  state: () => ({ members: initialState() }),

  getters: {
    stats(state) {
      const dorms = new Set()
      let committee = 0
      for (const m of state.members) {
        if ((m.dorm || '').trim()) dorms.add(m.dorm.trim())
        if ((m.duty || '').trim()) committee++
      }
      return { total: state.members.length, dormCount: dorms.size, committeeCount: committee }
    },

    dormGroups(state) {
      const map = new Map()
      for (const m of state.members) {
        const key = (m.dorm || '').trim() || '未分配宿舍'
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(m)
      }
      const byStudentId = (a, b) =>
        String(a.studentId || '').localeCompare(String(b.studentId || ''), 'zh', {
          numeric: true,
        }) || String(a.name || '').localeCompare(String(b.name || ''), 'zh')
      const groups = [...map.entries()].map(([dorm, list]) => ({
        dorm,
        list: [...list].sort(byStudentId),
      }))
      groups.sort((a, b) => {
        if (a.dorm === '未分配宿舍') return 1
        if (b.dorm === '未分配宿舍') return -1
        return a.dorm.localeCompare(b.dorm, 'zh', { numeric: true })
      })
      return groups
    },
  },

  actions: {
    persist() {
      save(KEY, this.members)
    },
    addMember(data) {
      this.members.push({ ...data, id: uid() })
      this.persist()
    },
    updateMember(id, data) {
      const i = this.members.findIndex((m) => m.id === id)
      if (i >= 0) {
        this.members[i] = { ...this.members[i], ...data, id }
        this.persist()
      }
    },
    removeMember(id) {
      this.members = this.members.filter((m) => m.id !== id)
      this.persist()
    },
    findByStudentId(studentId) {
      return this.members.find((m) => (m.studentId || '') === studentId)
    },
    // 批量导入（按学号合并）：
    // - 学号已存在 → 用文件里的非空字段更新已有成员（空单元格不会清掉已填资料）
    // - 学号不存在 → 新增
    // - 同一文件里学号重复 → 只处理第一条，其余跳过
    importMembers(list) {
      const bySid = new Map()
      for (const m of this.members) {
        const sid = (m.studentId || '').trim()
        if (sid) bySid.set(sid, m)
      }
      const fileSeen = new Set()
      let added = 0
      let updated = 0
      let skipped = 0
      for (const row of list) {
        const sid = (row.studentId || '').trim()
        if (sid && fileSeen.has(sid)) {
          skipped++
          continue
        }
        if (sid) fileSeen.add(sid)
        const existing = sid ? bySid.get(sid) : undefined
        if (existing) {
          for (const [k, v] of Object.entries(row)) {
            if (k === 'studentId') continue
            const val = (v ?? '').toString().trim()
            if (val) existing[k] = val
          }
          updated++
        } else {
          const member = { ...row, id: uid() }
          this.members.push(member)
          if (sid) bySid.set(sid, member)
          added++
        }
      }
      this.persist()
      return { added, updated, skipped }
    },
  },
})
