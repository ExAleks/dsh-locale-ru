// Merge translated package display text into the override table that the pack
// installs over the locale service's package-text resolver.
import fs from 'node:fs'
import path from 'node:path'

const [, , workDir, doneDir, tableFile] = process.argv

const manifest = JSON.parse(fs.readFileSync(path.join(workDir, 'manifest.json'), 'utf8'))
const previous = fs.existsSync(tableFile) ? JSON.parse(fs.readFileSync(tableFile, 'utf8')) : {}

const translated = {}
for (const chunk of manifest.chunks) {
  const file = path.join(doneDir, path.basename(chunk.file))
  if (!fs.existsSync(file)) {
    console.error(`missing output for ${chunk.file}`)
    process.exit(1)
  }
  Object.assign(translated, JSON.parse(fs.readFileSync(file, 'utf8')))
}

const table = { ...previous }
let added = 0
let identifiers = 0
let unchanged = 0
const problems = []

for (const entry of manifest.entries) {
  const value = translated[entry.id]
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${entry.id}: no translation ("${entry.text.slice(0, 60)}…")`)
    continue
  }
  if (value === entry.text) {
    // Identifiers and brand-only strings stay verbatim and need no override.
    if (/^@?[\w./-]+$/.test(entry.text)) identifiers++
    else unchanged++
    continue
  }
  if (entry.text in table) continue
  table[entry.text] = value
  added++
}

const sorted = Object.fromEntries(Object.entries(table).sort((a, b) => a[0].localeCompare(b[0])))
fs.writeFileSync(tableFile, `${JSON.stringify(sorted, null, 2)}\n`)

console.log(`entries: ${manifest.entries.length}`)
console.log(`added: ${added}, identifiers skipped: ${identifiers}, other unchanged: ${unchanged}`)
console.log(`table size: ${Object.keys(sorted).length}`)
console.log(`problems: ${problems.length}`)
for (const p of problems.slice(0, 10)) console.log(`  ! ${p}`)
