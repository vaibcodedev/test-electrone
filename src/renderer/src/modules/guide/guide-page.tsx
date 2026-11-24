import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  CalendarCheck,
  Puzzle,
  Database,
  FileUser,
  FolderOpen,
  Library,
  Rocket,
  Send,
  SquareKanban,
  Tags,
  TerminalSquare,
  Wallet,
  RefreshCw,
  type LucideIcon
} from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/lib/query'
import { fmtBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Page, PageHeader } from '@/components/common/page'
import { CopyButton } from '@/components/common/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

interface GuideSection {
  id: string
  title: string
  icon: LucideIcon
  /** Where «Открыть раздел» leads. */
  route?: string
  body: ReactNode
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </KbdGroup>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="max-w-[68ch] text-[14px] leading-relaxed text-foreground/85">{children}</p>
}

/** A titled bullet list of practical points. */
function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex max-w-[70ch] flex-col gap-2 text-[14px] leading-relaxed text-foreground/85">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-chart-1" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function Where({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-muted-foreground">Где: {children}</p>
}

function DataPaths() {
  const { data: info } = useApi('settings', 'info')
  const rows = info
    ? [
        { label: 'Папка данных', hint: 'внутри лежит база vault.db', path: info.dataDir },
        { label: 'Файлы и картинки', hint: 'скриншоты, дизайны, вложения, резюме', path: info.filesDir },
        { label: 'Автобэкапы', hint: 'файлы .vaultbak, последние копии', path: info.backupsDir }
      ]
    : []
  return (
    <div className="flex flex-col gap-3">
      <ItemGroup className="gap-2">
        {rows.map((r) => (
          <Item key={r.label} variant="muted" size="sm">
            <ItemMedia variant="icon">
              <FolderOpen />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{r.label}</ItemTitle>
              <ItemDescription className="selectable truncate font-mono text-[12px]">{r.path}</ItemDescription>
              <ItemDescription className="text-[12px]">{r.hint}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <CopyButton text={r.path} />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="lime" onClick={() => void api.settings.openDataDir()}>
          <FolderOpen /> Открыть папку данных
        </Button>
        {info && <span className="text-[12.5px] text-muted-foreground">Размер базы: {fmtBytes(info.dbSizeBytes)}</span>}
      </div>
    </div>
  )
}

const SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: 'Начало',
    icon: Rocket,
    body: (
      <>
        <P>
          Vault — личная база для работы разработчика: задачи, фриланс, поиск работы, деньги, знания и проекты в одном
          окне. Всё хранится локально у вас на компьютере.
        </P>
        <Points
          items={[
            <>Впишите имя в «Настройках» — оно появится в приветствии.</>,
            <>Выберите тему: светлая, тёмная или как в системе.</>,
            <>Включите «Запускать вместе с Windows»: Vault будет жить в трее и не мешать.</>,
            <>
              Быстро записать мысль из любого окна, даже когда Vault свёрнут: <Keys keys={['Ctrl', 'Shift', 'Space']} />
            </>,
            <>
              Поиск по всему: <Keys keys={['Ctrl', 'K']} />. Быстро добавить внутри приложения: <Keys keys={['Ctrl', 'N']} />
            </>,
            <>
              Переход по разделам: <Keys keys={['Alt', '1…9']} />. Назад и вперёд — стрелки в заголовке окна.
            </>
          ]}
        />
      </>
    )
  },
  {
    id: 'data',
    title: 'Где лежат данные',
    icon: Database,
    route: '/settings',
    body: (
      <>
        <P>
          Все данные — это один файл SQLite и папка с файлами рядом. Картинки и вложения хранятся файлами, в базе только
          пути к ним, поэтому база остаётся лёгкой.
        </P>
        <DataPaths />
        <Points
          items={[
            <>Бэкап — один файл .vaultbak: база и все файлы вместе. Автобэкап делается раз в день, хранятся последние копии.</>,
            <>Восстановить из бэкапа и сделать бэкап вручную — в «Настройках». Перед восстановлением текущее состояние сохраняется.</>,
            <>Экспорт в Markdown (zip) или JSON — данные никогда не заперты в приложении.</>,
            <>Пароли из «Доступов» шифруются ключом Windows и расшифровываются только на этом компьютере, в экспорт не попадают.</>,
            <>Удалённое лежит в корзине 30 дней, потом исчезает само.</>
          ]}
        />
      </>
    )
  },
  {
    id: 'work',
    title: 'Работа',
    icon: SquareKanban,
    route: '/boards',
    body: (
      <>
        <Points
          items={[
            <>Идеи: записывайте всё, ставьте статус и важность. Созревшую идею кнопка «Превратить в доску» делает канбаном.</>,
            <>Доски: колонки, карточки с описанием, чек-листом, дедлайном, приоритетом и метками. Перетаскивайте карточки мышкой. Вид — канбан, список или календарь.</>,
            <>Календарь один на всё: события, дедлайны карточек и проектов, оплаты, подписки, собеседования и напоминания.</>,
            <>Чек-листы: шаблоны («Перед деплоем», «SEO», «Запуск магазина») и прогоны по ним для конкретного проекта.</>
          ]}
        />
        <Where>Работа → Идеи, Доски, Календарь, Чек-листы</Where>
      </>
    )
  },
  {
    id: 'freelance',
    title: 'Фриланс',
    icon: Send,
    route: '/freelance',
    body: (
      <>
        <Points
          items={[
            <>Платформы: Upwork и «Прямые заказы» уже есть, другие добавляются кнопкой «+ Платформа» в меню.</>,
            <>Отклики: канбан от черновика до контракта, чек-лист перед откликом, данные клиента, ставка, коннекты и буст.</>,
            <>Кнопка «Контракт» в отклике создаёт клиента и проект. Комиссию платформы (0–15%) укажите при отклике — точную Upwork показывает только тогда.</>,
            <>Коннекты: покупки и бонусы вносите вручную, траты считаются из откликов. Видно баланс и сколько стоил один контракт.</>,
            <>Шаблоны с переменными {'{client}'}, {'{task}'}: при копировании Vault спросит значения. Статистика показывает, какой шаблон чаще приводит к ответу.</>,
            <>Портфолио, красные флаги, цели на неделю и месяц, калькулятор ставки с учётом комиссий и расходов.</>
          ]}
        />
        <Where>Фриланс → платформа → вкладки Отклики, Контракты, Коннекты, Статистика</Where>
      </>
    )
  },
  {
    id: 'jobs',
    title: 'Поиск работы',
    icon: FileUser,
    route: '/jobs',
    body: (
      <>
        <Points
          items={[
            <>Площадки: Djinni, DOU, LinkedIn и свои. У каждой норма в день — отклик на площадке отмечает день сам, а галочкой можно закрыть день вручную.</>,
            <>Вечером приходит напоминание, если какие-то площадки сегодня не отмечены. Время меняется в «Настройках».</>,
            <>Вакансии: от «Отправлено» до оффера или отказа. Этапы (скрининг, техническое, тестовое) сами попадают в календарь с напоминаниями за день и за час; перенос в календаре меняет время этапа.</>,
            <>Резюме: загружайте версии файлами, отмечайте, где версия уже залита, и выбирайте в отклике, какую отправили.</>,
            <>Вопросы: банк технических и общих вопросов с вашими ответами и тренажёр с интервальным повторением.</>
          ]}
        />
        <Where>Поиск работы → Обзор, Вакансии, Собеседования, Резюме, Вопросы</Where>
      </>
    )
  },
  {
    id: 'finance',
    title: 'Финансы',
    icon: Wallet,
    route: '/finance',
    body: (
      <>
        <Points
          items={[
            <>Доходы считаются сами из оплат по контрактам, за вычетом комиссии платформы. Валюты не смешиваются.</>,
            <>Подписки: заведите один раз (Claude, телефон, хостинг), каждый месяц отмечайте «оплачено». Даты списания видны в календаре.</>,
            <>Расходы и выводы: при выводе укажите комиссию и курс — Vault посчитает, сколько пришло на карту.</>,
            <>Обзор месяца: на руки, расходы с коннектами, прибыль и деньги, которые ещё лежат на платформах.</>
          ]}
        />
        <Where>Финансы → Обзор, Доходы, Подписки и расходы, Выводы</Where>
      </>
    )
  },
  {
    id: 'knowledge',
    title: 'Знания',
    icon: Library,
    route: '/knowledge',
    body: (
      <>
        <Points
          items={[
            <>Заметки с папками и Markdown, отдельный раздел Claude для промтов, скилов, плагинов и гайдов. Промты, которые сработали, отмечайте — они поднимаются наверх.</>,
            <>Сниппеты с подсветкой и поиском по коду — копирование одной кнопкой.</>,
            <>Компоненты с живым превью: TSX/JSX/HTML, классы Tailwind работают. Доступные импорты: react, lucide-react, clsx, tailwind-merge, class-variance-authority, @/lib/utils (cn).</>,
            <>JS-библиотеки со статусами «использую / хочу попробовать», ошибки и решения — чтобы не чинить одно и то же дважды.</>
          ]}
        />
        <Where>Знания → Заметки, Claude, Сниппеты, Компоненты, Библиотеки, Ошибки</Where>
      </>
    )
  },
  {
    id: 'inspiration',
    title: 'Вдохновение и учёба',
    icon: Bookmark,
    route: '/designs',
    body: (
      <>
        <Points
          items={[
            <>
              Дизайны: перетащите картинки в окно или вставьте скриншот <Keys keys={['Ctrl', 'V']} />. Цвета палитры
              определяются сами, собирайте подборки.
            </>,
            <>Закладки со статусом «прочитать / читаю / прочитал» и прогрессом.</>,
            <>Английский: слова и фразы из работы, повторение карточками по интервалам, слово дня на главной.</>
          ]}
        />
        <Where>Вдохновение и учёба → Дизайны, Закладки, Английский</Where>
      </>
    )
  },
  {
    id: 'dev',
    title: 'Разработка',
    icon: TerminalSquare,
    route: '/dev',
    body: (
      <>
        <Points
          items={[
            <>Мои проекты: добавьте папку или просканируйте папку с проектами. Кнопки «VS Code», «Cursor», «Терминал», «Папка».</>,
            <>Скрипты из package.json запускаются прямо в Vault с живым логом; ссылка localhost появляется сама. Останавливаются кнопкой «Стоп» и при выходе из приложения.</>,
            <>Если VS Code или Cursor не открывается — в редакторе выполните «Install … command in PATH».</>,
            <>GitHub: создайте fine-grained токен только на чтение и вставьте его в «Настройках». Будут видны репозитории, открытые issues и последние коммиты.</>
          ]}
        />
        <Where>Разработка → Мои проекты, GitHub</Where>
      </>
    )
  },
  {
    id: 'review',
    title: 'Итоги недели',
    icon: CalendarCheck,
    route: '/review',
    body: (
      <>
        <P>
          В воскресенье вечером приходит уведомление: что сделано, сколько заработано и потрачено, какие отклики и вакансии
          висят без ответа, что ждёт на следующей неделе — со сравнением с прошлой. Запишите итоги и план, прошлые недели
          хранятся в архиве.
        </P>
        <Where>меню → Итоги недели. День и время уведомления — в «Настройках».</Where>
      </>
    )
  },
  {
    id: 'extension',
    title: 'Расширение для Chrome',
    icon: Puzzle,
    route: '/settings',
    body: (
      <>
        <Points
          items={[
            <>Откройте chrome://extensions, включите «Режим разработчика» и нажмите «Загрузить распакованное».</>,
            <>Выберите папку расширения — кнопка «Открыть папку расширения» есть в «Настройках».</>,
            <>В настройках расширения вставьте ключ из Vault. Vault должен быть запущен, хотя бы в трее.</>,
            <>На любом сайте нажмите иконку: выберите, куда сохранить (дизайн, закладка, библиотека, компонент, вакансия), — запись появится со скриншотом и ссылкой.</>
          ]}
        />
      </>
    )
  },
  {
    id: 'cross',
    title: 'Метки, связи и корзина',
    icon: Tags,
    route: '/tags',
    body: (
      <Points
        items={[
          <>Метки общие для всех разделов: одна метка «shopify» найдёт идеи, сниппеты, дизайны и ошибки.</>,
          <>Связи: в правой панели любой записи кнопка «Связать» соединяет её с чем угодно — идея → доска → сниппет → дизайн.</>,
          <>Булавка закрепляет запись на главной, звёздочка — в избранном.</>,
          <>Корзина хранит удалённое 30 дней; оттуда можно восстановить или удалить навсегда.</>
        ]}
      />
    )
  },
  {
    id: 'updates',
    title: 'Обновления',
    icon: RefreshCw,
    route: '/settings',
    body: (
      <P>
        Vault сейчас в бете (версии 0.1.0-beta.N). Обновления скачиваются сами из GitHub Releases и ставятся при
        перезапуске; проверить вручную можно в «Настройках → Обновления». Данные при обновлении не трогаются.
      </P>
    )
  }
]

/** Onboarding / help: everything in one page with a scroll-spy table of contents. */
export function GuidePage() {
  const navigate = useNavigate()
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(SECTIONS[0].id)

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { root, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    )
    for (const s of SECTIONS) {
      const el = root.querySelector(`#${s.id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  const jump = (id: string): void => {
    scroller.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <Page>
      <PageHeader
        title="Гайд по Vault"
        subtitle="Всё о разделах, горячих клавишах и о том, где лежат ваши данные."
        actions={
          <Button variant="soft" onClick={() => navigate('/settings')}>
            <BookOpen /> Настройки
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 gap-6 px-8 pb-8">
        <nav className="w-56 shrink-0 overflow-y-auto" aria-label="Содержание">
          <ItemGroup className="gap-0.5">
            {SECTIONS.map((s) => (
              <Item key={s.id} asChild size="xs" variant={active === s.id ? 'active' : 'default'} className="rounded-full px-3">
                <button type="button" className="w-full text-left" onClick={() => jump(s.id)} aria-current={active === s.id || undefined}>
                  <s.icon className={cn('size-4 shrink-0', active === s.id ? 'text-ink-accent' : 'text-muted-foreground')} />
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate font-normal">{s.title}</ItemTitle>
                  </ItemContent>
                </button>
              </Item>
            ))}
          </ItemGroup>
        </nav>
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto scroll-smooth pr-2">
          <div className="flex flex-col gap-3 pb-[40vh]">
            {SECTIONS.map((s) => (
              <Card key={s.id} id={s.id} className="scroll-mt-2">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-display flex items-center gap-3 text-[24px] leading-tight">
                      <span className="grid size-10 place-items-center rounded-full bg-card">
                        <s.icon className="size-5" />
                      </span>
                      {s.title}
                    </h2>
                    {s.route && (
                      <Button variant="ghost" size="sm" onClick={() => navigate(s.route!)}>
                        Открыть раздел <ArrowUpRight />
                      </Button>
                    )}
                  </div>
                  {s.body}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}
