// Read entries out of an Electron app.asar archive with no dependencies.
//
// Layout of an asar file: a pickle prefix holding the header JSON length, the
// header JSON itself (a directory tree), then the file payloads.
//   0..3   uint32 = 4                      (size of the size field)
//   4..7   uint32 = header payload size
//   8..11  uint32 = 4                      (size of the string length field)
//   12..15 uint32 = header JSON length
//   16..   header JSON, followed by payloads at 16 + headerLength
//
// Usage:
//   node asar-extract.mjs --asar <app.asar> --list
//   node asar-extract.mjs --asar <app.asar> --out <dir> [--filter <regex>]
// Entries flagged `unpacked` live beside the archive in `<app.asar>.unpacked`.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}
const flag = (name) => args.includes(`--${name}`)

const asarPath = option('asar')
if (asarPath === undefined || !fs.existsSync(asarPath)) {
  console.error('usage: node asar-extract.mjs --asar <app.asar> --out <dir> [--filter <regex>] | --list')
  process.exit(2)
}

const fd = fs.openSync(asarPath, 'r')
const prefix = Buffer.alloc(16)
fs.readSync(fd, prefix, 0, 16, 0)
const headerLength = prefix.readUInt32LE(12)
const headerBytes = Buffer.alloc(headerLength)
fs.readSync(fd, headerBytes, 0, headerLength, 16)
const header = JSON.parse(headerBytes.toString('utf8'))
const dataBase = 16 + headerLength

// Flatten the directory tree into "path -> entry".
function flatten(node, prefixPath, out) {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const entryPath = `${prefixPath}/${name}`
    if (value.files) flatten(value, entryPath, out)
    else out.set(entryPath, value)
  }
  return out
}
const entries = flatten(header, '', new Map())

const unpackedRoot = `${asarPath}.unpacked`
const readPayload = (entryPath, entry) => {
  if (entry.unpacked === true) return fs.readFileSync(path.join(unpackedRoot, entryPath.replace(/^\//, '')))
  const payload = Buffer.alloc(entry.size)
  fs.readSync(fd, payload, 0, entry.size, dataBase + Number(entry.offset))
  return payload
}

if (flag('list')) {
  for (const entryPath of [...entries.keys()].sort()) console.log(entryPath)
  console.log(`# entries: ${entries.size}`)
  process.exit(0)
}

// Search mode: find entries containing a regular expression and show a snippet.
const grepSource = option('grep')
if (grepSource !== undefined) {
  const pattern = new RegExp(grepSource, 'g')
  const maxBytes = Number(option('max-bytes', `${4 * 1024 * 1024}`))
  let hits = 0
  for (const [entryPath, entry] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (entry.size === 0 || entry.size > maxBytes) continue
    const text = readPayload(entryPath, entry).toString('utf8')
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match === null) continue
    hits++
    const from = Math.max(0, match.index - 140)
    console.log(entryPath)
    console.log(`    ${text.slice(from, match.index + 200).replace(/\s+/g, ' ')}`)
  }
  fs.closeSync(fd)
  console.log(`# matches: ${hits}`)
  process.exit(0)
}

const outDir = option('out')
if (outDir === undefined) {
  console.error('missing --out <dir>')
  process.exit(2)
}
const filterSource = option('filter')
const filter = filterSource === undefined ? undefined : new RegExp(filterSource)

let written = 0
let skipped = 0
for (const [entryPath, entry] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (filter !== undefined && !filter.test(entryPath)) continue
  if (entry.size === 0) { skipped++; continue }
  const destination = path.join(outDir, entryPath.replace(/^\//, ''))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, readPayload(entryPath, entry))
  written++
  if (written % 250 === 0) console.log(`  ${written} files…`)
}
fs.closeSync(fd)
console.log(`extracted ${written} files from ${asarPath} into ${outDir}${skipped ? ` (skipped ${skipped} empty)` : ''}`)
