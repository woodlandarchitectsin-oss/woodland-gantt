// One-time move of the projects from the old local version (_local-version/export.json) to the online Gantt.
// Usage: node scripts/migrate-local.cjs            (asks for the admin PIN; nothing is stored)
// Skips the "Sample" project and any project whose name is already online, so running it twice is safe.
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const API = (fs.readFileSync(path.join(__dirname, '..', 'src', 'config.ts'), 'utf8').match(/API_URL = '([^']+)'/) || [])[1]
const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_local-version', 'export.json'), 'utf8'))

const ask = (q) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); res(a.trim()) })
  })

async function call(pin, method, url, body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ pin, method, url, body }) })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || 'failed')
  return j.data
}

;(async () => {
  if (!API || API.includes('REPLACE')) throw new Error('The online address is not set in src/config.ts yet.')
  const pin = await ask('Admin PIN: ')
  const online = await call(pin, 'GET', '/api/projects')
  for (const p of projects) {
    if (/^Sample\b/i.test(p.name)) { console.log('skip (sample):', p.name); continue }
    if (online.some((o) => o.name.trim().toLowerCase() === p.name.trim().toLowerCase())) { console.log('already online:', p.name); continue }
    await call(pin, 'POST', '/api/projects', {
      name: p.name, client: p.client, site: p.site, start_date: p.start_date, target_handover_date: p.target_handover_date, category: p.category,
      sequence_logic: p.sequence_logic, critical_path: p.critical_path, site_note: p.site_note, project_os_id: p.project_os_id || '',
      phases: p.phases, milestones: p.milestones,
    })
    console.log('moved:', p.name, `(${p.phases.length} phases, ${p.milestones.length} milestones)`)
  }
  console.log('Done.')
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1) })
