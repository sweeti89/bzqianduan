// 访问口令锁：保护本设备上的班级数据（姓名学号手机属于个人信息）。
// - 口令只存 PBKDF2-SHA256（15 万次迭代）加盐哈希，不存明文
// - 解锁状态记在 sessionStorage：关掉标签页/重开浏览器需重新输入
// - 旧版（单轮 SHA-256）哈希在验证成功后自动升级为新格式
// - 忘记口令：只能"清空全部本地数据重置"（本地工具的合理取舍）
import { reactive } from 'vue'
import { load, save, remove } from './db'

const KEY = 'lock'
const ITER = 150000

export const lockState = reactive({
  on: !!load(KEY, null)?.hash,
  unlocked: sessionStorage.getItem('banwei-unlocked') === '1',
})

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16))
}

// PBKDF2-SHA256，输出 256 位十六进制
async function derive(saltHex, pin, iterations = ITER) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    key,
    256
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 旧版（v1.1.x 之前）的两代单轮 SHA-256 哈希，验证成功后自动升级
async function legacyDerive(salt, len, pin) {
  const text = len ? `${salt}:${len}:${pin}` : `${salt}:${pin}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function setPin(pin) {
  const salt = randomHex(16)
  save(KEY, { salt, hash: await derive(salt, pin), iter: ITER })
  lockState.on = true
}

export async function verify(pin) {
  const cfg = load(KEY, null)
  if (!cfg) return true
  const h = cfg.iter
    ? await derive(cfg.salt, pin, cfg.iter)
    : await legacyDerive(cfg.salt, cfg.len, pin)
  if (h === cfg.hash && !cfg.iter) {
    // 旧格式验证成功 → 立即升级为新格式
    await setPin(pin)
  }
  return h === cfg.hash
}

export function markUnlocked() {
  sessionStorage.setItem('banwei-unlocked', '1')
  lockState.unlocked = true
}

export function lockNow() {
  sessionStorage.removeItem('banwei-unlocked')
  lockState.unlocked = false
}

// 关闭口令（需先验证旧口令）
export async function disablePin(pin) {
  if (!(await verify(pin))) return false
  remove(KEY)
  lockState.on = false
  return true
}

// 忘记口令的自救：清空全部本地数据（含口令、业务数据与凭证附件）
export function resetAll() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith('banwei:')) localStorage.removeItem(k)
  }
  sessionStorage.clear()
  // 凭证附件与壁纸存放在独立的 IndexedDB 库，一并删除
  const req = indexedDB.deleteDatabase('banwei-attach')
  req.onsuccess = req.onerror = req.onblocked = () => location.reload()
}
