// 一次性脚本：生成 PWA 图标（public/icon-192.png / icon-512.png）
// 蓝色圆角方块 + 白色对勾，纯像素绘制，无外部依赖
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  if (!crc32.table) {
    crc32.table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crc32.table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of buf) crc = crc32.table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function makeIcon(S) {
  const R = S * 0.2 // 圆角半径
  const half = S / 2
  const blue = [25, 137, 250]
  const white = [255, 255, 255]
  const stroke = S * 0.06
  // 对勾三点的归一化坐标
  const A = [0.28, 0.52]
  const B = [0.44, 0.68]
  const C = [0.74, 0.34]

  const raw = Buffer.alloc(S * (S * 4 + 1))
  let off = 0
  for (let y = 0; y < S; y++) {
    raw[off++] = 0 // filter: none
    for (let x = 0; x < S; x++) {
      // 圆角方块内部判定
      const dx = Math.max(Math.abs(x + 0.5 - half) - (half - R), 0)
      const dy = Math.max(Math.abs(y + 0.5 - half) - (half - R), 0)
      const insideSquare = Math.hypot(dx, dy) <= R
      // 对勾判定（抗锯齿按距离渐变）
      const d = Math.min(
        segDist(x + 0.5, y + 0.5, A[0] * S, A[1] * S, B[0] * S, B[1] * S),
        segDist(x + 0.5, y + 0.5, B[0] * S, B[1] * S, C[0] * S, C[1] * S)
      )
      let r, g, b, a = 255
      if (!insideSquare) {
        if (d < stroke) {
          // 出界的勾画白色描边（图标边缘外露的勾不好看，直接透明）
          a = 0
        } else {
          a = 0
        }
      } else if (d < stroke - 1) {
        ;[r, g, b] = white
      } else if (d < stroke + 1) {
        const t = (d - (stroke - 1)) / 2
        r = white[0] + (blue[0] - white[0]) * t
        g = white[1] + (blue[1] - white[1]) * t
        b = white[2] + (blue[2] - white[2]) * t
      } else {
        ;[r, g, b] = blue
      }
      raw[off++] = r ?? 0
      raw[off++] = g ?? 0
      raw[off++] = b ?? 0
      raw[off++] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', makeIcon(192))
writeFileSync('public/icon-512.png', makeIcon(512))
console.log('icons generated')
