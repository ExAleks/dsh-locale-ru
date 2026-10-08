// Capture clean screenshots of the Russian UI from a dedicated DSH instance.
//
// Usage:
//   node tools/capture-screenshots.mjs "http://127.0.0.1:3080/?token=<token>" docs/screenshots
//
// Expects a throwaway DSH home (`DSH_HOME` pointing at a scratch directory) with
// this pack installed, so no real sessions or account data can reach the frames.
// Chrome runs headless through the DevTools protocol; on a locked-down machine it
// may need `--disable-breakpad --no-crashpad` (already passed) and an environment
// that lets its crash handler start. Set `CHROME_PATH` to use another browser
// binary. The script only clicks read-only UI (dialogs, navigation, the language
// row) and never creates a session.
const [, , appUrl, outDir] = process.argv
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9333

fs.mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chromeLog = path.join(outDir, 'chrome.log')
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--disable-breakpad',
  '--no-crashpad',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(outDir, 'chrome-profile')}`,
  '--window-size=1600,1000',
  'about:blank',
], { stdio: ['ignore', 'ignore', fs.openSync(chromeLog, 'w')], windowsHide: true })
chrome.on('exit', (code) => console.log(`chrome exited with code ${code}`))
console.log(`chrome pid ${chrome.pid}`)

let ws
try {
  let version
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (response.ok) { version = await response.json(); break }
    } catch {}
    await sleep(500)
  }
  if (!version) throw new Error('DevTools endpoint never appeared')
  console.log(`chrome ${version.Browser}`)

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 0
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  }
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  const ua = await evaluate('navigator.userAgent')
  await send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'ru-RU,ru' })
  await send('Emulation.setLocaleOverride', { locale: 'ru-RU' }).catch(() => {})
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  })

  console.log('navigatingвЂ¦')
  await send('Page.navigate', { url: appUrl })
  await sleep(5000)
  await sleep(8000) // client boot, websocket connect, first render

  console.log(`html lang: ${await evaluate('document.documentElement.lang')}`)

  // Close the dialogs this throwaway instance shows (pre-release notice, API-key
  // onboarding) with real mouse clicks, so the frames show the app itself.
  const dismissDialogs = async (rounds = 3) => {
    const labels = ['РќР°СЃС‚СЂРѕРёС‚СЊ РїРѕР·Р¶Рµ', 'РџСЂРѕРґРѕР»Р¶РёС‚СЊ', 'РџСЂРѕРїСѓСЃС‚РёС‚СЊ', 'Р—Р°РєСЂС‹С‚СЊ']
    for (let round = 0; round < rounds; round++) {
      let clicked = false
      for (const label of labels) {
        const rect = await evaluate(`(() => {
          const nodes = [...document.querySelectorAll('button, [role="button"], div')];
          const button = nodes.find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
          if (!button) return null;
          const box = button.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return null;
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        })()`)
        if (!rect) continue
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        }
        console.log(`  dialog dismissed: ${label}`)
        clicked = true
        await sleep(2000)
        break
      }
      if (!clicked) break
    }
  }
  await dismissDialogs()

  // Hide the environment banner this throwaway instance shows about its workspace.
  const hidden = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('div, section, aside, li')];
    const banner = nodes.find((node) => {
      if (!/РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЂР°Р±РѕС‡СѓСЋ РѕР±Р»Р°СЃС‚СЊ|Р’С‹Р±РµСЂРёС‚Рµ РїР°РїРєСѓ/.test(node.textContent || '')) return false;
      const box = node.getBoundingClientRect();
      return box.height > 20 && box.height < 220 && box.width > 400;
    });
    if (!banner) return 'no banner';
    banner.style.display = 'none';
    return 'banner hidden';
  })()`)
  console.log(`workspace banner: ${hidden}`)
  await sleep(800)

  const shoot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = path.join(outDir, name)
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log(`saved ${name} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`)
  }

  await shoot('01-app.png')

  const clickText = async (pattern, exact = true) => {
    const expression = `(() => {
      const nodes = [...document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"]')];
      const match = nodes.find((node) => {
        const text = (node.textContent || '').trim();
        return ${exact} ? text === ${JSON.stringify(pattern)} : new RegExp(${JSON.stringify(pattern)}, 'i').test(text);
      });
      if (!match) return 'not found';
      match.click();
      return 'clicked: ' + (match.textContent || '').trim().slice(0, 30);
    })()`
    const result = await evaluate(expression)
    console.log(`  ${pattern}: ${result}`)
    return result
  }

  await clickText('РџР»Р°РіРёРЅС‹')
  await sleep(9000)
  await shoot('02-plugins.png')

  await clickText('РќР°СЃС‚СЂРѕР№РєРё')
  await sleep(3000)
  await clickText('РћР±С‰РёРµ')
  await sleep(2500)
  await shoot('03-settings.png')

  // Open the language selector to show the available languages.
  const languageRow = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], [role="combobox"], select, div')];
    const row = nodes.find((node) => /^РЇР·С‹Рє/.test((node.textContent || '').trim()) && node.getBoundingClientRect().height < 200);
    if (!row) return 'not found';
    row.click();
    return 'clicked language row';
  })()`)
  console.log(`  language row: ${languageRow}`)
  await sleep(2000)
  await shoot('04-language.png')

  const languages = await evaluate(`[...document.querySelectorAll('[role="option"], li, button')].map((n) => (n.textContent || '').trim()).filter((t) => /^(Р СѓСЃСЃРєРёР№|English|дё­ж–‡)$/.test(t)).join(', ')`)
  console.log(`languages offered: ${languages || 'РЅРµ РЅР°Р№РґРµРЅС‹'}`)
} catch (error) {
  console.error(`failure: ${error.message}`)
  try { console.error(fs.readFileSync(chromeLog, 'utf8').split('\n').slice(0, 6).join('\n')) } catch {}
  process.exitCode = 1
} finally {
  try { ws?.close() } catch {}
  try { chrome.kill() } catch {}
}

