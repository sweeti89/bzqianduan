// 个人密码：按成员索引的身份验证哈希（banwei:pins），随联机同步。
// 防止别人在自己设备上冒选他人身份；忘记密码由班长重置。
// - PBKDF2-SHA256（15 万次迭代）加盐哈希，不存明文
// - 旧版（单轮 SHA-256）哈希在验证成功后自动升级
import { load, save } from './db'

const KEY = 'pins'
const ITER = 150000

function getPins() {
  return load(KEY, {})
}

export function hasPin(memberId) {
  return !!getPins()[memberId]
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16))
}

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

async function legacyDerive(salt, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function setPersonPin(memberId, pin) {
  const pins = getPins()
  const salt = randomHex(16)
  pins[memberId] = { salt, hash: await derive(salt, pin), iter: ITER }
  save(KEY, pins)
}

export async function verifyPersonPin(memberId, pin) {
  const rec = getPins()[memberId]
  if (!rec) return true
  if (rec.iter) return (await derive(rec.salt, pin, rec.iter)) === rec.hash
  const legacy = await legacyDerive(rec.salt, pin)
  if (legacy === rec.hash) {
    await setPersonPin(memberId, pin)
    return true
  }
  return false
}

export function clearPersonPin(memberId) {
  const pins = getPins()
  delete pins[memberId]
  save(KEY, pins)
}
