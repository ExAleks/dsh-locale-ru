// Collect the display text every installed package exposes to the UI: the
// `meta.title`/`meta.description` of its locale/en.json plus its manifest
// description. These strings are resolved by the locale service's package-text
// path, not by namespace dictionaries.
import fs from 'node:fs'
import path from 'node:path'

const [, , packagesRoot, outFile] = process.argv

const rows = []
for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgDir = path.join(packagesRoot, entry.name)
  const localeFile = path.join(pkgDir, 'locale', 'en.json')
  const manifestFile = path.join(pkgDir, 'package.json')
  let title
  let description
  let source = 'locale/en.json'
  if (fs.existsSync(localeFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(localeFile, 'utf8')).meta ?? {}
      title = meta.title
      description = meta.description
    } catch {
      // unpacked or malformed manifest; skip
      continue
    }
  }
  if (title === undefined && fs.existsSync(manifestFile)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      title = manifest.name
      description = manifest.description
      source = 'package.json'
    } catch {
      continue
    }
  }
  if (title === undefined && description === undefined) continue
  rows.push({ package: entry.name, source, title, description })
}

fs.writeFileSync(outFile, `${JSON.stringify(rows, null, 2)}\n`)
console.log(`packages with display text: ${rows.length}`)
console.log(`with description: ${rows.filter((r) => r.description).length}`)
for (const row of rows.filter((r) => r.source === 'locale/en.json')) {
  console.log(`  ${row.package.padEnd(46)} ${row.title}`)
}
