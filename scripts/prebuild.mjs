// 构建前清理 dist，但保留 legacy/（上一版快照）与 .git（部署仓库）
import { rmSync, readdirSync, existsSync } from 'node:fs'

const dist = 'dist'
if (existsSync(dist)) {
  for (const entry of readdirSync(dist)) {
    if (entry === 'legacy' || entry === '.git') continue
    rmSync(`${dist}/${entry}`, { recursive: true, force: true })
  }
}
console.log('prebuild: dist cleaned (legacy/ and .git preserved)')
