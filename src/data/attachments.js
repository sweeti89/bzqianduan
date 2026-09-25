// 凭证附件存储（IndexedDB）：支付截图、发票 PDF 等原始文件存这里，
// 记录（localStorage）里只存附件清单（id/文件名/类型/大小）。
// 以后联机版把这层换成云存储即可。

const DB_NAME = 'banwei-attach'
const STORE = 'files'
let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('recordId', 'recordId', { unique: false })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function putFile(rec) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rec)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getFile(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function getFilesByRecord(recordId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE, 'readonly')
      .objectStore(STORE)
      .index('recordId')
      .getAll(recordId)
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function deleteFile(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteByRecord(recordId) {
  const files = await getFilesByRecord(recordId)
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    files.forEach((f) => store.delete(f.id))
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}
