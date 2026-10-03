# DSH Locale RU

**Неофициальный русский языковой пакет для веб-интерфейса DeepSeek Harness (DSH).**
Unofficial Russian language pack for the DeepSeek Harness (DSH) web UI.

- **2425 из 2428** строк словарей интерфейса — **57 namespace**, покрытие 99,9 %
- **297** строк манифестов: названия и описания плагинов и бандлов
- язык **«Русский»** появляется в *Настройки → Общие → Язык*, переключение мгновенное
- непереведённое автоматически падает на английский, поэтому неполный словарь безопасен
- это обычный клиентский плагин-бандл DSH: включается, выключается и удаляется как любой другой
- **нативное меню** приложения (`Application`, `Edit` и всё внутри) локализуется отдельным опциональным патчем шелла — см. [Нативное меню](#нативное-меню-electron-шелл)

## Установка

```bash
git clone https://github.com/ExAleks/dsh-locale-ru.git
dsh plugin --profile <профиль> add "<путь к клонированному каталогу>"
```

`dsh plugin add` добавляет зависимость в `package.json` профиля и вписывает бандл в `dsh.profile.bundles`. То же самое можно сделать из GUI: **Плагины → Добавить плагин** и указать абсолютный путь к каталогу.

Затем в интерфейсе: **Настройки → Общие → Язык → Русский**. Если страница была открыта до установки — обновите её (Ctrl+R). Выбор языка сохраняется в настройках хоста, а не в браузере.

Удалить: на странице **Плагины** или командой `dsh plugin --profile <профиль> remove @local/dsh-locale-ru`.

## Сборка из исходников

Весь инструментарий — на Node.js (подойдёт Node из поставки DSH). `ref/` в репозитории нет: он генерируется из вашей установки.

```bash
# 1. вытащить встроенные словари и манифесты из установленного DSH
node tools/asar-extract.mjs --asar "<DSH>/resources/app.asar" --out ref \
  --filter "node_modules/@deepseek-ai/[^/]+/(lib/client\.js|package\.json|locale/[a-z-]+\.json)$"
node tools/extract-locales.mjs ref/dsh/node_modules/@deepseek-ai ref/locales.json
node tools/collect-manifest-text.mjs ref/dsh/node_modules/@deepseek-ai ref/manifest-texts.json

# 2. собрать и проверить артефакт
node tools/build-locale-ru.mjs ref/locales.json translations/ru.json \
  translations/package-text.ru.json ref/manifest-texts.json client.js @local/dsh-locale-ru
node tools/test-locale-pack.mjs . ref/locales.json

# 3. проверить, что client.js соответствует исходникам (DSH не нужен)
node tools/verify-in-sync.mjs .
```

На Windows `<DSH>` — это `C:\Users\<вы>\AppData\Local\Programs\DeepSeek Harness`; на macOS — `/Applications/DeepSeek Harness.app/Contents/Resources`.

## Как переводить

| Файл | Что внутри |
|---|---|
| `translations/ru.json` | словари интерфейса: `namespace → ключ → русский текст`. Ключи должны совпадать с ключами встроенных английских словарей |
| `translations/package-text.ru.json` | «точная английская строка → русская» для названий и описаний плагинов и бандлов |
| `client.js` | собранный артефакт, генерируется сборкой — руками не править |

Сборка падает, если ключа нет во встроенном английском словаре или разошёлся набор `{плейсхолдеров}` — опечатка не уедет в интерфейс. После правки: пересборка + `verify-in-sync.mjs` (и `test-locale-pack.mjs`, если DSH установлен). Затем Ctrl+R — URL модуля содержит rev-хеш содержимого, поэтому страница забирает свежую версию.

## Как устроено

- **Плагин.** `package.json` объявляет `dsh.bundle.patch` (патч-строка в композиции профиля) и `dsh.client` (браузерная половина), `cordis.patch.yml` вставляет строку `locale-ru`, `client.js` регистрируется через `window.__ModuleLoader__.load`.
- **Язык и словари.** `ctx.locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' })` добавляет язык в каталог, `ctx.locale.register(namespace, 'ru', {...})` — словари. Поиск идёт по цепочке `ru → en → common → сам ключ`.
- **Тексты манифестов.** Названия и описания плагинов и бандлов приходят из `locale/en.json` и `package.json` самих пакетов (там только `en` и `zh`), а `resolveText` словари языковых пакетов не смотрит. Поэтому пакет на время своей загрузки оборачивает этот резолвер: срабатывает только при активном русском и только на точное совпадение с известной строкой, отдаёт приоритет пакетному `ru`, всё остальное пропускает без изменений и снимает обёртку при выгрузке.

## Нативное меню (Electron-шелл)

Меню `Application` / `Edit`, диалог выхода, окно приветствия и экраны обновления рисует не веб-интерфейс, а сам Electron-шелл: его собственные словари сообщений лежат внутри `app.asar`, поддерживают только `en` и `zh`, а выбор языка зашит в `resolveDesktopLocale()`. Ни клиентский, ни host-плагин до этого кода не достаёт — плагины работают в другом процессе.

Для этого случая в репозитории есть опциональный патч установки: он добавляет в шелл русскую таблицу ([desktop-shell/ru.json](desktop-shell/ru.json), 164 сообщения) и учит резолвер отдавать её для русского языка.

```bash
# 1. собрать патченный app.asar рядом с исходным (безопасно, установка не меняется)
node tools/patch-desktop-locale.mjs --asar "<DSH>/resources/app.asar"

# 2. закрыть DSH и применить (скрипт сам ждёт закрытия, делает бэкап и перезапускает)
tools\apply-desktop-menu.cmd apply

# откат
tools\apply-desktop-menu.cmd revert
```

Что важно знать:

- **Патч трогает файлы установки**: `resources/app.asar` заменяется, оригинал остаётся рядом как `app.asar.backup`, откат — одна команда. После обновления DSH патч нужно применить заново.
- **Инструмент сам проверяет безопасность**: читает fuse-биты Electron и отказывается работать, если включена проверка целостности `app.asar` (у текущих сборок она выключена); перед записью сверяет ключи сообщений с установленной версией, проверяет синтаксис каждого файла и пересобирает архив с проверкой всех 12 967 записей.
- **Перевод не разрушающий**: русские сообщения накладываются поверх английских, поэтому любые непереведённые пункты меню и диалогов остаются английскими, а не пустыми.
- **Язык выбирается штатно**: если в настройках выбран «Русский» (или системный язык русский), меню и диалоги становятся русскими; для `en` и `zh` поведение не меняется.
- Проверить результат без запуска приложения: `node tools/verify-desktop-patch.mjs --asar "<DSH>/resources/app.asar.patched"`.

## Инструменты

| Скрипт | Назначение |
|---|---|
| `asar-extract.mjs` | чтение `app.asar` без зависимостей: `--list`, `--out` с фильтром по путям, `--grep` с поиском по содержимому |
| `extract-locales.mjs` | собирает все встроенные словари (`ref/locales.json`) |
| `collect-manifest-text.mjs` | собирает display-тексты пакетов (`ref/manifest-texts.json`) |
| `build-locale-ru.mjs` | сборка `client.js` с проверкой ключей и плейсхолдеров |
| `test-locale-pack.mjs` | тест артефакта против установленного DSH |
| `verify-in-sync.mjs` | офлайн-проверка «client.js == исходники» (используется в CI) |
| `extract-desktop-messages.mjs` | вытаскивает словари сообщений шелла из его `lib/main.js` |
| `patch-desktop-locale.mjs` | вставляет русскую таблицу в шелл и пересобирает `app.asar` (есть `--revert`, `--dry-run`) |
| `verify-desktop-patch.mjs` | проверяет резолвер локали в патченном архиве без запуска Electron |
| `apply-desktop-menu.cmd` | применяет и откатывает патч шелла: ждёт закрытия приложения, делает бэкап, перезапускает |
| `show-locales.mjs` | печатает английские строки выбранных namespace |
| `audit-client-entries.mjs` | сверяет клиентские точки входа из манифестов с просканированными |
| `make-ru-work.mjs`, `merge-ru.mjs` | нарезка заданий на перевод и слияние с проверками |
| `make-pkgtext-work.mjs`, `merge-pkgtext.mjs` | то же для текстов манифестов |

## Что не локализуется

- **короткие имена модулей** (`persona`, `tool-bash`, `tool-fs-search`) — это идентификаторы, продукт показывает их намеренно;
- **нативное меню окна** (`Application`, `Edit`) — его строит Electron-шелл, меню не проходит через словари и требует [опционального патча](#нативное-меню-electron-шелл);
- **окно аккаунта** — встроенная страница платформы, её язык задаётся отдельно (`en_US`/`zh_CN`);
- **тексты с сервера** (например уведомления аккаунта) и **контент агента** — заголовки сессий, сообщения, код, вывод команд.

## Совместимость

Пакет собран под DSH `0.2.0-rc.2` (Desktop). Словари сверяются с установленной сборкой, поэтому после обновления DSH набор ключей может измениться: пересоберите `ref/locales.json` и запустите сборку — она сообщит о расхождениях, а непереведённое просто останется английским. Патч шелла пересобирается так же (`patch-desktop-locale.mjs` сверяет ключи и откажется работать, если продукт переименовал сообщения) и требует повторного применения после каждого обновления DSH.

## English

Unofficial Russian language pack for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI, shipped as an ordinary DSH client plugin bundle. It adds a `Русский` (`ru`, English fallback) language with Russian dictionaries for 57 namespaces (2425 of 2428 UI strings) plus Russian titles and descriptions for plugin and bundle cards.

```bash
git clone https://github.com/ExAleks/dsh-locale-ru.git
dsh plugin --profile <profile> add "<path to the clone>"
```

Then pick **Settings → General → Language → Русский**. Rebuilding from source, the toolchain and the known limitations are described above; the artifact is CI-checked against its translation sources with `tools/verify-in-sync.mjs`.

Not affiliated with DeepSeek. Rights to DeepSeek Harness and its interface strings belong to their owners; only translations and plugin code live here. Extracted installation files (`ref/`) are never committed.

## Лицензия

MIT — см. [LICENSE](LICENSE).
