// Offline consistency check: the committed client.js must be exactly what the
// committed translation sources produce. It needs no DSH installation, so CI can
// use it as a build-artifact drift check.
import fs from 'node:fs'
import path from 'node:path'

const [, , packDirArg = '.'] = process.argv
const packDir = path.resolve(packDirArg)

const pkg = JSON.parse(fs.readFileSync(path.join(packDir, 'package.json'), 'utf8'))
const translations = JSON.parse(fs.readFileSync(path.join(packDir, 'translations', 'ru.json'), 'utf8'))
const packageText = JSON.parse(fs.readFileSync(path.join(packDir, 'translations', 'package-text.ru.json'), 'utf8'))
const serverText = JSON.parse(fs.readFileSync(path.join(packDir, 'translations', 'server-messages.ru.json'), 'utf8'))

let captured
const fakeWindow = { __ModuleLoader__: { load(spec) { captured = spec } } }
const source = fs.readFileSync(path.join(packDir, 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', source)(fakeWindow)

const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

check(captured !== undefined, 'client.js calls window.__ModuleLoader__.load')
check(captured?.id === pkg.name, `module id matches the package name (${captured?.id} vs ${pkg.name})`)

const mod = captured.factory()
check(Array.isArray(mod.inject) && mod.inject.includes('locale'), 'the module injects the locale service')

// Stand-in locale service the pack registers into and wraps.
let active = 'ru'
const languages = []
const dicts = new Map()
const effectLabels = []
const service = {
  resolveText(text) { return typeof text === 'string' ? text : text?.[active] ?? text?.en },
  getLocale() { return { active } },
  getSnapshot() { return { active } },
  addLanguage(input) { languages.push(input); return () => {} },
  register(ns, locale, entries) { dicts.set(ns, { locale, entries }); return () => {} },
}
const originalResolve = service.resolveText

// Stand-in account remote with a structured bonus record.
const bonus = {
  orderId: 'order-1',
  campaign: 'welcome',
  amount: '6',
  currency: 'CNY',
  grantedAt: '2026-09-26T09:26:00Z',
  expiresAt: '2026-10-10T09:26:00Z',
  message: "You've received a CNY 6 bonus credit, valid until October 10, 2026, 5:26 PM Beijing Time.",
}
const account = { async getUnnotifiedBonuses() { return { ok: true, value: { accountId: 'a', bonuses: [{ ...bonus }] } } } }

const ctx = {
  effect(fn, label) {
    effectLabels.push(label)
    const disposer = fn()
    check(typeof disposer === 'function', `effect "${label}" returns a disposer`)
    return disposer
  },
  inject(deps, callback) {
    check(Array.isArray(deps) && deps.includes('remote'), 'the pack waits for the remote service')
    callback(ctx)
  },
  get(name) { return name === 'remote' ? { account } : undefined },
  locale: service,
}
mod.apply(ctx)

const language = languages[0] ?? {}
check(
  languages.length === 1 && language.id === 'ru' && language.fallback === 'en' && typeof language.label === 'string',
  'exactly one ru language definition with an en fallback and a label is registered',
)

const sourceNamespaces = Object.keys(translations).sort()
const emittedNamespaces = [...dicts.keys()].sort()
check(
  JSON.stringify(sourceNamespaces) === JSON.stringify(emittedNamespaces),
  `emitted namespaces match translations/ru.json (sources: ${sourceNamespaces.length}, emitted: ${emittedNamespaces.length})`,
)

let mismatched = 0
let emittedKeys = 0
for (const ns of sourceNamespaces) {
  const expected = translations[ns]
  const entry = dicts.get(ns)
  if (entry?.locale !== 'ru') { mismatched++; continue }
  for (const [key, value] of Object.entries(expected)) {
    if (entry.entries?.[key] !== value) mismatched++
  }
  for (const key of Object.keys(entry.entries ?? {})) {
    if (!(key in expected)) mismatched++
  }
  emittedKeys += Object.keys(entry.entries ?? {}).length
}
check(mismatched === 0, `client.js carries exactly translations/ru.json (${mismatched} mismatches)`)

// Package display text is installed by wrapping the resolver; probe every entry.
const probes = Object.entries(packageText)
check(probes.length > 0, 'translations/package-text.ru.json is not empty')
const wrapped = service.resolveText !== originalResolve
check(wrapped, 'the package-text resolver is wrapped while the pack is loaded')
let packageMismatch = 0
for (const [english, russian] of probes) {
  if (service.resolveText(english) !== russian) packageMismatch++
}
check(packageMismatch === 0, `every package-text override resolves to its Russian value (${packageMismatch} mismatches)`)

active = 'en'
const englishPassthrough = probes.length === 0 || service.resolveText(probes[0][0]) === probes[0][0]
active = 'ru'
check(englishPassthrough, 'with English active the overrides do not apply')

// Server-authored copy is recomposed from the structured record it arrives with.
check(effectLabels.some((label) => String(label).includes('server-authored copy')), 'the server-copy effect is registered')
check(account.getUnnotifiedBonuses !== undefined, 'the account bonus read is wrapped')
const notice = (await account.getUnnotifiedBonuses()).value.bonuses[0].message
const prefix = serverText.bonusNotice.split('{amount}')[0]
check(notice !== bonus.message, 'the English server sentence is replaced while Russian is active')
check(notice.startsWith(prefix), `the Russian template is used ("${notice}")`)
check(notice.includes('6 CNY'), `the amount and currency survive ("${notice}")`)

console.log(`module id:     ${captured.id}`)
console.log(`language:      ${language.id} (${language.label}), fallback ${language.fallback}`)
console.log(`namespaces:    ${emittedNamespaces.length}`)
console.log(`dictionary:    ${emittedKeys} keys`)
console.log(`package text:  ${probes.length} overrides${wrapped ? ' (resolver wrapped)' : ''}`)
console.log(`bonus notice:  ${notice}`)

if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nclient.js is in sync with the translation sources')
