// Patch the installed DeepSeek Harness desktop shell so its native menus and
// dialogs follow the Russian locale.
//
// The Electron shell ships its own message dictionaries (`en`, `zh`) inside
// app.asar and hard-codes the choice in resolveDesktopLocale(); a profile plugin
// cannot reach that code, so this tool rewrites the archive instead:
//
//   * injects a Russian table (desktop-shell/ru.json) into every shell file that
//     carries a dictionary,
//   * makes resolveDesktopLocale() return those messages merged over English for
//     a Russian locale, and
//   * lets resolveDesktopStartupLocale() accept `ru` from locale.preference or
//     the operating-system languages.
//
// Usage:
//   node patch-desktop-locale.mjs --asar "<install>/resources/app.asar" [--table desktop-shell/ru.json]
//        [--out "<install>/resources/app.asar.patched"] [--dry-run] [--force]
//   node patch-desktop-locale.mjs --revert --asar "<install>/resources/app.asar"
//
// Applying needs the application closed; tools/apply-desktop-menu.cmd performs the
// swap, the backup and the relaunch.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}
const flag = (name) => args.includes(`--${name}`)

const MARKER = '/* dsh-locale-ru */'
const TABLE_DECLARATION = 'const ru = {'
const asarPath = option('asar')
if (asarPath === undefined || !fs.existsSync(asarPath)) {
  console.error('usage: node patch-desktop-locale.mjs --asar <app.asar> [--table <ru.json>] [--out <file>] [--dry-run]')
  process.exit(2)
}

// ------------------------------------------------------------ reading the asar
const readHeader = (file) => {
  const fd = fs.openSync(file, 'r')
  try {
    const prefix = Buffer.alloc(16)
    fs.readSync(fd, prefix, 0, 16, 0)
    const length = prefix.readUInt32LE(12)
    const bytes = Buffer.alloc(length)
    fs.readSync(fd, bytes, 0, length, 16)
    return { json: JSON.parse(bytes.toString('utf8')), length }
  } finally {
    fs.closeSync(fd)
  }
}

const flatten = (node, prefixPath, out) => {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const entryPath = `${prefixPath}/${name}`
    if (value.files) flatten(value, entryPath, out)
    else out.set(entryPath, value)
  }
  return out
}

const originalHeader = readHeader(asarPath)
const entries = flatten(originalHeader.json, '', new Map())
const dataBase = 16 + originalHeader.length
const sourceFd = fs.openSync(asarPath, 'r')
const readEntry = (entryPath, entry) => {
  if (entry.unpacked === true) return fs.readFileSync(path.join(`${asarPath}.unpacked`, entryPath.replace(/^\//, '')))
  const payload = Buffer.alloc(entry.size)
  fs.readSync(sourceFd, payload, 0, entry.size, dataBase + Number(entry.offset))
  return payload
}

// ------------------------------------------------------------------- reverting
if (flag('revert')) {
  const backup = option('backup', `${asarPath}.backup`)
  if (!fs.existsSync(backup)) {
    console.error(`no backup at ${backup}`)
    process.exit(1)
  }
  fs.copyFileSync(backup, asarPath)
  const check = readHeader(asarPath)
  fs.closeSync(sourceFd)
  console.log(`restored ${asarPath} from ${backup} (${Object.keys(check.json.files).length} top-level entries)`)
  process.exit(0)
}

// -------------------------------------------------------------- electron fuses
const installDir = path.dirname(path.dirname(asarPath))
const executable = fs.readdirSync(installDir).find((name) => name.toLowerCase().endsWith('.exe'))
if (executable !== undefined) {
  const exe = fs.readFileSync(path.join(installDir, executable))
  const at = exe.indexOf(Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii'))
  if (at === -1) {
    console.log(`! no Electron fuse wire in ${executable}; asar integrity validation could not be checked`)
  } else {
    const state = (byte) => (byte === 0x30 ? 'disabled' : byte === 0x31 ? 'enabled' : `0x${byte.toString(16)}`)
    const count = exe[at + 33]
    const fuses = []
    for (let i = 0; i < count; i++) fuses.push(exe[at + 34 + i])
    console.log(`fuses: EnableEmbeddedAsarIntegrityValidation=${state(fuses[4])}, OnlyLoadAppFromAsar=${state(fuses[5])}`)
    if (fuses[4] === 0x31 && !flag('force')) {
      console.error('refusing to patch: asar integrity validation is enabled (pass --force to override)')
      process.exit(1)
    }
  }
}

// ------------------------------------------------------------- shell rewriting
const tablePath = path.resolve(option('table', path.join(here, '..', 'desktop-shell', 'ru.json')))
const russian = JSON.parse(fs.readFileSync(tablePath, 'utf8'))
console.log(`table: ${tablePath} (${Object.keys(russian).length} messages)`)

function matchDelimiter(text, start) {
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const open = text[start]
  const close = pairs[open]
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue }
        if (text[i] === quote) break
        i++
      }
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

function englishDictionary(text) {
  const match = /(?:const|var|let)\s+en\s*=\s*\{/.exec(text)
  if (match === null) return undefined
  const start = match.index + match[0].length - 1
  const end = matchDelimiter(text, start)
  if (end === -1) return undefined
  // eslint-disable-next-line no-new-func
  return new Function(`return (${text.slice(start, end)})`)()
}

const resolverText = `function resolveDesktopLocale(locale) {
\t${MARKER}
\tconst tag = locale.toLowerCase();
\tif (tag.startsWith("zh")) return {
\t\tid: "zh-CN",
\t\tmessages: zh
\t};
\tif (tag.startsWith("ru")) return {
\t\tid: "ru",
\t\tmessages: {
\t\t\t...en,
\t\t\t...ru
\t\t}
\t};
\treturn {
\t\tid: "en",
\t\tmessages: en
\t};
}`

const patched = new Map()
const report = []
for (const [entryPath, entry] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!/^\/lib\/[^/]+\.(js|cjs)$/.test(entryPath) || entry.unpacked === true) continue
  const original = readEntry(entryPath, entry).toString('utf8')
  const dictionary = englishDictionary(original)
  if (dictionary === undefined) continue
  if (!/function resolveDesktopLocale\(locale\)\s*\{/.test(original)) continue

  const missing = Object.keys(russian).filter((key) => !(key in dictionary))
  const mismatch = Object.entries(russian).filter(([key, value]) => key in dictionary && placeholders(dictionary[key]) !== placeholders(value))
  if (missing.length || mismatch.length) {
    console.error(`refusing to patch ${entryPath}: the installed shell no longer matches the translation table`)
    if (missing.length) console.error(`  unknown keys: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`)
    for (const [key, value] of mismatch.slice(0, 5)) console.error(`  placeholders differ: ${key} ("${dictionary[key]}" -> "${value}")`)
    process.exit(1)
  }

  // Start from the unpatched shape so re-running the tool is safe.
  let text = original
  const previous = text.indexOf(TABLE_DECLARATION)
  if (previous !== -1 && text.includes(MARKER)) {
    const end = matchDelimiter(text, text.indexOf('{', previous))
    text = `${text.slice(0, previous)}${text.slice(end + 1)}`
  }

  const resolverStart = text.search(/function resolveDesktopLocale\(locale\)\s*\{/)
  const resolverEnd = matchDelimiter(text, text.indexOf('{', resolverStart))
  text = `${text.slice(0, resolverStart)}const ru = ${JSON.stringify(russian, null, '\t')};\n\n${resolverText}${text.slice(resolverEnd)}`

  // Accept `ru` from the stored preference and from the operating-system languages.
  text = text
    .replace(/if \(selected === "zh" \|\| selected === "en"\)/, 'if (selected === "zh" || selected === "en" || selected === "ru")')
    .replace(/if \(primary === "zh" \|\| primary === "en"\)/, 'if (primary === "zh" || primary === "en" || primary === "ru")')

  const temp = path.join(os.tmpdir(), `dsh-locale-ru-${path.basename(entryPath)}${entryPath.endsWith('.cjs') ? '' : '.mjs'}`)
  fs.writeFileSync(temp, text)
  try {
    execFileSync(process.execPath, ['--check', temp], { stdio: 'inherit' })
  } catch {
    console.error(`refusing to patch ${entryPath}: syntax check failed (${temp})`)
    process.exit(1)
  } finally {
    fs.rmSync(temp, { force: true })
  }

  patched.set(entryPath, Buffer.from(text, 'utf8'))
  report.push(`${entryPath}: ${Object.keys(russian).length}/${Object.keys(dictionary).length} messages, ${original.length} -> ${text.length} bytes`)
}

if (patched.size === 0) {
  console.error('no shell file carrying a message dictionary was found in the archive')
  process.exit(1)
}
for (const line of report) console.log(`  patched ${line}`)

// --------------------------------------------------------------- asar writing
const headerClone = JSON.parse(JSON.stringify(originalHeader.json))
const headerEntryFor = (entryPath) => {
  const parts = entryPath.replace(/^\//, '').split('/')
  let node = headerClone
  for (const part of parts.slice(0, -1)) node = node.files[part]
  return node.files[parts[parts.length - 1]]
}

const ordered = [...entries.entries()].sort((a, b) => Number(a[1].offset ?? 0) - Number(b[1].offset ?? 0))
const chunks = []
let cursor = 0
for (const [entryPath, entry] of ordered) {
  const replacement = patched.get(entryPath)
  if (entry.unpacked === true && replacement === undefined) continue
  const payload = replacement ?? readEntry(entryPath, entry)
  const padding = (4 - (cursor % 4)) % 4
  if (padding > 0) {
    chunks.push(Buffer.alloc(padding))
    cursor += padding
  }
  // Every rewritten payload moves, so its header entry must be updated.
  const headerEntry = headerEntryFor(entryPath)
  headerEntry.offset = String(cursor)
  headerEntry.size = payload.length
  if (replacement !== undefined && headerEntry.integrity !== undefined) {
    const blockSize = headerEntry.integrity.blockSize ?? 4194304
    const blocks = []
    for (let offset = 0; offset < replacement.length; offset += blockSize) {
      blocks.push(crypto.createHash('sha256').update(replacement.subarray(offset, offset + blockSize)).digest('hex'))
    }
    headerEntry.integrity.blocks = blocks
    headerEntry.integrity.hash = blocks.length === 1
      ? blocks[0]
      : crypto.createHash('sha256').update(blocks.join('')).digest('hex')
  }
  chunks.push(payload)
  cursor += payload.length
}

const headerBytes = Buffer.from(JSON.stringify(headerClone), 'utf8')
const prefix = Buffer.alloc(16)
prefix.writeUInt32LE(4, 0)
prefix.writeUInt32LE(headerBytes.length + 8, 4)
prefix.writeUInt32LE(headerBytes.length + 4, 8)
prefix.writeUInt32LE(headerBytes.length, 12)
const archive = Buffer.concat([prefix, headerBytes, ...chunks])

const outPath = option('out', `${asarPath}.patched`)
if (flag('dry-run')) {
  console.log(`dry run: the patched archive would be ${archive.length} bytes (original ${fs.statSync(asarPath).size})`)
  fs.closeSync(sourceFd)
  process.exit(0)
}
fs.writeFileSync(outPath, archive)

// ------------------------------------------------------------------ verifying
const verifyHeader = readHeader(outPath)
const verifyEntries = flatten(verifyHeader.json, '', new Map())
if (verifyEntries.size !== entries.size) {
  console.error(`verification failed: entry count ${verifyEntries.size} != ${entries.size}`)
  process.exit(1)
}
const verifyFd = fs.openSync(outPath, 'r')
for (const [entryPath, expected] of patched) {
  const entry = verifyEntries.get(entryPath)
  const payload = Buffer.alloc(entry.size)
  fs.readSync(verifyFd, payload, 0, entry.size, 16 + verifyHeader.length + Number(entry.offset))
  if (!payload.equals(expected)) {
    console.error(`verification failed: ${entryPath} differs after the rebuild`)
    process.exit(1)
  }
}
// A few untouched files must survive byte for byte as well.
const untouched = [...entries.keys()].filter((entryPath) => !patched.has(entryPath) && entries.get(entryPath).unpacked !== true && entries.get(entryPath).size > 0)
for (const entryPath of [untouched[0], untouched[Math.floor(untouched.length / 2)], untouched[untouched.length - 1]]) {
  const before = readEntry(entryPath, entries.get(entryPath))
  const entry = verifyEntries.get(entryPath)
  const after = Buffer.alloc(entry.size)
  fs.readSync(verifyFd, after, 0, entry.size, 16 + verifyHeader.length + Number(entry.offset))
  if (!before.equals(after)) {
    console.error(`verification failed: untouched file ${entryPath} changed`)
    process.exit(1)
  }
}
fs.closeSync(verifyFd)
fs.closeSync(sourceFd)
console.log(`wrote ${outPath} (${archive.length} bytes, ${patched.size} files patched, ${verifyEntries.size} entries verified)`)
console.log('next: close the application and run tools/apply-desktop-menu.cmd apply')
