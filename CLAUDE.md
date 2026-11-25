# Vault — личная база знаний разработчика (Electron)

Ответы пользователю — на русском. **UI-тексты — українською** (весь інтерфейс, main-процес, розширення, сиди нових баз; дати й числа — локаль `uk`).

## Обязательные правила работы

1. **Документация только актуальная.** Перед использованием любого API библиотеки (Electron, electron-vite, electron-builder, electron-updater, Drizzle, better-sqlite3, React 19, React Router 8, TanStack Query, Zustand, Tailwind v4, shadcn, dnd-kit, CodeMirror, zod 4…) — сверяйся через **Context7** (`resolve-library-id` → `query-docs`). Версии в проекте свежие (Electron 44, Vite 8, TS 5.9, zod 4), память может врать — пример: в Electron 44 `clipboard` асинхронный (W3C API), `clipboard.readImage()` нет.
2. **Скилы — использовать все подходящие**, не изобретать процесс заново:
   - **`shadcn` (скил shadcn/ui) — обязательно** при любой работе с компонентами интерфейса: выбор компонента, добавление (`npx shadcn@latest add`), композиция, варианты и темизация. Лежит в репозитории: `.agents/skills/shadcn` (для Claude Code подключён ссылкой `.claude/skills/shadcn`; если ссылки нет — `New-Item -ItemType Junction -Path .claude\skills\shadcn -Target <корень>\.agents\skills\shadcn`). Агенту без доступа к скилу — прочитать `.agents/skills/shadcn/SKILL.md` и `rules/*.md` перед UI-правками;
   - `frontend-design` — перед любой новой/переделываемой UI-частью;
   - `ui-design-review:ui-review` / `ui-design-review:ui-polish` — ревью и полировка экранов по скриншотам;
   - `design:accessibility-review` — контраст, фокус, клавиатура;
   - `design:ux-copy` — тексты кнопок, пустые состояния, ошибки;
   - `engineering:architecture` / `engineering:system-design` — новые подсистемы, модель данных;
   - `engineering:debug` — при багах; `engineering:testing-strategy`, `e2e-test-generator:*` — тесты;
   - `code-review`, `simplify`, `security-review` — после крупных изменений;
   - `engineering:deploy-checklist` — перед релизом; `run` — запуск приложения и проверка вживую;
   - `dataviz` — перед любыми графиками/диаграммами.
   Если для задачи нет скила — поищи и предложи пользователю установить плагин/скил.
3. **SOLID по-реактовски, без FSD:**
   - S — компонент делает одно; логика данных в хуках (`useApi`, `useAutosave`…), разметка в компонентах; модули бэкенда разделены по ответственности (репозиторий / сервис / API-фабрика).
   - O — сквозные фичи (поиск, метки, связи, закрепы, корзина, экспорт) работают через реестр `EntityRegistry`: новый модуль = новый `EntityDescriptor`, без правок сквозного кода.
   - L — модули расширяют `SoftRepository`, не ломая базовое поведение.
   - I — узкие интерфейсы API на модуль (`IdeasApi`, `CardsApi`…), общий `CrudApi` только там, где он подходит.
   - D — renderer и main зависят от контракта `src/shared/api.ts`; зависимости в main передаются через конструктор (`src/main/container.ts` — composition root), никаких глобалов.
4. **UI только из shadcn.** Любой элемент интерфейса собирается из компонентов shadcn (`src/renderer/src/components/ui`). Нужного компонента нет — сначала ищи его в реестре и добавляй через `npx shadcn@latest add <name>`, документацию сверяй в Context7. Самописный компонент допустим, только если в shadcn нет аналога (например, колонки канбана или сетка месяца в календаре), и даже тогда он собирается из shadcn-примитивов (`Card`, `Button`, `Badge`…). `<button>`/`<a>` допустимы только как дочерний элемент shadcn-компонента с `asChild`. Запрещены «голые» `<button>`, `<select>`, `<input type="checkbox|radio|range|date">`, самодельные чипы, табы, тогглы, прогресс-бары, модалки и тултипы — для них есть `Button`, `Select`, `Checkbox`, `RadioGroup`, `Slider`, `Calendar` + `Popover`, `ToggleGroup`, `Tabs`, `Switch`, `Progress`, `Dialog`/`Sheet`, `Tooltip`. Стиль меняется темой (CSS-переменные в `globals.css`) и вариантами `cva` внутри `components/ui`, а не обходом shadcn.
5. **Гайд всегда актуален.** В конце каждого блока изменений обновляй встроенный гайд (`src/renderer/src/modules/guide/`: разделы — `sections.tsx`, FAQ — `faq-data.tsx`, блоки текста — `blocks.tsx`): новые возможности, изменённое поведение, горячие клавиши, FAQ (якоря `#faq-…` не ломать — на них ссылается код). Блок не считается законченным без этого.
6. Проверка перед сдачей: `npm run build` (typecheck + сборка) без ошибок, `npm test` (unit) и `npm run test:e2e` (Electron + Playwright) зелёные; визуальная проверка скриншотами (`npm run snap`). Собирать только через npm-скрипты (`scripts/electron-vite.mjs`), не `npx electron-vite` напрямую: на Windows путь `c:\…` vs `C:\…` даёт две копии React и пустое окно.

## Коммиты

Формат по Conventional Commits: `<тип>: <что сделано>` — одна строка, по-английски, со строчной буквы, в повелительном наклонении, без точки, до ~72 символов.

Пример: `update: add directory`

Типы:
- `feat` — новая функциональность
- `update` — доработка существующей функциональности
- `fix` — исправление бага
- `refactor` — переделка без изменения поведения
- `style` — внешний вид и стили
- `docs` — документация и правила
- `test` — тесты
- `build` — сборка, зависимости, electron-builder
- `chore` — прочее обслуживание
- `perf` — производительность

Область по желанию: `feat(boards): add column reorder`. Подробности — в теле коммита после пустой строки. Один коммит — одно логическое изменение.

## Версии и релизы

SemVer с пререлизами. Сейчас этап **beta**: версии `0.1.0-beta.N`.

- Версию поднимаю я сам после каждого завершённого блока изменений (без отдельной просьбы):
  - исправления и доработки на бете → `npm run version:beta` (0.1.0-beta.1 → 0.1.0-beta.2);
  - стабильный выпуск беты → `npm version 0.1.0`; дальше `npm run version:patch` (баги) / `npm run version:minor` (новые фичи);
  - 1.0.0 — когда всё стабильно; тогда в `electron-builder.yml` `releaseType: release`.
- `npm version` сам делает коммит `build: release <версия>` и тег `v<версия>` (настроено в `.npmrc`).
- Беты публикуются как GitHub pre-release в канал `beta`; установленная бета сама получает следующие беты.
- После поднятия версии — `npm run build:win` (или `npm run release:win` для публикации).
- Публикация: `$env:GH_TOKEN = "…"; npm run release:win` (fine-grained токен на `vaibcodedev/test-electrone`, Contents: Read and write). Сборка идёт с `--publish never`, загрузку делает `scripts/publish-release.mjs`: один релиз на тег, файлы по очереди (`setup.exe`, `.blockmap`, `beta.yml`). Встроенная публикация electron-builder грузила параллельно и создавала дубли релиза.
- Беты читают `beta.yml` (`publish.channel: beta`); с 1.0.0 убрать `channel` и поставить `releaseType: release`.

## Стек

electron-vite (React + TS) · Tailwind v4 + shadcn (перестилизован) · better-sqlite3 v13 (N-API prebuilds, без пересборки) + Drizzle ORM + FTS5 · zustand (UI-состояние) + TanStack Query (данные из IPC) · React Router 8 (hash) · dnd-kit · CodeMirror 6 · sucrase (живое превью) · electron-builder (NSIS) · electron-updater (GitHub Releases).

## Структура

```
src/shared/            контракт main↔renderer: api.ts, entity-types.ts, domain/*.ts (zod-схемы + типы), colors.ts (палитра), dates.ts
src/main/
  container.ts         composition root (DI)
  core/                paths, config-store (JSON вне БД), registry, soft-repository, ordering, srs, event-bus, logger, util, zip
  db/                  schema (drizzle), client (DbContext), migrations (drizzle-kit + custom FTS5)
  modules/             бэкенд модулей: boards, ideas, knowledge, media, checklists, english, calendar, finance, dev-projects;
                       большие — папками: crm/, freelance/, jobs/ (index.ts + части)
  services/            сквозные: search-index, tags, links, pins, trash, revisions, files, attachments, backup, export, import, dashboard, reminders, quick-add, weekly-review, github, secret-box
  system/              app-api (namespaces уровня приложения: настройки, обновления, shell), окна, трей, глобальный хоткей, автозапуск, протоколы, апдейтер
  ipc/rpc.ts           один канал rpc("ns.method", arg) + проверка отправителя
src/preload/           contextBridge: rpc, on(whitelist), pathForFile
src/renderer/
  preview.html, preview/   песочница превью компонентов (iframe sandbox, свой CSP)
  src/app/             router, navigation
  src/components/ui    shadcn (перестилизован), components/common — общие блоки (список: docs/design-system.md §14), components/layout
  src/features/        dashboard, command-palette, quick-add, trash, settings, tags, route-error (LoadError, NotFoundPage)
  src/modules/<name>/  страницы модулей (index.tsx экспортирует страницы для роутера)
  src/lib/             api (типизированный Proxy), query (useApi/useApiMutation), format, files
  src/hooks/, src/stores/
```

## Соглашения

- Данные в renderer — только через `useApi(ns, method, arg)` / `useApiMutation(ns, method)`; после любой мутации обновляются все активные запросы.
- Выбранная запись модуля — в URL `?open=<id>` (`useOpenParam`), чтобы поиск/связи открывали её напрямую.
- **Patch-схемы только через `patchOf(inputSchema)`** (`shared/domain/common.ts`). В zod 4 `.partial()` подставляет `.default()` — частичное обновление затёрло бы остальные поля.
- **Данные пользователя неприкосновенны.** Перед новыми миграциями `DbContext` сам кладёт копию базы в `backups/pre-update-<версия>-<время>.db` (последние 5). `npm run dev` работает с отдельной папкой `%APPDATA%/vault-dev`, рабочая база установленного Vault не трогается. Тесты (`scripts/snap.mjs`) всегда идут во временную папку.
- **Миграции проверять глазами.** Если drizzle-kit сгенерировал пересоздание таблицы (`__new_…` + `DROP TABLE`) для таблицы, на которую ссылаются FK с `ON DELETE CASCADE`, — НЕЛЬЗЯ: в транзакции `PRAGMA foreign_keys=OFF` не работает и дочерние строки удалятся. Меняй схему только аддитивно (`ADD COLUMN`), дефолты задавай в приложении.
- **Длинные списки — только виртуализированные:** `VirtualList` / `VirtualGrid` (`components/common/virtual-list.tsx`, TanStack Virtual) + `useInfiniteApi(ns, method, filters)` (страницы по 100 через `{ limit, offset }`). Фильтры и поиск — на сервере (параметры list-метода), не фильтровать большие массивы в рендере. Новый list-метод в main обязан принимать `pageSchema`. Списку передаются `error={list.isError} onRetry={() => void list.refetch()}`, а `empty` — по `list.showEmpty`: сбой загрузки не выдаётся за пустой список.
- **Горячие клавиши** — единый реестр `app/shortcuts.ts` + обработчик `hooks/use-global-shortcuts.ts` + справка `Ctrl+/`. Страничные клавиши работают через атрибуты общих компонентов: `N` нажимает лаймовую кнопку в `PageHeader`, `/` фокусирует `SearchInput` (`data-page-search`), `Esc` закрывает `DetailPane` (`data-close-detail`). Если первая лаймовая кнопка шапки делает не «создать» или её нет, цель помечается `data-page-new` (поле получит фокус, кнопка — клик): поле быстрого ввода «Ідей», «Нова мітка». Свой `useHotkey('n', …)` (`hooks/use-hotkey.ts`) — только когда `N` открывает форму через state (канбан). Если на странице есть и лаймовая кнопка, и поле быстрого ввода (компанії, майданчики), кнопка при пустом поле ставит в него курсор — так `N` работает без своего хоткея. Новую клавишу — сначала в реестр.
- **Журнал ошибок** — electron-log (`main/core/logger.ts`): `%APPDATA%/<app>/logs/main.log`. В main логировать через `log`, в renderer ошибки уходят через `reportError` → `api.app.logError`. Не глотать ошибки молча.
- Каждая новая сущность: таблица в `db/schema`, `npm run db:generate`, дескриптор в модуле, регистрация в `container.ts`, маршрут в `ENTITY_META`.
- Зависимые сущности (карточки доски) при удалении родителя остаются с `deletedAt = null` (иначе каждая всплыла бы в корзине отдельно). Поэтому у дескриптора есть `aliveWhere`, а сквозной код фильтрует через `registry.live(d)`, не через голый `isNull(deletedAt)`.
- **Сквозная логика main расширяется полями `EntityDescriptor`, а не кодом сервисов:** `onRestore` — вернуть зависимые записи после «Відновити», `afterRevert` — откатить побочные эффекты «Скасувати», `fileFields` — файловые колонки для ревизий, `systemFields` — служебные колонки (не откатываются и не экспортируются), `exportBody` — дополнительный markdown в экспорте.
- Порядок элементов в main — `nextPosition` / `reorder` из `core/ordering` + `orderedIds` (≤1000) из `modules/context`; свои `max(position)+1` и reorder через `forEach` не писать.
- Календарь: модуль отдаёт `calendarFeed(from, to)`, провайдер регистрируется в `container.registerCalendarFeeds()`; `CalendarModule` от других модулей не зависит.
- Большой модуль main — папка: `index.ts` владеет дескрипторами и собирает API из частей; часть — класс со своим `api()` и узким интерфейсом (`CreditsApi`, `ApplicationsApi`, или `Pick<JobsApi, …>`, когда несколько частей делят один namespace).
- Ожидаемые ошибки в main — только `UserError` / `NotFoundError` (`core/util.ts`) с украинским текстом для человека, без id записей. Технические детали (английские сообщения shell, net, electron-updater) — в журнал через `log.warn` / `log.error`.
- Пользовательские цвета (метки, события, майданчики вакансий, лента календаря) — только палитра `PALETTE` / `COLOR_NAME` из `shared/colors.ts`, свои массивы hex не заводить (старые копии в renderer перечислены в `docs/design-system.md` §2 и §14).
- Даты: ключ дня — `dayKey(ts)` (локальный), шаг по дням/неделям — `addDays()` (`core/util.ts`); даты в тексте, который строит main, — `shared/dates.ts`. `toISOString().slice(0,10)` и `+ n * DAY_MS` для календаря запрещены: UTC-сдвиг и переход на летнее время.
- Регистронезависимый поиск в SQL — `ulower()` (функция из `db/client`), не `lower()`.
- Файлы — только в `<data>/files`, в БД относительный путь; в renderer — `fileUrl(path)` (`vault-file://`).
- Безопасность: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, строгий CSP, внешние ссылки только через `api.app.openExternal`, пароли через `safeStorage`.

## Дизайн

**Система стилей — [docs/design-system.md](docs/design-system.md).** Перед любой UI-правкой сверяйся с ней; новое правило сначала записывай туда.

Коротко:
- Референсы: лаймовый акцент `--lime`, шалфейная рамка `--frame`, бумажные панели `--card`, чернильные карточки `--ink`. Радиус задаёт иерархию (28/24/18/12/pill). Шрифт Onest, заголовки `font-display`. Фирменный элемент — `.notch-card`. Один яркий акцент на экран.
- Размеры шрифта — только роли `text-meta / caption / body / lead / stat-sm / stat / title / display`; `text-[13px]` и подобные запрещены. Новая роль → токен в `globals.css` + `lib/utils.ts` (tailwind-merge).
- Заголовок карточки — `CardTitle` (читаемый, `font-semibold text-foreground`), не серый.
- Кнопки: `lime` — главное действие; `subtle` — переход из карточки; `ghost` — иконки; `link` — ссылка в тексте (без отступов). Серый текст без фона кнопкой не бывает.
- Запись открывается для просмотра, «Редагувати»/`E` — правка, «Зберегти»/«Скасувати» — подтвердить или откатить (`detail-mode`); пустые черновики не плодятся и удаляются при закрытии (`DRAFT_TITLES` + `draft` в дескрипторе).
- Лимиты полей — из zod-схем: `limitsOf` (строки), `rangesOf` (числа); ссылки — `isLikelyUrl`.
- Прогресс — с подписью «Готово X з Y»; метки — `TagList`; сегодня в календаре — лаймовый круг.

## Команды

- `npm run dev` — разработка; `npm run typecheck`; `npm run build:win` — установщик в `dist/`
- `npm run db:generate` — миграция из схемы
- `npm test` — unit-тесты (vitest, `tests/unit`, ~6 с); `npm run test:e2e` — сборка + e2e на собранном приложении (`tests/e2e`, ~1,5 мин); `npm run test:e2e:only` — без пересборки
- `node scripts/snap-all.mjs <dir>` — скриншоты всех состояний (списки, карточки обычные/почти пустые/огромные, формы создания, режим правки, пустая база; обе темы); `node scripts/snap-extension.mjs <dir>` — попап и настройки расширения во всех состояниях; `node scripts/audit-overflow.mjs <dir>` и `audit-empty.mjs` — автоматический поиск переполнений и пустых/зависших экранов. Данные для них — `scripts/fixtures.mjs`. Запускать после крупных UI-правок (нужен `npm run build`); порядок работы — `docs/quality-pass.md`
- Найденный, но не исправленный баг фиксируется тестом с `it.fails` / `test.fail(!process.env.SHOW_BUGS, …)`; исправил — сними пометку
- `npm run snap -- <dir> / /ideas` — скриншоты собранного приложения (`SNAP_SEED=1` — демо-данные, `SNAP_THEME=dark`)
