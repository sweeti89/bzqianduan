import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'

// 生产构建时给 index.html 注入 CSP（开发模式不注入，避免影响 HMR）
const cspPlugin = {
  apply: 'build',
  transformIndexHtml(html) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src *",
      "object-src 'none'",
      "base-uri 'none'",
    ].join('; ')
    return html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
  },
}

export default defineConfig({
  plugins: [vue(), Components({ resolvers: [VantResolver()] }), cspPlugin],
  // 不自动清空 dist：legacy/（旧版快照）由 prebuild 脚本保留
  define: { __APP_VERSION__: JSON.stringify('1.2.0') },
  build: {
    emptyOutDir: false,
  },
  // 相对路径打包，方便以后放到任何静态托管上
  base: './',
  server: {
    host: true, // 允许手机连同一 WiFi 时通过电脑 IP 访问
    port: 5173,
  },
})
