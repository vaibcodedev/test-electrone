# Vault — личная база знаний разработчика (Electron)

Ответы пользователю — на русском. UI-тексты — на русском.

## Обязательные правила работы

1. **Документация только актуальная.** Перед использованием любого API библиотеки (Electron, electron-vite, electron-builder, electron-updater, Drizzle, better-sqlite3, React 19, React Router 8, TanStack Query, Zustand, Tailwind v4, shadcn, dnd-kit, CodeMirror, zod 4…) — сверяйся через **Context7** (`resolve-library-id` → `query-docs`). Версии в проекте свежие (Electron 44, Vite 8, TS 5.9, zod 4), память может врать — пример: в Electron 44 `clipboard` асинхронный (W3C API), `clipboard.readImage()` нет.
2. **Скилы — использовать все подходящие**, не изобретать процесс заново:
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
5. Проверка перед сдачей: `npm run typecheck` и `npx electron-vite build` без ошибок; визуальная проверка скриншотами (`npm run snap`).

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

## Стек

electron-vite (React + TS) · Tailwind v4 + shadcn (перестилизован) · better-sqlite3 v13 (N-API prebuilds, без пересборки) + Drizzle ORM + FTS5 · zustand (UI-состояние) + TanStack Query (данные из IPC) · React Router 8 (hash) · dnd-kit · CodeMirror 6 · sucrase (живое превью) · electron-builder (NSIS) · electron-updater (GitHub Releases).

## Структура

```
src/shared/            контракт main↔renderer: api.ts, entity-types.ts, domain/*.ts (zod-схемы + типы)
src/main/
  container.ts         composition root (DI)
  core/                paths, config-store (JSON вне БД), registry, soft-repository, event-bus, util, zip
  db/                  schema (drizzle), client (DbContext), migrations (drizzle-kit + custom FTS5)
  modules/             бэкенд модулей: boards, ideas, knowledge, media, crm, checklists, english, calendar
  services/            сквозные: search-index, tags, links, pins, trash, files, attachments, backup, export, dashboard, reminders, quick-add, secret-box
  system/              окна, трей, глобальный хоткей, автозапуск, протоколы, апдейтер
  ipc/rpc.ts           один канал rpc("ns.method", arg) + проверка отправителя
src/preload/           contextBridge: rpc, on(whitelist), pathForFile
src/renderer/
  preview.html, preview/   песочница превью компонентов (iframe sandbox, свой CSP)
  src/app/             router, navigation
  src/components/ui    shadcn (перестилизован), components/common — общие блоки, components/layout
  src/features/        dashboard, command-palette, quick-add, trash, settings, tags
  src/modules/<name>/  страницы модулей (index.tsx экспортирует страницы для роутера)
  src/lib/             api (типизированный Proxy), query (useApi/useApiMutation), format, files
  src/hooks/, src/stores/
```

## Соглашения

- Данные в renderer — только через `useApi(ns, method, arg)` / `useApiMutation(ns, method)`; после любой мутации обновляются все активные запросы.
- Выбранная запись модуля — в URL `?open=<id>` (`useOpenParam`), чтобы поиск/связи открывали её напрямую.
- **Patch-схемы только через `patchOf(inputSchema)`** (`shared/domain/common.ts`). В zod 4 `.partial()` подставляет `.default()` — частичное обновление затёрло бы остальные поля.
- **Миграции проверять глазами.** Если drizzle-kit сгенерировал пересоздание таблицы (`__new_…` + `DROP TABLE`) для таблицы, на которую ссылаются FK с `ON DELETE CASCADE`, — НЕЛЬЗЯ: в транзакции `PRAGMA foreign_keys=OFF` не работает и дочерние строки удалятся. Меняй схему только аддитивно (`ADD COLUMN`), дефолты задавай в приложении.
- Каждая новая сущность: таблица в `db/schema`, `npm run db:generate`, дескриптор в модуле, регистрация в `container.ts`, маршрут в `ENTITY_META`.
- Файлы — только в `<data>/files`, в БД относительный путь; в renderer — `fileUrl(path)` (`vault-file://`).
- Безопасность: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, строгий CSP, внешние ссылки только через `api.app.openExternal`, пароли через `safeStorage`.

## Дизайн

Референсы: лаймовый акцент `--lime`, шалфейная рамка `--frame`, бумажные панели `--card`, чернильные карточки `--ink`. Радиус задаёт иерархию (28/24/18/12/pill). Шрифт Onest, заголовки `font-display`. Фирменный элемент — `.notch-card` (вырез с круглыми кнопками). Один яркий акцент на экран, остальное спокойно.

## Команды

- `npm run dev` — разработка; `npm run typecheck`; `npm run build:win` — установщик в `dist/`
- `npm run db:generate` — миграция из схемы
- `npm run snap -- <dir> / /ideas` — скриншоты собранного приложения (`SNAP_SEED=1` — демо-данные, `SNAP_THEME=dark`)
