// Build translation work files for package display text (titles/descriptions
// from locale/en.json and package.json manifests).
import fs from 'node:fs'
import path from 'node:path'

const [, , manifestTextsFile, existingTableFile, outDir, chunkSizeArg] = process.argv
const chunkSize = Number(chunkSizeArg ?? 40)

const packages = JSON.parse(fs.readFileSync(manifestTextsFile, 'utf8'))
const existing = fs.existsSync(existingTableFile)
  ? JSON.parse(fs.readFileSync(existingTableFile, 'utf8'))
  : {}

const unique = new Map()
for (const row of packages) {
  for (const text of [row.title, row.description]) {
    if (typeof text !== 'string' || text.trim() === '') continue
    if (text in existing) continue
    // Package names are identifiers, never display copy to translate.
    if (text === row.package) continue
    if (!unique.has(text)) unique.set(text, [])
    unique.get(text).push(row.package)
  }
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const entries = [...unique.entries()].map(([text, packages], index) => ({
  id: `s${String(index + 1).padStart(4, '0')}`,
  text,
  packages: [...new Set(packages)],
}))

const manifest = []
for (let i = 0; i < entries.length; i += chunkSize) {
  const part = Math.floor(i / chunkSize) + 1
  const slice = entries.slice(i, i + chunkSize)
  const map = Object.fromEntries(slice.map((e) => [e.id, e.text]))
  const file = path.join(outDir, `package-text.${part}.json`)
  fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`)
  manifest.push({ part, file, keys: slice.length })
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({
  entries,
  chunks: manifest,
}, null, 2)}\n`)

console.log(`unique strings: ${entries.length}, chunks: ${manifest.length}`)
console.log(JSON.stringify(manifest.map((m) => m.file)))
