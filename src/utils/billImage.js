// 生成班费账单长图（canvas 绘制 → PNG dataURL），用于保存/分享到 QQ 群
export function generateBillImage({
  initialBalance = 0,
  balance = 0,
  totalIncome = 0,
  totalExpense = 0,
  records = [],
}) {
  const scale = 2
  const W = 750
  const pad = 36
  const rows = records.slice(0, 30)
  const rowH = 84
  const headerH = 210
  const summaryH = 150
  const listTitleH = 70
  const footerH = 60
  const H = headerH + summaryH + 24 + listTitleH + rows.length * rowH + footerH

  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  function roundRect(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  // 背景
  ctx.fillStyle = '#f4f6fa'
  ctx.fillRect(0, 0, W, H)

  // 顶部渐变头
  const g = ctx.createLinearGradient(0, 0, W, headerH)
  g.addColorStop(0, '#1989fa')
  g.addColorStop(1, '#45a6ff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, headerH)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 36px sans-serif'
  ctx.fillText('班费账单', pad, 66)
  ctx.font = '22px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.fillText(`24数学强基班 · ${new Date().toLocaleDateString('zh-CN')}`, pad, 106)

  // 余额大字
  ctx.font = 'bold 60px sans-serif'
  ctx.fillText(`¥${Number(balance).toFixed(2)}`, pad, 180)
  ctx.font = '20px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText('当前余额', pad + 320, 172)

  // 汇总卡
  const cardY = headerH + 24
  ctx.fillStyle = '#ffffff'
  roundRect(pad, cardY, W - pad * 2, summaryH, 18)
  ctx.fill()
  const stats = [
    { label: '期初余额', value: `¥${Number(initialBalance).toFixed(2)}`, color: '#323233' },
    { label: '累计收入', value: `+¥${Number(totalIncome).toFixed(2)}`, color: '#07c160' },
    { label: '累计支出', value: `-¥${Number(totalExpense).toFixed(2)}`, color: '#ee0a24' },
  ]
  const colW = (W - pad * 2) / 3
  stats.forEach((s, i) => {
    const cx = pad + colW * i + colW / 2
    ctx.textAlign = 'center'
    ctx.font = '20px sans-serif'
    ctx.fillStyle = '#969799'
    ctx.fillText(s.label, cx, cardY + 52)
    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = s.color
    ctx.fillText(s.value, cx, cardY + 100)
    ctx.textAlign = 'left'
  })

  // 明细标题
  const listTitleY = cardY + summaryH + 52
  ctx.font = 'bold 26px sans-serif'
  ctx.fillStyle = '#323233'
  ctx.fillText('收支明细', pad, listTitleY)
  ctx.font = '18px sans-serif'
  ctx.fillStyle = '#969799'
  ctx.textAlign = 'right'
  const total = records.length
  ctx.fillText(
    `共 ${total} 笔${total > rows.length ? `，仅显示最近 ${rows.length} 笔` : ''}`,
    W - pad,
    listTitleY
  )
  ctx.textAlign = 'left'

  // 流水行
  let y = listTitleY + 30
  if (!rows.length) {
    ctx.font = '22px sans-serif'
    ctx.fillStyle = '#969799'
    ctx.fillText('暂无收支记录', pad, y + 30)
  }
  rows.forEach((r) => {
    const sign = r.type === '支出' ? '-' : '+'
    const color = r.type === '支出' ? '#ee0a24' : '#07c160'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillStyle = '#323233'
    ctx.fillText(r.category || '未分类', pad, y + 30)
    ctx.font = '18px sans-serif'
    ctx.fillStyle = '#969799'
    ctx.fillText(`${r.date || ''}${r.handler ? ' · ' + r.handler : ''}`, pad, y + 58)
    ctx.textAlign = 'right'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = color
    ctx.fillText(`${sign}¥${Number(r.amount).toFixed(2)}`, W - pad, y + 40)
    ctx.textAlign = 'left'
    ctx.strokeStyle = '#f0f1f5'
    ctx.beginPath()
    ctx.moveTo(pad, y + rowH - 12)
    ctx.lineTo(W - pad, y + rowH - 12)
    ctx.stroke()
    y += rowH
  })

  return canvas.toDataURL('image/png')
}
