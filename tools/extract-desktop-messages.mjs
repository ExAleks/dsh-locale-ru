// Extract the desktop shell's own message dictionaries from its bundled
// `lib/main.js`, so a Russian table can be produced and injected back.
//
// The shell keeps two plain object literals (`en`, `zh`) and selects one in
// resolveDesktopLocale(); this tool evaluates them as data.
import fs from 'node:fs'

const [, , mainFile, outFile] = process.argv
if (mainFile === undefined || outFile === undefined) {
  console.error('usage: node extract-desktop-messages.mjs <main.js> <out.json>')
  process.exit(2)
}
const source = fs.readFileSync(mainFile, 'utf8')

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

function readDictionary(name) {
  const pattern = new RegExp(`(?:const|var|let)\\s+${name}\\s*=\\s*\\{`)
  const match = pattern.exec(source)
  if (match === null) return undefined
  const start = match.index + match[0].length - 1
  const end = matchDelimiter(source, start)
  if (end === -1) return undefined
  const literal = source.slice(start, end)
  // eslint-disable-next-line no-new-func
  return new Function(`return (${literal})`)()
}

// The identifiers resolveDesktopLocale returns as its `messages` value.
const resolverPattern = /messages:\s*([A-Za-z_$][\w$]*)\s*\}/g
const identifiers = new Set()
const resolveRegion = source.slice(source.indexOf('function resolveDesktopLocale'), source.indexOf('function resolveFormat'))
for (const match of resolveRegion.matchAll(resolverPattern)) identifiers.add(match[1])

const dictionaries = {}
for (const name of identifiers) {
  const value = readDictionary(name)
  if (value === undefined) {
    console.error(`could not read dictionary "${name}"`)
    process.exit(1)
  }
  dictionaries[name] = value
}

fs.writeFileSync(outFile, `${JSON.stringify({ source: mainFile, identifiers: [...identifiers], dictionaries }, null, 2)}\n`)
for (const [name, table] of Object.entries(dictionaries)) {
  console.log(`${name}: ${Object.keys(table).length} messages`)
}
