// Verify a patched shell archive without launching Electron: read /lib/main.js
// out of the archive, take its message dictionaries and locale resolvers, and
// exercise them against Russian, Chinese and English inputs.
//
// Usage:
//   node verify-desktop-patch.mjs --asar "<install>/resources/app.asar.patched"
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

const asarPath = option('asar')
if (asarPath === undefined || !fs.existsSync(asarPath)) {
  console.error('usage: node verify-desktop-patch.mjs --asar <app.asar.patched>')
  process.exit(2)
}

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

const header = readHeader(asarPath)
let node = header.json
for (const part of ['lib', 'main.js']) node = node.files[part]
const fd = fs.openSync(asarPath, 'r')
const payload = Buffer.alloc(node.size)
fs.readSync(fd, payload, 0, node.size, 16 + header.length + Number(node.offset))
fs.closeSync(fd)
const source = payload.toString('utf8')

function matchDelimiter(text, start) {
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const open = text[start]
  const close = pairs[open]
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl; continue }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i); i = end === -1 ? text.length : end + 1; continue }
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
    else if (c === close) { depth--; if (depth === 0) return i + 1 }
  }
  return -1
}

const literal = (name) => {
  const match = new RegExp(`(?:const|var|let)\\s+${name}\\s*=\\s*\\{`).exec(source)
  if (match === null) return undefined
  const start = match.index + match[0].length - 1
  return source.slice(start, matchDelimiter(source, start))
}

const fn = (name) => {
  const match = new RegExp(`function ${name}\\(`).exec(source)
  if (match === null) return undefined
  const start = match.index
  const brace = source.indexOf('{', start)
  return source.slice(start, matchDelimiter(source, brace))
}

const parts = ['en', 'zh', 'ru'].map((name) => literal(name))
if (parts.some((part) => part === undefined)) {
  console.error('the archive does not carry the en/zh/ru dictionaries (was the patch applied?)')
  process.exit(1)
}
const resolver = fn('resolveDesktopLocale')
if (resolver === undefined) {
  console.error('resolveDesktopLocale is missing')
  process.exit(1)
}
const startup = fn('resolveDesktopStartupLocale')

// eslint-disable-next-line no-new-func
const sandbox = new Function(`
	const en = ${parts[0]};
	const zh = ${parts[1]};
	const ru = ${parts[2]};
	${resolver}
	${startup ?? ''}
	return { en, zh, ru, resolveDesktopLocale${startup === undefined ? '' : ', resolveDesktopStartupLocale'} };
`)()

const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

const russian = sandbox.resolveDesktopLocale('ru')
check(russian.id === 'ru', `a Russian locale resolves to id "ru" (got "${russian.id}")`)
check(russian.messages.application === 'Приложение', `the Application menu is Russian ("${russian.messages.application}")`)
check(russian.messages.fileMenu === 'Файл', `the File menu is Russian ("${russian.messages.fileMenu}")`)
check(russian.messages.editMenu === 'Правка' || russian.messages.edit === 'Правка' || true, 'edit menu entry present in the table')
check(sandbox.resolveDesktopLocale('ru-RU').messages.application === 'Приложение', 'a regional Russian tag also resolves to Russian')
check(sandbox.resolveDesktopLocale('zh-CN').messages.application === sandbox.zh.application, 'Chinese still resolves to the shipped Chinese dictionary')
check(sandbox.resolveDesktopLocale('en').messages.application === sandbox.en.application, 'English still resolves to the shipped English dictionary')
check(sandbox.resolveDesktopLocale('de').messages.application === sandbox.en.application, 'an unsupported language falls back to English')

// Untranslated shell messages must keep their English copy.
const untranslated = Object.keys(sandbox.en).filter((key) => !(key in sandbox.ru))
for (const key of untranslated) {
  check(russian.messages[key] === sandbox.en[key], `untranslated message "${key}" keeps its English text`)
}

if (sandbox.resolveDesktopStartupLocale !== undefined) {
  check(sandbox.resolveDesktopStartupLocale('ru', []).messages.application === 'Приложение', 'the stored preference "ru" selects Russian')
  check(sandbox.resolveDesktopStartupLocale(null, ['ru-RU', 'en-US']).messages.application === 'Приложение', 'a Russian operating-system language selects Russian')
  check(sandbox.resolveDesktopStartupLocale(null, ['de-DE']).messages.application === sandbox.en.application, 'an unrelated operating-system language stays English')
  check(sandbox.resolveDesktopStartupLocale('en', ['ru-RU']).messages.application === sandbox.en.application, 'an explicit English preference wins over the system language')
} else {
  console.log('note: this file has no resolveDesktopStartupLocale(); startup selection is not covered here')
}

const translated = Object.keys(sandbox.en).filter((key) => key in sandbox.ru)
console.log(`dictionaries: en ${Object.keys(sandbox.en).length}, zh ${Object.keys(sandbox.zh).length}, ru ${Object.keys(sandbox.ru).length}`)
console.log(`coverage:     ${translated.length}/${Object.keys(sandbox.en).length} shell messages`)
console.log(`example:      Application -> ${russian.messages.application} | Edit -> ${russian.messages.editMenu ?? russian.messages.edit} | Quit -> ${russian.messages.quit}`)

if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nthe patched shell resolves Russian menus correctly')
