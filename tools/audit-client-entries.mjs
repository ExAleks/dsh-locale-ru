// Resolve the browser entry of every shipped client package and report which
// entry files were not part of the dictionary extraction pass.
import fs from 'node:fs'
import path from 'node:path'

const [, , pkgsRoot, scannedList] = process.argv
const scanned = new Set(
  fs.readFileSync(scannedList, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => line.trim().replace(/^\//, '')),
)

const rows = []
for (const pkg of fs.readdirSync(pkgsRoot, { withFileTypes: true })) {
  if (!pkg.isDirectory()) continue
  const manifestPath = path.join(pkgsRoot, pkg.name, 'package.json')
  if (!fs.existsSync(manifestPath)) continue
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    // Unpacked native packages live in app.asar.unpacked and extract as garbage.
    continue
  }
  const client = manifest.dsh?.client
  if (!client) continue
  const entry = manifest.exports?.['./client']
  const target = typeof entry === 'string' ? entry : entry?.default
  const rel = target ? `dsh/node_modules/@deepseek-ai/${pkg.name}/${target.replace(/^\.\//, '')}` : undefined
  rows.push({
    pkg: pkg.name,
    platform: client.platform,
    immediately: client.immediately === true,
    entry: target,
    scanned: rel ? scanned.has(rel) : false,
  })
}

const missing = rows.filter((row) => !row.scanned)
console.log(`client packages: ${rows.length}, scanned entries: ${rows.length - missing.length}, unscanned: ${missing.length}`)
for (const row of missing) console.log(`  ${row.pkg.padEnd(52)} entry=${row.entry} immediately=${row.immediately}`)
