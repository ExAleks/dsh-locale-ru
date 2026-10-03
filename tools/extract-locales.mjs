// Extract locale dictionaries (namespace -> locale -> entries) from DSH client bundles.
// Bundles register dictionaries as: ctx.locale.register(<NS>, { zh, en }) where the
// dictionary objects are const literals that may spread other const literals.
import fs from 'node:fs'
import path from 'node:path'

// Some const initializers are methods returning promises; never let those become
// unhandled rejections while probing.
process.on('unhandledRejection', () => {})
// Probing initializers can also schedule timers whose callback later throws.
process.on('uncaughtException', () => {})

const root = process.argv[2]
const outFile = process.argv[3]

function listClientBundles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgDir = path.join(dir, entry.name)
    const candidate = path.join(pkgDir, 'lib', 'client.js')
    if (fs.existsSync(candidate)) out.push(candidate)
    const nested = path.join(pkgDir, 'node_modules')
    if (fs.existsSync(nested)) out.push(...listClientBundles(nested))
  }
  return out
}

// Scan a JS source starting at the index of an opener, honoring strings and
// comments, and return the index just past the matching closer.
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

// Capture a const initializer expression, stopping at a depth-0 ';' or newline.
function extractExpression(text, eqIndex) {
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const stack = []
  for (let i = eqIndex; i < text.length; i++) {
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
    if (pairs[c]) stack.push(pairs[c])
    else if (stack.length && c === stack[stack.length - 1]) stack.pop()
    else if (stack.length === 0 && (c === ';' || c === '\n')) return text.slice(eqIndex, i)
  }
  return text.slice(eqIndex)
}

const constRe = /(?:^|[\s;{}])(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*/g

function buildConstTable(text) {
  const table = new Map()
  constRe.lastIndex = 0
  let m
  while ((m = constRe.exec(text)) !== null) {
    const name = m[1]
    const eq = m.index + m[0].length
    if (table.has(name)) continue
    table.set(name, extractExpression(text, eq))
  }
  return table
}

const identifierRe = /[A-Za-z_$][\w$]*/g

function createResolver(table) {
  const memo = new Map()
  const visiting = new Set()
  function resolve(name) {
    if (memo.has(name)) return memo.get(name)
    if (visiting.has(name)) return undefined
    const expr = table.get(name)
    if (expr === undefined) return undefined
    visiting.add(name)
    let value
    try {
      const refs = new Set()
      let m
      identifierRe.lastIndex = 0
      while ((m = identifierRe.exec(expr)) !== null) refs.add(m[0])
      const params = []
      const args = []
      for (const ref of refs) {
        if (ref === name || !table.has(ref)) continue
        const dep = resolve(ref)
        if (dep === undefined) continue
        params.push(ref)
        args.push(dep)
      }
      // eslint-disable-next-line no-new-func
      value = new Function(...params, `return (${expr})`)(...args)
      if (value instanceof Promise) value = undefined
    } catch {
      value = undefined
    }
    visiting.delete(name)
    memo.set(name, value)
    return value
  }
  return resolve
}

const registerRe = /locale\.register\(\s*([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*,\s*\{([^{}]*)\}/g
// Language-pack shape: a local table of [locale, dictionary] pairs registered in a loop.
const loopRe = /for\s*\(\s*const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*of\s+([A-Za-z_$][\w$]*)\s*\)/g
const registerLoopRe = /locale\.register\(\s*([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g

function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < body.length) {
        if (body[i] === '\\') { i += 2; continue }
        if (body[i] === quote) break
        i++
      }
      continue
    }
    if (c === '{' || c === '[' || c === '(') depth++
    else if (c === '}' || c === ']' || c === ')') depth--
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts.filter((part) => part.trim() !== '')
}

// Parse `[["zh", {...}], ["en", {...}]]` into { zh: "<literal>", en: "<literal>" }.
function parsePairTable(arrayLiteral) {
  const open = arrayLiteral.indexOf('[')
  const close = matchDelimiter(arrayLiteral, open)
  const body = arrayLiteral.slice(open + 1, close - 1)
  const pairs = {}
  for (const element of splitTopLevel(body)) {
    const m = /^\s*\[\s*("[^"]*"|'[^']*')\s*,\s*\{/.exec(element)
    if (!m) continue
    const locale = m[1].slice(1, -1)
    const objStart = element.indexOf('{', m[0].length - 1)
    const objEnd = matchDelimiter(element, objStart)
    pairs[locale] = element.slice(objStart, objEnd)
  }
  return pairs
}

const namespaces = new Map()
const problems = []
const files = listClientBundles(root).sort()

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const pkg = path.basename(path.dirname(path.dirname(file)))
  const table = buildConstTable(text)
  const resolve = createResolver(table)
  const literal = (name) => {
    const expr = table.get(name)
    return expr === undefined ? undefined : expr.trim()
  }
  let m
  registerRe.lastIndex = 0
  while ((m = registerRe.exec(text)) !== null) {
    const nsArg = m[1]
    const ns = nsArg.startsWith('"') || nsArg.startsWith("'")
      ? nsArg.slice(1, -1)
      : (() => {
          const value = resolve(nsArg)
          return typeof value === 'string' ? value : undefined
        })()
    if (ns === undefined) {
      problems.push(`${pkg}: unresolved namespace const ${nsArg}`)
      continue
    }
    for (const pair of m[2].split(',').map((s) => s.trim()).filter(Boolean)) {
      const colon = pair.indexOf(':')
      const locale = (colon === -1 ? pair : pair.slice(0, colon)).trim()
      const ident = (colon === -1 ? pair : pair.slice(colon + 1)).trim()
      if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(locale)) {
        problems.push(`${pkg}/${ns}: odd locale token "${pair}"`)
        continue
      }
      const value = resolve(ident)
      if (value === null || typeof value !== 'object') {
        problems.push(`${pkg}/${ns}/${locale}: unresolved dictionary ${ident}`)
        continue
      }
      const bucket = namespaces.get(ns) ?? {}
      bucket[locale] = { pkg, file: path.relative(root, file), entries: value }
      namespaces.set(ns, bucket)
    }
  }

  // Language-pack loop shape: build each iterated pair table, then match the
  // three-argument register call that consumes it.
  const expressionOf = (name) => {
    const re = new RegExp(`(?:const|var|let)\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*`)
    const m = re.exec(text)
    return m === null ? undefined : extractExpression(text, m.index + m[0].length)
  }
  const loopTables = new Map()
  let loop
  loopRe.lastIndex = 0
  while ((loop = loopRe.exec(text)) !== null) {
    const literal = expressionOf(loop[3])
    if (literal === undefined) continue
    loopTables.set(`${loop[1]}|${loop[2]}`, parsePairTable(literal))
  }

  let call
  registerLoopRe.lastIndex = 0
  while ((call = registerLoopRe.exec(text)) !== null) {
    const [nsArg, localeVar, dictVar] = [call[1], call[2], call[3]]
    const pairs = loopTables.get(`${localeVar}|${dictVar}`)
    if (!pairs) continue
    const ns = nsArg.startsWith('"') || nsArg.startsWith("'")
      ? nsArg.slice(1, -1)
      : (() => {
          const value = resolve(nsArg)
          return typeof value === 'string' ? value : undefined
        })()
    if (ns === undefined) {
      problems.push(`${pkg}: unresolved loop namespace const ${nsArg}`)
      continue
    }
    for (const [locale, dictLiteral] of Object.entries(pairs)) {
      let value
      try {
        const refs = new Set()
        let m
        identifierRe.lastIndex = 0
        while ((m = identifierRe.exec(dictLiteral)) !== null) refs.add(m[0])
        const params = []
        const args = []
        for (const ref of refs) {
          if (!table.has(ref)) continue
          const dep = resolve(ref)
          if (dep === undefined) continue
          params.push(ref)
          args.push(dep)
        }
        value = new Function(...params, `return (${dictLiteral})`)(...args)
        if (value instanceof Promise) value = undefined
      } catch {
        value = undefined
      }
      if (value === null || typeof value !== 'object') {
        problems.push(`${pkg}/${ns}/${locale}: unresolved loop dictionary`)
        continue
      }
      const bucket = namespaces.get(ns) ?? {}
      bucket[locale] = { pkg, file: path.relative(root, file), entries: value }
      namespaces.set(ns, bucket)
    }
  }
}

const summary = []
for (const [ns, locales] of [...namespaces].sort((a, b) => a[0].localeCompare(b[0]))) {
  const en = locales.en?.entries ?? {}
  summary.push({
    namespace: ns,
    packages: [...new Set(Object.values(locales).map((l) => l.pkg))],
    keyCounts: Object.fromEntries(Object.entries(locales).map(([l, v]) => [l, Object.keys(v.entries).length])),
    sample: Object.fromEntries(Object.entries(en).slice(0, 3)),
  })
}

fs.writeFileSync(outFile, JSON.stringify({
  generatedFrom: root,
  namespaces: Object.fromEntries(namespaces),
  problems,
  summary,
}, null, 2))
console.log(`bundles scanned: ${files.length}`)
console.log(`namespaces: ${namespaces.size}, problems: ${problems.length}`)
let total = 0
for (const row of summary) {
  total += row.keyCounts.en ?? 0
  console.log(`${row.namespace.padEnd(28)} ${JSON.stringify(row.keyCounts).padEnd(34)} ${row.packages.join(',')}`)
}
console.log(`total en keys: ${total}`)
if (problems.length) {
  console.log('--- problems ---')
  for (const p of problems) console.log(p)
}
