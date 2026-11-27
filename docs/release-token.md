# Токен для публікації релізу

Скрипту `scripts/publish-release.mjs` (його ж викликає `npm run release:win`) потрібен `GH_TOKEN` — fine-grained токен GitHub.

**Репозиторій публічний: значення токена не записуємо ні в документацію, ні в інші файли чи коміти.**

## Де взяти

1. Увійдіть в акаунт GitHub, який має доступ до `vaibcodedev/test-electrone`, і відкрийте <https://github.com/settings/personal-access-tokens/new>. Через меню: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Token name** — будь-яка назва, наприклад `vault-release`.
3. **Expiration** — термін дії, наприклад 30 або 90 днів.
4. **Resource owner** — `vaibcodedev`.
5. **Repository access** — **Only select repositories** → `test-electrone`.
6. **Permissions → Repository permissions → Contents** — **Read and write** (якщо пункту не видно — **Add permissions**). `Metadata: Read-only` додається сам, інші дозволи не потрібні.
7. **Generate token** і одразу скопіюйте значення (`github_pat_…`): GitHub показує його лише один раз. Не зберегли — **Regenerate token** на сторінці токена або новий токен.

## Як використати

У PowerShell, у папці проєкту:

```powershell
$env:GH_TOKEN = "github_pat_…"; node scripts/publish-release.mjs
```

- Ця команда завантажує вже зібраний інсталятор з `dist/`. Щоб зібрати й опублікувати разом, замість `node scripts/publish-release.mjs` запустіть `npm run release:win`.
- Мережа обірвала завантаження — запустіть команду ще раз: завантажені файли скрипт пропустить.
- Змінна живе, доки відкрите вікно PowerShell. Сама команда може залишитися в історії PowerShell на комп'ютері.
- Токен потрапив у чат, лог чи на скриншот — відкличте його на <https://github.com/settings/personal-access-tokens> і створіть новий.
