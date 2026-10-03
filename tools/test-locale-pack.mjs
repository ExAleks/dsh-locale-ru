// Exercise the language pack's browser artifact against stand-in services that
// follow the shipped contracts: the locale lookup chain (language -> namespace ->
// common -> key) and the package-text resolver used for plugin/bundle display text.
import fs from 'node:fs'
import path from 'node:path'

const [, , packDir, localesFile] = process.argv

const pkg = JSON.parse(fs.readFileSync(path.join(packDir, 'package.json'), 'utf8'))
const shipped = JSON.parse(fs.readFileSync(localesFile, 'utf8')).namespaces
const packageText = JSON.parse(fs.readFileSync(path.join(packDir, 'translations', 'package-text.ru.json'), 'utf8'))

let captured
const fakeWindow = {
  __ModuleLoader__: {
    load(spec) {
      if (captured) throw new Error('the artifact registered more than one module')
      captured = spec
    },
  },
}

const source = fs.readFileSync(path.join(packDir, 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', source)(fakeWindow)

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

check(captured !== undefined, 'artifact called window.__ModuleLoader__.load')
check(captured?.id === pkg.name, `module id is the package name (${captured?.id} vs ${pkg.name})`)

const mod = captured.factory()
check(Array.isArray(mod.inject) && mod.inject.includes('locale'), 'module injects the locale service')

// Stand-in locale service: the shipped resolver reads the active language from a
// LocalizedText map and falls back to English; plain strings pass through.
let activeLocale = 'ru'
const originalResolveText = function resolveText(text) {
  if (typeof text === 'string') return text
  return text?.[activeLocale] ?? text?.en
}
const locale = {
  resolveText: originalResolveText,
  getLocale() {
    return { active: activeLocale }
  },
}

const languages = []
const dicts = new Map()
const disposers = []
let effects = 0
const ctx = {
  effect(fn, label) {
    effects++
    const disposer = fn()
    check(typeof disposer === 'function', `effect "${label}" returns a disposer`)
    disposers.push(disposer)
    return disposer
  },
  locale: {
    resolveText: locale.resolveText,
    getLocale: locale.getLocale,
    addLanguage(input) {
      languages.push(input)
      return () => {}
    },
    register(ns, localeId, entries) {
      if (dicts.has(ns)) throw new Error(`duplicate registration for ${ns}`)
      dicts.set(ns, { locale: localeId, entries })
      return () => {}
    },
  },
}
// The plugin patches the service instance it is handed.
ctx.locale = locale
locale.addLanguage = (input) => {
  languages.push(input)
  return () => {}
}
locale.register = (ns, localeId, entries) => {
  if (dicts.has(ns)) throw new Error(`duplicate registration for ${ns}`)
  dicts.set(ns, { locale: localeId, entries })
  return () => {}
}

mod.apply(ctx)

check(effects === dicts.size + 2, `one effect per resource (${effects} effects, ${dicts.size} dictionaries + language + package text)`)
check(languages.length === 1, 'exactly one language definition is added')

const language = languages[0] ?? {}
check(language.id === 'ru', `language id is "ru" (${language.id})`)
check(language.fallback === 'en', `language falls back to English (${language.fallback})`)
check(typeof language.label === 'string' && language.label.length > 0, 'language carries a label')
check(/^[A-Za-z]{2,8}$/.test(language.id ?? ''), 'language id is a BCP 47-style ASCII tag')

// Reference lookup: ru dictionary, then the shipped English dictionary of that
// namespace, then the same chain in `common`, then the key itself.
const chain = [language.id, language.fallback]
function translate(ns, key) {
  for (const [target, table] of [[ns, dicts.get(ns)?.entries], ['common', dicts.get('common')?.entries]]) {
    for (const localeId of chain) {
      const value = localeId === 'ru' ? table?.[key] : shipped[target]?.en?.entries?.[key]
      if (value !== undefined) return value
    }
  }
  return key
}

check(translate('settings.locale', 'language.title') === 'Язык', 'the Language row title resolves to Russian')
check(translate('approval', 'allowOnce') === 'Разрешить один раз', 'an approval action resolves to Russian')
check(translate('settings', 'desktop.update.ready') === 'Установить и перезапустить', 'a settings row resolves to Russian')
check(translate('voice-input', 'sourceHuggingFace') !== undefined, 'the added voice-input namespace resolves')

// A shipped key the pack deliberately leaves out (empty or separator-only copy)
// must still resolve through the English dictionary.
let untranslatedNs
let untranslatedKey
for (const [ns, bucket] of Object.entries(shipped)) {
  for (const key of Object.keys(bucket.en?.entries ?? {})) {
    if (dicts.get(ns)?.entries?.[key] === undefined) {
      untranslatedNs = ns
      untranslatedKey = key
      break
    }
  }
  if (untranslatedKey !== undefined) break
}
check(
  untranslatedKey !== undefined &&
    translate(untranslatedNs, untranslatedKey) === shipped[untranslatedNs].en.entries[untranslatedKey],
  `a key without a Russian entry still resolves through English (${untranslatedNs}.${untranslatedKey})`,
)

// Package display text (plugin and bundle cards).
const packageCards = Object.entries(packageText)
check(packageCards.length > 0, 'the pack ships package display text overrides')
check(locale.resolveText !== originalResolveText, 'the pack wraps the package-text resolver')

const [sampleSource, sampleRussian] = packageCards[0]
check(locale.resolveText(sampleSource) === sampleRussian, `a package title/description resolves to Russian ("${sampleSource.slice(0, 40)}")`)
check(
  locale.resolveText({ en: sampleSource, zh: '中文' }) === sampleRussian,
  'a LocalizedText map without Russian resolves through the override table',
)
check(locale.resolveText('Some unrelated text') === 'Some unrelated text', 'unknown text passes through untouched')
check(
  locale.resolveText({ en: 'Anything', ru: 'Текст из пакета' }) === 'Текст из пакета',
  'a package shipping its own Russian text wins over the table',
)

activeLocale = 'en'
check(locale.resolveText(sampleSource) === sampleSource, 'with English active the override does not apply')
activeLocale = 'ru'

for (const dispose of disposers) dispose()
check(locale.resolveText === originalResolveText, 'disposal restores the original package-text resolver')

let translatedKeys = 0
let englishKeys = 0
for (const ns of Object.keys(shipped)) englishKeys += Object.keys(shipped[ns].en?.entries ?? {}).length
for (const [, { entries }] of dicts) translatedKeys += Object.keys(entries).length

console.log(`module id:      ${captured.id}`)
console.log(`language:       ${language.id} (${language.label}), fallback ${language.fallback}`)
console.log(`dictionaries:   ${dicts.size}`)
console.log(`effects:        ${effects}`)
console.log(`package text:   ${packageCards.length} strings`)
console.log(`coverage:       ${translatedKeys}/${englishKeys} shipped dictionary keys (${((translatedKeys / englishKeys) * 100).toFixed(1)}%)`)

if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nall artifact checks passed')
