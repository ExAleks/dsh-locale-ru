// Print the en (and optionally zh) dictionaries for selected namespaces.
import fs from 'node:fs'

const [, , localesFile, ...wanted] = process.argv
const data = JSON.parse(fs.readFileSync(localesFile, 'utf8'))
const ns = data.namespaces
const list = wanted.length ? wanted : Object.keys(ns).sort()

for (const name of list) {
  const bucket = ns[name]
  if (!bucket) {
    console.log(`## ${name} — MISSING`)
    continue
  }
  console.log(`## ${name} (${Object.keys(bucket.en?.entries ?? {}).length} keys)`)
  console.log(JSON.stringify(bucket.en?.entries ?? {}, null, 1))
  console.log()
}
