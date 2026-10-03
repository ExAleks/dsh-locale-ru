// Split the untranslated namespaces into per-chunk English source files that
// subagents translate into Russian, one file each.
import fs from 'node:fs'
import path from 'node:path'

const [, , localesFile, translationsFile, outDir, chunkSizeArg] = process.argv
const chunkSize = Number(chunkSizeArg ?? 55)

const shipped = JSON.parse(fs.readFileSync(localesFile, 'utf8')).namespaces
const done = JSON.parse(fs.readFileSync(translationsFile, 'utf8'))

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const manifest = []
let total = 0
for (const ns of Object.keys(shipped).sort()) {
  if (ns in done) continue
  const entries = shipped[ns].en?.entries ?? {}
  const keys = Object.keys(entries)
  for (let i = 0; i < keys.length; i += chunkSize) {
    const part = Math.floor(i / chunkSize) + 1
    const slice = Object.fromEntries(keys.slice(i, i + chunkSize).map((key) => [key, entries[key]]))
    const file = path.join(outDir, `${ns}.${part}.json`)
    fs.writeFileSync(file, `${JSON.stringify(slice, null, 2)}\n`)
    manifest.push({ namespace: ns, part, file, keys: Object.keys(slice).length })
    total += Object.keys(slice).length
  }
}

const manifestFile = path.join(outDir, 'manifest.json')
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`chunks: ${manifest.length}, keys: ${total}, chunk size: ${chunkSize}`)
console.log(JSON.stringify(manifest.map((m) => m.file)))
