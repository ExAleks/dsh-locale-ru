// Merge the per-chunk Russian translations into the pack's translation table,
// validating keys, placeholders and suspicious leftovers.
import fs from 'node:fs'
import path from 'node:path'

const [, , localesFile, workDir, doneDir, translationsFile] = process.argv

const shipped = JSON.parse(fs.readFileSync(localesFile, 'utf8')).namespaces
const existing = JSON.parse(fs.readFileSync(translationsFile, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(workDir, 'manifest.json'), 'utf8'))

const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const cyrillic = /[\u0400-\u04FF]/

// Values that legitimately stay as the English source: bare tokens, numbers,
// symbols, identifiers, brand-only strings.
const tokenLike = (value) =>
  value.length <= 24 && !/[a-z]{3}\s+[a-z]{3}/i.test(value)

const problems = []
const suspicious = []
const merged = new Map()

for (const ns of Object.keys(shipped)) {
  if (ns in existing) merged.set(ns, { ...existing[ns] })
}

for (const entry of manifest) {
  const doneFile = path.join(doneDir, `${entry.namespace}.${entry.part}.json`)
  if (!fs.existsSync(doneFile)) {
    problems.push(`${entry.namespace}.${entry.part}: no output file`)
    continue
  }
  let translated
  try {
    translated = JSON.parse(fs.readFileSync(doneFile, 'utf8'))
  } catch (error) {
    problems.push(`${entry.namespace}.${entry.part}: invalid JSON (${error.message})`)
    continue
  }
  const source = shipped[entry.namespace].en.entries
  const workKeys = Object.keys(JSON.parse(fs.readFileSync(path.join(workDir, `${entry.namespace}.${entry.part}.json`), 'utf8')))
  const missing = workKeys.filter((key) => typeof translated[key] !== 'string' || translated[key].trim() === '')
  if (missing.length) problems.push(`${entry.namespace}.${entry.part}: missing ${missing.length} keys (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''})`)
  const extra = Object.keys(translated).filter((key) => !workKeys.includes(key))
  if (extra.length) problems.push(`${entry.namespace}.${entry.part}: unexpected keys (${extra.slice(0, 4).join(', ')}${extra.length > 4 ? '…' : ''})`)

  const bucket = merged.get(entry.namespace) ?? {}
  for (const key of workKeys) {
    const value = translated[key]
    if (typeof value !== 'string' || value.trim() === '') continue
    if (placeholders(source[key]) !== placeholders(value)) {
      problems.push(`${entry.namespace}.${key}: placeholder mismatch (en "${source[key]}" -> ru "${value}")`)
      continue
    }
    if (value === source[key] && cyrillic.test(source[key]) === false && !tokenLike(source[key])) {
      suspicious.push(`${entry.namespace}.${key}: unchanged "${value}"`)
    }
    bucket[key] = value
  }
  merged.set(entry.namespace, bucket)
}

// Emit in shipped namespace/key order so the file stays reviewable.
const ordered = {}
for (const ns of Object.keys(shipped)) {
  const table = merged.get(ns)
  if (!table) continue
  const source = shipped[ns].en.entries
  const out = {}
  for (const key of Object.keys(source)) if (key in table) out[key] = table[key]
  for (const key of Object.keys(table)) if (!(key in source)) out[key] = table[key]
  ordered[ns] = out
}

fs.writeFileSync(translationsFile, `${JSON.stringify(ordered, null, 2)}\n`)

const keys = Object.values(ordered).reduce((sum, table) => sum + Object.keys(table).length, 0)
const shippedKeys = Object.values(shipped).reduce((sum, v) => sum + Object.keys(v.en?.entries ?? {}).length, 0)

console.log(`namespaces: ${Object.keys(ordered).length}`)
console.log(`keys: ${keys}/${shippedKeys} (${((keys / shippedKeys) * 100).toFixed(1)}%)`)
console.log(`problems: ${problems.length}`)
for (const p of problems) console.log(`  ! ${p}`)
console.log(`unchanged English values: ${suspicious.length}`)
for (const s of suspicious) console.log(`  ? ${s}`)
