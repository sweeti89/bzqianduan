// 本地数据层：所有数据以 JSON 存在浏览器 localStorage。
// 关键点：业务代码（store/页面）只认这层接口，以后接云数据库（联机版）
// 只需要把这层换成远程实现，页面不用动。

const PREFIX = 'banwei:'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key)
}

// 联机同步钩子：任何业务数据保存后触发（由 sync.js 注册，db 层不感知同步细节）
let saveHook = null
export function setSaveHook(fn) {
  saveHook = fn
}

export function save(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
  try {
    saveHook?.(key)
  } catch (e) {
    console.error('sync hook error', e)
  }
}

// 导出全部业务数据（备份用）
export function exportAll() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) {
      data[k.slice(PREFIX.length)] = localStorage.getItem(k)
    }
  }
  return data
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
