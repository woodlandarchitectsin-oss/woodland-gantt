// Draws the app icons (green square, white letter) with a headless browser. Usage: node scripts/make-icons.cjs <outDir> <letter>
// Needs playwright, which lives in ../project-os-app/node_modules.
const path = require('path')
const fs = require('fs')
const { chromium } = require(path.join(__dirname, '..', '..', 'project-os-app', 'node_modules', 'playwright'))
;(async () => {
  const out = path.resolve(process.argv[2])
  const letter = process.argv[3] || 'W'
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const [name, size, scale] of [['icon-192.png', 192, 0.62], ['icon-512.png', 512, 0.62], ['maskable-512.png', 512, 0.46]]) {
    const b64 = await page.evaluate(([size, scale, letter]) => {
      const c = document.createElement('canvas')
      c.width = c.height = size
      const x = c.getContext('2d')
      x.fillStyle = '#2c5a47'
      x.fillRect(0, 0, size, size)
      x.fillStyle = '#ffffff'
      x.textAlign = 'center'
      x.textBaseline = 'alphabetic'
      x.font = '700 ' + Math.round(size * scale) + 'px "Segoe UI","Helvetica Neue",Arial,sans-serif'
      const m = x.measureText(letter)
      const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
      x.fillText(letter, size / 2, size / 2 + h / 2 - m.actualBoundingBoxDescent)
      return c.toDataURL('image/png').split(',')[1]
    }, [size, scale, letter])
    fs.writeFileSync(path.join(out, name), Buffer.from(b64, 'base64'))
  }
  await browser.close()
  console.log('icons written to', out)
})()
