// 名册 Excel 解析（供名册页与身份选择页共用）
// 返回 [{ name, studentId, gender, dorm, phone, duty, note }] 或抛错
export async function parseRosterFile(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const read = (opts) => XLSX.read(buf, opts)

  const HEADER_MAP = {
    name: ['姓名', '名字', 'name'],
    studentId: ['学号', '学籍号', 'student id', 'studentid'],
    gender: ['性别', 'gender'],
    dorm: ['宿舍', '宿舍号', '寝室', '寝室号', 'dorm', 'room'],
    phone: ['手机', '手机号', '电话', '联系电话', 'phone', 'tel'],
    duty: ['职务', '班级职务', '岗位', 'duty'],
    note: ['备注', '说明', 'note', 'remark'],
  }
  const str = (v) => String(v ?? '').trim()

  // 先按 UTF-8 解，表头识别失败再按 GBK 重试
  let parsed = tryParse(read, [])
  if (parsed === null) parsed = tryParse(read, [{ type: 'array', codepage: 936 }])
  if (parsed === null) throw new Error('没有识别到「姓名」列')
  return parsed

  function tryParse(opts) {
    let wb
    try {
      wb = read({ ...opts, type: 'array' })
    } catch {
      return null
    }
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) return null
    const headers = rows[0].map((h) => str(h).toLowerCase())
    const colOf = {}
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      const idx = headers.findIndex((h) => aliases.some((a) => h === a.toLowerCase()))
      if (idx >= 0) colOf[field] = idx
    }
    if (colOf.name === undefined) return null
    const pick = (r, f) => (colOf[f] !== undefined ? str(r[colOf[f]]) : '')
    return rows
      .slice(1)
      .map((r) => ({
        name: pick(r, 'name'),
        studentId: pick(r, 'studentId'),
        gender: pick(r, 'gender'),
        dorm: pick(r, 'dorm'),
        phone: pick(r, 'phone'),
        duty: pick(r, 'duty'),
        note: pick(r, 'note'),
      }))
      .filter((m) => m.name)
      .map((m) => ({ ...m }))
  }
}
