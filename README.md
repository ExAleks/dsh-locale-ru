# DSH Locale RU

**Unofficial Russian localization for DeepSeek Harness (DSH).** Adds a `Русский` language to the desktop app: 2425 of 2428 UI strings across all 57 namespaces, plugin and bundle text, the native `Application` / `Edit` menu, and a Russian bonus notice.
**Неофициальная русская локализация DeepSeek Harness.**

**English** · [Русский](#русский)

---

## English

Russian language pack for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), shipped as an ordinary DSH client plugin bundle. This is an independent community project and is **not affiliated with or endorsed by DeepSeek**.

### What you get

| | |
|---|---|
| UI strings | **2425 of 2428** dictionary strings across **57 of 57** namespaces (99.9 %) |
| Plugin and bundle cards | **297** titles and descriptions resolved from package manifests |
| Language switch | a `Русский` (`ru`, English fallback) entry in **Settings → General → Language**, applied live without a restart |
| Native menu | `Application` / `Edit` with all submenus, the quit dialog, the welcome window and update screens — through an optional shell patch |
| Bonus notice | recomposed in Russian from the platform's structured `amount` / `currency` / `expires_at` fields instead of the English sentence the API returns |

Untranslated keys fall back to English, so a partial dictionary is always safe.

### Requirements

- **DeepSeek Harness Desktop** `0.2.0-rc.2` — the pack is built and verified against it;
- Node.js only for rebuilding from source (the Node shipped with DSH works: `resources\runtime\primary-runtime\dependencies\node\bin\node.exe`).

### Install

```bash
git clone https://github.com/ExAleks/dsh-locale-ru.git
dsh plugin --profile <profile> add "<path to the clone>"
```

`dsh plugin add` records the dependency in the profile's `package.json` and appends the bundle to `dsh.profile.bundles`. The GUI route is the same: **Plugins → Add plugin**, then point it at the absolute path.

Then pick **Settings → General → Language → Русский**. If the page was already open, reload it (Ctrl+R). The choice is stored in the Host settings, not in the browser.

Remove it the same way (**Plugins** page, or `dsh plugin --profile <profile> remove @local/dsh-locale-ru`); the language disappears from the list and the interface returns to English.

### Native menu (Electron shell)

The `Application` / `Edit` menu, the quit dialog, the welcome window and the update screens are drawn by the Electron shell, not by the web UI: its message dictionaries live inside `app.asar`, ship only `en` and `zh`, and the choice is hard-coded in `resolveDesktopLocale()`. No plugin can reach that code — plugins run in another process — so this part is an optional installer patch that adds a Russian table (164 messages) to the shell.

```bash
# 1. build a patched archive next to the original (the installation is untouched)
node tools/patch-desktop-locale.mjs --asar "<DSH>/resources/app.asar"

# 2. apply it while the app is closed — the script waits, keeps a backup, and leaves the start to you
tools\apply-desktop-menu.cmd apply

# revert
tools\apply-desktop-menu.cmd revert
```

On Windows `<DSH>` is `%LOCALAPPDATA%\Programs\DeepSeek Harness`, and step 2 is a double-click on `apply-desktop-menu.cmd`. On macOS and Linux there is no step 2: close the app and copy the built archive over `resources/app.asar` yourself, keeping the original for a revert.

Worth knowing:

- **It touches the installation**: `resources/app.asar` is replaced, the original stays next to it as `app.asar.backup`, and a revert is one command. Every DSH update overwrites the patch, so it has to be applied again.
- **The tool checks safety itself**: it reads Electron's fuse bits and refuses to patch when `app.asar` integrity validation is enabled (it is off in current builds); it verifies the message keys against the installed version and refuses to run if the product renamed them; it syntax-checks every file before writing and rebuilds the archive with a byte-for-byte check of all 12 967 entries.
- **The translation is additive**: Russian messages are layered over English, so anything untranslated stays English instead of going blank.
- **The language is chosen normally**: Russian when Settings says so or when the system language is Russian; `en` and `zh` behave exactly as before.
- **The script does not start the app**: a process launched from a console window is tied to it, and Windows terminates attached processes when that window closes. Start DSH from its shortcut or the Start menu instead, and close the script's window whenever you like.
- Verify the result without launching the app: `node tools/verify-desktop-patch.mjs --asar "<DSH>/resources/app.asar"`.

### What stays English

- **Module short names** (`persona`, `tool-bash`, `tool-fs-search`) — identifiers the product shows on purpose;
- **the account window** — a platform page with its own locale (`en_US` / `zh_CN`);
- **other server text** — the bonus notice is handled (see above), but arbitrary platform copy such as account error messages arrives ready-made;
- **agent content** — session titles, messages, code, command output;
- **the native menu** without the shell patch — it is unreachable from a plugin.

### Rebuilding and checks

```bash
# 1. pull the shipped dictionaries and manifests out of the installed DSH
node tools/asar-extract.mjs --asar "<DSH>/resources/app.asar" --out ref \
  --filter "node_modules/@deepseek-ai/[^/]+/(lib/client\.js|package\.json|locale/[a-z-]+\.json)$"
node tools/extract-locales.mjs ref/dsh/node_modules/@deepseek-ai ref/locales.json
node tools/collect-manifest-text.mjs ref/dsh/node_modules/@deepseek-ai ref/manifest-texts.json

# 2. build and test the artifact
node tools/build-locale-ru.mjs ref/locales.json translations/ru.json \
  translations/package-text.ru.json translations/server-messages.ru.json \
  ref/manifest-texts.json client.js @local/dsh-locale-ru
node tools/test-locale-pack.mjs . ref/locales.json

# 3. prove that client.js matches its sources (no DSH needed)
node tools/verify-in-sync.mjs .
```

The build fails when a key is missing from the shipped English dictionary or when a `{placeholder}` set differs, so typos cannot reach the interface. CI runs the manifest, JSON, syntax and artifact-drift checks on every push.

### License

MIT — see [LICENSE](LICENSE). Rights to DeepSeek Harness and its interface strings belong to their owners; only translations and plugin code live here. Files extracted from an installation (`ref/`) are never committed.

---

<a id="русский"></a>

## Русский

**Неофициальный русский языковой пакет для DeepSeek Harness (DSH).**

- **2425 из 2428** строк словарей интерфейса — **57 namespace** (вся обвязка продукта)
- **297** строк манифестов: названия и описания плагинов и бандлов
- язык **«Русский»** появляется в *Настройки → Общие → Язык*, переключение мгновенное, без перезапуска
- непереведённое автоматически падает на английский, поэтому словарь можно дополнять частями
- уведомление о начисленном бонусе собирается по-русски из структурированных полей платформы
- **нативное меню** приложения (`Application`, `Edit` и всё внутри), диалог выхода, окно приветствия и экраны обновления — отдельным опциональным патчем шелла, см. [Нативное меню](#нативное-меню-electron-шелл)
- основная часть — обычный клиентский плагин-бандл DSH: включается, выключается и удаляется как любой другой

### Требования

- установленный **DeepSeek Harness Desktop** `0.2.0-rc.2` (пакет собран и проверен на нём);
- для сборки из исходников — Node.js (подойдёт Node из поставки DSH).

### Установка

```bash
git clone https://github.com/ExAleks/dsh-locale-ru.git
dsh plugin --profile <профиль> add "<путь к клонированному каталогу>"
```

`dsh plugin add` добавляет зависимость в `package.json` профиля и вписывает бандл в `dsh.profile.bundles`. То же самое можно сделать из GUI: **Плагины → Добавить плагин** и указать абсолютный путь к каталогу.

Затем в интерфейсе: **Настройки → Общие → Язык → Русский**. Если страница была открыта до установки — обновите её (Ctrl+R). Выбор языка сохраняется в настройках хоста, а не в браузере.

Дальше по желанию — [патч нативного меню](#нативное-меню-electron-шелл): он трогает файлы установки, поэтому вынесен отдельно.

Удалить пакет: на странице **Плагины** или командой `dsh plugin --profile <профиль> remove @local/dsh-locale-ru`. Язык при этом исчезает из списка, а интерфейс возвращается к английскому.

### Нативное меню (Electron-шелл)

Меню `Application` / `Edit`, диалог выхода, окно приветствия и экраны обновления рисует не веб-интерфейс, а сам Electron-шелл: его словари сообщений лежат внутри `app.asar`, поддерживают только `en` и `zh`, а выбор языка зашит в `resolveDesktopLocale()`. Ни клиентский, ни host-плагин до этого кода не достаёт — плагины работают в другом процессе, а `app.asar` занят запущенным приложением.

Патч добавляет в шелл русскую таблицу ([desktop-shell/ru.json](desktop-shell/ru.json), 164 сообщения) и учит резолвер отдавать её для русского языка.

```bash
# 1. собрать патченный архив рядом с исходным (установка не меняется, всё проверяется)
node tools/patch-desktop-locale.mjs --asar "<DSH>/resources/app.asar"

# 2. применить при закрытом приложении — скрипт сам ждёт закрытия и делает бэкап
tools\apply-desktop-menu.cmd apply

# откат
tools\apply-desktop-menu.cmd revert
```

На Windows `<DSH>` — это `%LOCALAPPDATA%\Programs\DeepSeek Harness`, шаг 2 удобно делать двойным кликом по `apply-desktop-menu.cmd`. На macOS и Linux шага 2 нет: закройте приложение и замените `resources/app.asar` собранным архивом вручную (`cp`), сохранив копию оригинала для отката.

После применения **запустите приложение сами** — ярлыком или из меню «Пуск». Скрипт намеренно не запускает DSH: процесс, запущенный из консольного окна, привязан к этому окну, и Windows завершает все привязанные процессы, когда окно закрывают. Запуск ярлыком принадлежит оболочке, поэтому приложение не связано с окном скрипта, и его можно закрывать когда угодно.

Что важно знать:

- **Патч трогает файлы установки**: `resources/app.asar` заменяется, оригинал остаётся рядом как `app.asar.backup` — откат одной командой. После каждого обновления DSH патч слетает и применяется заново.
- **Инструмент проверяет безопасность сам**: читает fuse-биты Electron и отказывается патчить, если включена проверка целостности `app.asar` (в текущих сборках выключена); сверяет ключи сообщений с установленной версией и отказывается работать, если продукт их переименовал; проверяет синтаксис каждого файла перед записью и пересобирает архив с побайтовой сверкой всех 12 967 записей.
- **Перевод не разрушающий**: русские сообщения накладываются поверх английских, поэтому непереведённые пункты меню и диалогов остаются английскими, а не пустыми.
- **Язык выбирается штатно**: русский — если в настройках выбран «Русский» или системный язык русский; для `en` и `zh` поведение не меняется.
- Проверить результат, не запуская приложение: `node tools/verify-desktop-patch.mjs --asar "<DSH>/resources/app.asar"`.

### Сборка из исходников

Весь инструментарий — на Node.js, без зависимостей. `ref/` в репозитории нет: он генерируется из вашей установки.

```bash
# 1. вытащить встроенные словари и манифесты из установленного DSH
node tools/asar-extract.mjs --asar "<DSH>/resources/app.asar" --out ref \
  --filter "node_modules/@deepseek-ai/[^/]+/(lib/client\.js|package\.json|locale/[a-z-]+\.json)$"
node tools/extract-locales.mjs ref/dsh/node_modules/@deepseek-ai ref/locales.json
node tools/collect-manifest-text.mjs ref/dsh/node_modules/@deepseek-ai ref/manifest-texts.json

# 2. собрать и проверить артефакт
node tools/build-locale-ru.mjs ref/locales.json translations/ru.json \
  translations/package-text.ru.json translations/server-messages.ru.json \
  ref/manifest-texts.json client.js @local/dsh-locale-ru
node tools/test-locale-pack.mjs . ref/locales.json

# 3. проверить, что client.js соответствует исходникам (DSH не нужен)
node tools/verify-in-sync.mjs .
```

### Как переводить

| Файл | Что внутри |
|---|---|
| `translations/ru.json` | словари интерфейса: `namespace → ключ → русский текст`. Ключи должны совпадать с ключами встроенных английских словарей |
| `translations/package-text.ru.json` | «точная английская строка → русская» для названий и описаний плагинов и бандлов |
| `translations/server-messages.ru.json` | шаблоны для текста, который приходит с сервера (сейчас — уведомление о начисленном бонусе) |
| `desktop-shell/ru.json` | сообщения Electron-шелла по ключам: меню, диалоги выхода, приветствие, обновления |
| `client.js` | собранный артефакт, генерируется сборкой — руками не править |

Сборка падает, если ключа нет во встроенном английском словаре или разошёлся набор `{плейсхолдеров}` — опечатка не уедет в интерфейс. После правки: пересборка + `verify-in-sync.mjs` (и `test-locale-pack.mjs`, если DSH установлен). Затем Ctrl+R: URL модуля содержит rev-хеш содержимого, поэтому страница забирает свежую версию.

### Как устроено

- **Плагин.** `package.json` объявляет `dsh.bundle.patch` (патч-строка в композиции профиля) и `dsh.client` (браузерная половина), `cordis.patch.yml` вставляет строку `locale-ru`, `client.js` регистрируется через `window.__ModuleLoader__.load`.
- **Язык и словари.** `ctx.locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' })` добавляет язык в каталог, `ctx.locale.register(namespace, 'ru', {...})` — словари. Поиск идёт по цепочке `ru → en → common → сам ключ`.
- **Тексты манифестов.** Названия и описания плагинов и бандлов приходят из `locale/en.json` и `package.json` самих пакетов (там только `en` и `zh`), а `resolveText` словари языковых пакетов не смотрит. Поэтому пакет на время своей загрузки оборачивает этот резолвер: срабатывает только при активном русском и только на точное совпадение с известной строкой, отдаёт приоритет пакетному `ru`, всё остальное пропускает без изменений и снимает обёртку при выгрузке.
- **Тексты с сервера.** Уведомление о начисленном бонусе приходит с платформы готовой английской фразой (`msg`), хотя рядом лежат структурированные `amount`, `currency` и `expires_at`, а язык запроса клиент уже передаёт. Пока активен русский, пакет перехватывает чтение этого списка и собирает фразу сам: сумма, валюта и дата в русском формате с часовым поясом. Если полей нет или дата нечитаемая, остаётся текст сервера — ничего не додумывается.
- **Шелл.** Патч вставляет `const ru = {...}` перед резолвером в `lib/main.js`, `lib/preload-app.cjs` и `lib/preload-welcome.cjs`, а `resolveDesktopLocale()` начинает возвращать русские сообщения поверх английских для языка `ru`.

### Инструменты

| Скрипт | Назначение |
|---|---|
| `asar-extract.mjs` | чтение `app.asar` без зависимостей: `--list`, `--out` с фильтром по путям, `--grep` с поиском по содержимому |
| `extract-locales.mjs` | собирает все встроенные словари (`ref/locales.json`) |
| `collect-manifest-text.mjs` | собирает display-тексты пакетов (`ref/manifest-texts.json`) |
| `build-locale-ru.mjs` | сборка `client.js` с проверкой ключей и плейсхолдеров |
| `test-locale-pack.mjs` | тест артефакта против установленного DSH |
| `verify-in-sync.mjs` | офлайн-проверка «client.js == исходники» (используется в CI) |
| `extract-desktop-messages.mjs` | вытаскивает словари сообщений шелла из его `lib/main.js` |
| `patch-desktop-locale.mjs` | вставляет русскую таблицу в шелл и пересобирает `app.asar` (`--dry-run`, `--revert`, `--force`) |
| `verify-desktop-patch.mjs` | проверяет резолвер локали в собранном архиве без запуска Electron |
| `apply-desktop-menu.cmd` | применяет и откатывает патч шелла: ждёт закрытия приложения, делает бэкап |
| `show-locales.mjs` | печатает английские строки выбранных namespace |
| `audit-client-entries.mjs` | сверяет клиентские точки входа из манифестов с просканированными |
| `make-ru-work.mjs`, `merge-ru.mjs` | нарезка заданий на перевод и слияние с проверками |
| `make-pkgtext-work.mjs`, `merge-pkgtext.mjs` | то же для текстов манифестов |

### Структура репозитория

```
client.js                        собранный браузерный артефакт плагина
index.js, cordis.patch.yml       host-половина и патч-строка бандла
locale/ru.json, locale/en.json   название и описание пакета для карточки плагина
translations/                    словари интерфейса, тексты манифестов, серверные шаблоны
desktop-shell/ru.json            сообщения Electron-шелла для патча меню
tools/                           извлечение, сборка, тесты, патч шелла
.github/workflows/check.yml      CI: манифест, JSON, синтаксис, соответствие артефакта исходникам
```

### Что не локализуется

- **короткие имена модулей** (`persona`, `tool-bash`, `tool-fs-search`) — это идентификаторы, продукт показывает их намеренно;
- **окно аккаунта** — встроенная страница платформы, её язык задаётся отдельно (`en_US`/`zh_CN`);
- **остальные тексты с сервера**: уведомление о бонусе пакет собирает сам (см. [Как устроено](#как-устроено)), но произвольный текст платформы, например сообщения об ошибках аккаунта, приходит готовым и не переводится;
- **контент агента** — заголовки сессий, сообщения, код, вывод команд;
- **нативное меню** без [патча шелла](#нативное-меню-electron-шелл) остаётся английским: до кода шелла плагин не достаёт.

### Совместимость и обновления

Пакет собран под DSH `0.2.0-rc.2` (Desktop). Словари сверяются с установленной сборкой: после обновления DSH пересоберите `ref/locales.json` и запустите сборку — она сообщит о расхождениях, а непереведённое просто останется английским. Патч шелла устроен так же (`patch-desktop-locale.mjs` сверяет ключи и откажется работать при переименовании сообщений) и требует повторного применения после каждого обновления.

### Что нового

**0.2.1**

- `apply-desktop-menu.cmd` больше не запускает приложение: процесс из консольного окна привязан к нему, и закрытие окна закрывало DSH. Теперь скрипт применяет патч, печатает путь к приложению и оставляет запуск пользователю.

**0.2.0**

- русское **нативное меню** и диалоги шелла: 164 сообщения, патч `app.asar` с проверками, бэкапом и откатом;
- уведомление о начисленном бонусе собирается из структурированных полей платформы, а не показывается английской фразой сервера;
- `asar-extract.mjs` получил режим `--grep`, добавлены инструменты для шелла, CI проверяет и их.

**0.1.0**

- первый выпуск: язык «Русский», 2425 строк словарей в 57 namespace, 297 строк манифестов, покрытие 99,9 %;
- сборка со сверкой ключей и плейсхолдеров, тест артефакта и офлайн-проверка синхронности в CI.

### Лицензия и правовая оговорка

MIT — см. [LICENSE](LICENSE).

Неофициальный проект, не связан с DeepSeek. Права на DeepSeek Harness и его строки интерфейса принадлежат их владельцам; здесь публикуются только переводы и код плагина. Файлы, извлечённые из установки (`ref/`), в репозиторий не попадают.
