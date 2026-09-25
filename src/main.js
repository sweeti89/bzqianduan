import { createApp } from 'vue'
import { createPinia } from 'pinia'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import { bootSync } from './data/sync'
import { bootWallpaper } from './data/prefs'

dayjs.locale('zh-cn')

// 联机同步：开启过就拉取云端并注册自动推送
bootSync()
// 恢复本机自定义壁纸
bootWallpaper()
// 长期数据防浏览器逐出
navigator.storage?.persist?.().catch(() => {})
// 长期数据防浏览器逐出
navigator.storage?.persist?.().catch(() => {})
// 长期数据防浏览器逐出
navigator.storage?.persist?.().catch(() => {})

// PWA：仅在打包后的生产环境注册 Service Worker（开发时不干扰热更新）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.error('SW 注册失败', e))
  })
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Vant)
app.mount('#app')
