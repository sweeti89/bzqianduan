// 联机同步（LeanCloud 免费版）：本地优先 + 云端整包同步
// - 结构化数据（名册/待办/班费/事务/个人密码哈希）AES-GCM 加密后存云端
//   同步口令由班委线下共享，绝不入云、不入代码库
// - 整包覆盖、以最后保存为准；pull 前逐 key 校验数据结构
// - leancloud-storage 按需动态加载（未开联机的设备不加载 SDK）
import { load, save, setSaveHook } from './db'

const CFG_KEY = 'sync-config'
const META_KEY = 'sync-meta'
const CLASS_NAME = 'ClassData'
const SYNC_KEYS = ['roster', 'todos', 'fees', 'affairs', 'pins']
const PBKDF2_ITER = 150000

let booted = false
let pushTimer = null

export function getConfig() {
  return load(CFG_KEY, null)
}
export function getMeta() {
  return load(META_KEY, { lastSyncAt: 0, lastLocalWriteAt: 0 })
}
export function isEnabled() {
  return !!getConfig()?.enabled
}

async function loadAV() {
  return (await import('leancloud-storage')).default
}

async function initAV(cfg) {
  const AV = await loadAV()
  AV.init({
    appId: cfg.appId,
    appKey: cfg.appKey,
    serverURL: cfg.server || undefined,
  })
}

async function deriveKey(pass, salt) {
  const km = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function bytesToB64(bytes) {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}
function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export function bootSync() {
  const cfg = getConfig()
  if (!cfg?.enabled || !cfg.pass) return
  bootSyncAsync().catch((e) => console.error('启动同步失败', e))
}

async function bootSyncAsync() {
  const cfg = getConfig()
  try {
    await initAV(cfg)
  } catch (e) {
    console.error('LeanCloud 初始化失败', e)
    return
  }
  booted = true
  setSaveHook(schedulePush)
  const applied = await pull()
  if (applied) {
    location.reload()
    return
  }
  window.addEventListener('online', () => schedulePush())
}

export function schedulePush() {
  if (!booted) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    push().catch((e) => console.error('自动推送失败', e))
  }, 2000)
}

async function fetchDoc(av) {
  const q = new av.Query(CLASS_NAME)
  q.descending('updatedAt')
  q.limit(1)
  return await q.first()
}

export async function push() {
  const cfg = getConfig()
  if (!cfg?.enabled || !cfg.pass) throw new Error('未开启联机或未设置同步口令')
  const av = await loadAV()
  const payload = {}
  for (const k of SYNC_KEYS) {
    payload[k] = localStorage.getItem('banwei:' + k) ?? (k === 'pins' ? '{}' : '[]')
  }
  const dataVersion = Date.now()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(cfg.pass, salt)
  const plain = new TextEncoder().encode(JSON.stringify(payload))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  const file = new av.File('class-data.bin', { base64: bytesToB64(new Uint8Array(cipher)) })
  await file.save()
  let doc = await fetchDoc(av)
  if (!doc) doc = new av.Object(CLASS_NAME)
  doc.set('dataFile', file)
  doc.set('dataVersion', dataVersion)
  doc.set('iv', bytesToB64(iv))
  doc.set('salt', bytesToB64(salt))
  await doc.save()
  save(META_KEY, { lastSyncAt: dataVersion })
  return { dataVersion }
}

// 云端数据结构校验：形状不对的 key 绝不写入本地
const SHAPE_OK = {
  roster: (v) => Array.isArray(v),
  todos: (v) => Array.isArray(v),
  affairs: (v) => Array.isArray(v),
  fees: (v) => v && typeof v === 'object' && Array.isArray(v.records),
  pins: (v) => v && typeof v === 'object' && !Array.isArray(v),
}

export async function pull() {
  const cfg = getConfig()
  if (!cfg?.enabled || !cfg.pass) return { applied: false }
  const av = await loadAV()
  const doc = await fetchDoc(av)
  if (!doc) return { applied: false }
  const cloudVersion = doc.get('dataVersion') || 0
  if (cloudVersion <= (getMeta().lastSyncAt || 0)) return { applied: false }
  const iv = b64ToBytes(doc.get('iv'))
  const salt = b64ToBytes(doc.get('salt'))
  const key = await deriveKey(cfg.pass, salt)
  const fileUrl = typeof doc.get('dataFile')?.url === 'function' ? doc.get('dataFile').url() : null
  if (!fileUrl) return { applied: false }
  const resp = await fetch(fileUrl)
  if (!resp.ok) return { applied: false }
  let payload
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      b64ToBytes(await resp.text())
    )
    payload = JSON.parse(new TextDecoder().decode(plain))
  } catch {
    // 解密失败 = 口令不对或数据被篡改，拒绝应用
    return { applied: false, rejected: true }
  }
  // 本机近 15 秒内有改动则不自动覆盖（防吞掉未推送的编辑）
  const meta = getMeta()
  if (meta.lastLocalWriteAt && Date.now() - meta.lastLocalWriteAt < 15000) {
    return { applied: false, localFresh: true }
  }
  let appliedAny = false
  for (const k of SYNC_KEYS) {
    const raw = payload[k]
    if (raw == null) continue
    let val
    try {
      val = JSON.parse(raw)
    } catch {
      continue
    }
    if (!SHAPE_OK[k]?.(val)) continue
    localStorage.setItem('banwei:' + k, raw)
    appliedAny = true
  }
  if (appliedAny) save(META_KEY, { lastSyncAt: cloudVersion })
  return { applied: appliedAny, dataVersion: cloudVersion }
}

export async function enable(cfg) {
  await initAV(cfg)
  save(CFG_KEY, { ...cfg, enabled: true })
  booted = true
  setSaveHook(schedulePush)
}

export function disable() {
  const cfg = getConfig()
  if (cfg) save(CFG_KEY, { ...cfg, enabled: false })
  booted = false
  setSaveHook(null)
}
