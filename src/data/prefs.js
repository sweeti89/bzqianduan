// 个性化偏好（本设备级）：目前支持壁纸——预设渐变或自定义图片。
// 图片本体存 IndexedDB（recordId 固定为 __wallpaper），不参与联机同步。
import { reactive } from 'vue'
import { load, save } from './db'
import { getFile, putFile, deleteFile } from './attachments'

const KEY = 'prefs'

export const WALLPRESETS = [
  { id: 'default', name: '默认' },
  { id: 'sky', name: '晨雾蓝', style: { background: 'linear-gradient(160deg, #dbeafe 0%, #eff6ff 55%, #f7f8fa 100%)' } },
  { id: 'sakura', name: '樱花粉', style: { background: 'linear-gradient(160deg, #ffe4e9 0%, #fff1f3 55%, #fff8f9 100%)' } },
  { id: 'mint', name: '薄荷绿', style: { background: 'linear-gradient(160deg, #d9f7e8 0%, #effbf5 55%, #f6fbf9 100%)' } },
  { id: 'sunset', name: '暖阳橙', style: { background: 'linear-gradient(160deg, #ffedd5 0%, #fff7ed 55%, #fffaf3 100%)' } },
  { id: 'violet', name: '星雾紫', style: { background: 'linear-gradient(160deg, #e9e2ff 0%, #f3efff 55%, #faf9ff 100%)' } },
]

export const prefs = reactive(load(KEY, { wallpaper: { type: 'none' } }))

function persist() {
  save(KEY, {
    wallpaper: {
      type: prefs.wallpaper?.type || 'none',
      presetId: prefs.wallpaper?.presetId,
      imageId: prefs.wallpaper?.imageId,
    },
  })
}

export function setWallpaperPreset(presetId) {
  prefs.wallpaper = { type: presetId === 'default' ? 'none' : 'preset', presetId }
  persist()
}

export function resetWallpaper() {
  prefs.wallpaper = { type: 'none' }
  persist()
}

export async function setWallpaperImage(file) {
  if (!/^image\//.test(file.type)) throw new Error('仅支持图片')
  if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB')
  const oldId = prefs.wallpaper?.imageId
  if (oldId) await deleteFile(oldId).catch(() => {})
  const id = 'wallpaper-' + Date.now()
  await putFile({ id, recordId: '__wallpaper', name: file.name, type: file.type, blob: file })
  prefs.wallpaper = { type: 'image', imageId: id }
  persist()
}

// 应用启动时：壁纸是图片的话，从 IndexedDB 取回并生成本地预览地址
export async function bootWallpaper() {
  const w = prefs.wallpaper
  if (w?.type === 'image' && w.imageId) {
    try {
      const f = await getFile(w.imageId)
      if (f?.blob) prefs.wallpaper.imageUrl = URL.createObjectURL(f.blob)
    } catch {
      /* 忽略：取不到就显示默认背景 */
    }
  }
}

export function wallpaperStyle() {
  const w = prefs.wallpaper || { type: 'none' }
  if (w.type === 'preset') {
    const p = WALLPRESETS.find((p) => p.id === w.presetId)
    return p?.style ? { ...p.style } : {}
  }
  if (w.type === 'image' && w.imageUrl) {
    return { backgroundImage: `url(${w.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return {}
}
