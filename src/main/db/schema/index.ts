/**
 * Database schema. Conventions:
 * - ids are random text (crypto.randomUUID), timestamps are integer epoch ms;
 * - top-level entities have created_at/updated_at/deleted_at (soft delete → trash);
 * - cross-cutting relations (tags, links, pins, attachments) are polymorphic on (entity_type, entity_id);
 * - child rows (columns, checklist items, time entries…) cascade with their parent.
 * Full-text search lives in the FTS5 table `search_index` (custom migration, not modelled here).
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'
import type { CardRepeat } from '../../../shared/domain/boards'
import type { TemplateVersion } from '../../../shared/domain/freelance'

const base = {
  id: text().primaryKey(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
  deletedAt: integer()
}

/* ───────────── Cross-cutting ───────────── */

export const tags = sqliteTable(
  'tags',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    color: text(),
    createdAt: integer().notNull()
  },
  (t) => [uniqueIndex('tags_name_unique').on(t.name)]
)

export const entityTags = sqliteTable(
  'entity_tags',
  {
    entityType: text().notNull(),
    entityId: text().notNull(),
    tagId: text()
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId, t.tagId] }),
    index('entity_tags_tag_idx').on(t.tagId)
  ]
)

export const entityLinks = sqliteTable(
  'entity_links',
  {
    id: text().primaryKey(),
    fromType: text().notNull(),
    fromId: text().notNull(),
    toType: text().notNull(),
    toId: text().notNull(),
    createdAt: integer().notNull()
  },
  (t) => [
    uniqueIndex('entity_links_unique').on(t.fromType, t.fromId, t.toType, t.toId),
    index('entity_links_to_idx').on(t.toType, t.toId)
  ]
)

export const pins = sqliteTable(
  'pins',
  {
    entityType: text().notNull(),
    entityId: text().notNull(),
    kind: text().$type<'pin' | 'favorite'>().notNull(),
    position: real().notNull().default(0),
    createdAt: integer().notNull()
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId, t.kind] })]
)

export const attachments = sqliteTable(
  'attachments',
  {
    id: text().primaryKey(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    path: text().notNull(),
    originalName: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    createdAt: integer().notNull()
  },
  (t) => [index('attachments_entity_idx').on(t.entityType, t.entityId)]
)

/* ───────────── Ideas & boards ───────────── */

export const ideas = sqliteTable(
  'ideas',
  {
    ...base,
    title: text().notNull(),
    body: text().notNull().default(''),
    status: text().notNull().default('inbox'),
    impact: integer().notNull().default(0),
    boardId: text()
  },
  (t) => [index('ideas_status_idx').on(t.status)]
)

export const boards = sqliteTable('boards', {
  ...base,
  title: text().notNull(),
  description: text().notNull().default(''),
  color: text(),
  projectId: text(),
  ideaId: text(),
  archived: integer({ mode: 'boolean' }).notNull().default(false)
})

export const boardColumns = sqliteTable(
  'board_columns',
  {
    id: text().primaryKey(),
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    color: text(),
    isDone: integer({ mode: 'boolean' }).notNull().default(false),
    position: real().notNull()
  },
  (t) => [index('board_columns_board_idx').on(t.boardId)]
)

export const cards = sqliteTable(
  'cards',
  {
    ...base,
    boardId: text()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    columnId: text().notNull(),
    title: text().notNull(),
    description: text().notNull().default(''),
    priority: text().notNull().default('none'),
    dueAt: integer(),
    position: real().notNull(),
    completedAt: integer(),
    /** Repeat rule (CardRepeat); null — the card doesn't repeat. */
    repeat: text({ mode: 'json' }).$type<CardRepeat>(),
    /** The next card of the series, created when this one reached «Готово» — at most one per card. */
    repeatNextId: text()
  },
  (t) => [index('cards_board_idx').on(t.boardId, t.columnId), index('cards_due_idx').on(t.dueAt)]
)

export const cardChecklist = sqliteTable(
  'card_checklist',
  {
    id: text().primaryKey(),
    cardId: text()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    text: text().notNull(),
    done: integer({ mode: 'boolean' }).notNull().default(false),
    position: real().notNull()
  },
  (t) => [index('card_checklist_card_idx').on(t.cardId)]
)

/* ───────────── Knowledge ───────────── */

export const claudeItems = sqliteTable(
  'claude_items',
  {
    ...base,
    kind: text().notNull(),
    title: text().notNull(),
    summary: text().notNull().default(''),
    content: text().notNull().default(''),
    url: text().notNull().default(''),
    works: integer({ mode: 'boolean' }).notNull().default(false),
    copyCount: integer().notNull().default(0)
  },
  (t) => [index('claude_kind_idx').on(t.kind)]
)

export const libraries = sqliteTable('libraries', {
  ...base,
  name: text().notNull(),
  purpose: text().notNull().default(''),
  notes: text().notNull().default(''),
  npmUrl: text().notNull().default(''),
  githubUrl: text().notNull().default(''),
  docsUrl: text().notNull().default(''),
  installCmd: text().notNull().default(''),
  status: text().notNull().default('want')
})

export const uiComponents = sqliteTable('ui_components', {
  ...base,
  title: text().notNull(),
  description: text().notNull().default(''),
  code: text().notNull().default(''),
  language: text().notNull().default('tsx'),
  sourceUrl: text().notNull().default(''),
  previewBg: text().notNull().default('light'),
  coverPath: text()
})

export const designs = sqliteTable('designs', {
  ...base,
  title: text().notNull().default(''),
  kind: text().notNull().default('site'),
  sourceUrl: text().notNull().default(''),
  notes: text().notNull().default(''),
  colors: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
  imagePath: text(),
  imageWidth: integer(),
  imageHeight: integer(),
  /** File size in bytes (the tile says «JPG · 1440 × 900 · 412 КБ»); older rows are filled in at start. */
  imageBytes: integer()
})

export const moodboards = sqliteTable('moodboards', {
  ...base,
  title: text().notNull(),
  description: text().notNull().default(''),
  color: text()
})

export const moodboardItems = sqliteTable(
  'moodboard_items',
  {
    moodboardId: text()
      .notNull()
      .references(() => moodboards.id, { onDelete: 'cascade' }),
    designId: text()
      .notNull()
      .references(() => designs.id, { onDelete: 'cascade' }),
    position: real().notNull()
  },
  (t) => [primaryKey({ columns: [t.moodboardId, t.designId] })]
)

export const snippets = sqliteTable('snippets', {
  ...base,
  title: text().notNull(),
  description: text().notNull().default(''),
  code: text().notNull().default(''),
  language: text().notNull().default('typescript'),
  copyCount: integer().notNull().default(0)
})

export const fixes = sqliteTable('fixes', {
  ...base,
  title: text().notNull(),
  errorText: text().notNull().default(''),
  cause: text().notNull().default(''),
  solution: text().notNull().default(''),
  context: text().notNull().default(''),
  resolved: integer({ mode: 'boolean' }).notNull().default(true),
  projectId: text()
})

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    ...base,
    title: text().notNull(),
    url: text().notNull().default(''),
    kind: text().notNull().default('article'),
    status: text().notNull().default('queue'),
    progress: integer().notNull().default(0),
    rating: integer().notNull().default(0),
    notes: text().notNull().default(''),
    finishedAt: integer()
  },
  (t) => [index('bookmarks_status_idx').on(t.status)]
)

/* ───────────── Clients & projects ───────────── */

export const clients = sqliteTable('clients', {
  ...base,
  name: text().notNull(),
  company: text().notNull().default(''),
  email: text().notNull().default(''),
  phone: text().notNull().default(''),
  messenger: text().notNull().default(''),
  website: text().notNull().default(''),
  notes: text().notNull().default(''),
  status: text().notNull().default('active'),
  currency: text().notNull().default('USD'),
  defaultBilling: text().notNull().default('fixed'),
  defaultRate: real().notNull().default(0),
  /* Freelance platform data (Upwork etc.) */
  platformId: text(),
  country: text().notNull().default(''),
  rating: real(),
  totalSpent: real(),
  hireRate: real(),
  paymentVerified: integer({ mode: 'boolean' }),
  howToCommunicate: text().notNull().default('')
})

export const projects = sqliteTable(
  'projects',
  {
    ...base,
    clientId: text().references(() => clients.id, { onDelete: 'set null' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    status: text().notNull().default('active'),
    billing: text().notNull().default('hourly'),
    rate: real().notNull().default(0),
    fixedPrice: real().notNull().default(0),
    currency: text().notNull().default('USD'),
    budgetHours: real().notNull().default(0),
    startAt: integer(),
    dueAt: integer(),
    repoUrl: text().notNull().default(''),
    stagingUrl: text().notNull().default(''),
    prodUrl: text().notNull().default(''),
    adminUrl: text().notNull().default(''),
    /* Freelance contract data */
    platformId: text(),
    /** Platform service fee % for this contract; null = platform default. */
    feePercent: real(),
    proposalId: text()
  },
  (t) => [index('projects_client_idx').on(t.clientId)]
)

export const credentials = sqliteTable('credentials', {
  id: text().primaryKey(),
  projectId: text().references(() => projects.id, { onDelete: 'cascade' }),
  clientId: text().references(() => clients.id, { onDelete: 'cascade' }),
  label: text().notNull(),
  url: text().notNull().default(''),
  login: text().notNull().default(''),
  /** base64 of safeStorage-encrypted bytes (or "plain:" prefix when OS encryption is unavailable). */
  secret: text().notNull().default(''),
  notes: text().notNull().default(''),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
  /** CredentialKind; rows from before the kinds read as 'account' (url / login / secret as they were). */
  kind: text().notNull().default('account'),
  /** JSON of the kind's non-secret fields (host, port, engine…): shared/domain/credentials. */
  fields: text().notNull().default('{}'),
  /** SecretBox-encrypted JSON of the extra secrets (2FA, SSH key, passphrase, backup codes, secret pairs). */
  secrets: text().notNull().default(''),
  /** Finance subscription that pays for this access (no FK: the column is added in place, see migrations). */
  subscriptionId: text()
})

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    description: text().notNull().default(''),
    startedAt: integer().notNull(),
    endedAt: integer(),
    minutes: integer().notNull().default(0),
    billable: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: integer().notNull()
  },
  (t) => [index('time_project_idx').on(t.projectId), index('time_started_idx').on(t.startedAt)]
)

export const payments = sqliteTable(
  'payments',
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    amount: real().notNull(),
    currency: text().notNull().default('USD'),
    status: text().notNull().default('expected'),
    dueAt: integer(),
    paidAt: integer(),
    note: text().notNull().default(''),
    createdAt: integer().notNull()
  },
  (t) => [index('payments_project_idx').on(t.projectId)]
)

/* ───────────── Checklists ───────────── */

export const checklists = sqliteTable('checklists', {
  ...base,
  title: text().notNull(),
  description: text().notNull().default(''),
  kind: text().notNull().default('template'),
  templateId: text(),
  projectId: text()
})

export const checklistItems = sqliteTable(
  'checklist_items',
  {
    id: text().primaryKey(),
    checklistId: text()
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    text: text().notNull(),
    hint: text().notNull().default(''),
    section: text().notNull().default(''),
    done: integer({ mode: 'boolean' }).notNull().default(false),
    doneAt: integer(),
    position: real().notNull()
  },
  (t) => [index('checklist_items_list_idx').on(t.checklistId)]
)

/* ───────────── English ───────────── */

export const words = sqliteTable(
  'words',
  {
    ...base,
    term: text().notNull(),
    translation: text().notNull().default(''),
    kind: text().notNull().default('word'),
    transcription: text().notNull().default(''),
    example: text().notNull().default(''),
    exampleTranslation: text().notNull().default(''),
    context: text().notNull().default(''),
    notes: text().notNull().default(''),
    ease: real().notNull().default(2.5),
    intervalDays: real().notNull().default(0),
    repetitions: integer().notNull().default(0),
    lapses: integer().notNull().default(0),
    dueAt: integer().notNull(),
    lastReviewedAt: integer()
  },
  (t) => [index('words_due_idx').on(t.dueAt)]
)

export const wordReviews = sqliteTable(
  'word_reviews',
  {
    id: text().primaryKey(),
    wordId: text()
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    grade: integer().notNull(),
    reviewedAt: integer().notNull()
  },
  (t) => [index('word_reviews_at_idx').on(t.reviewedAt)]
)

/* ───────────── Calendar ───────────── */

export const events = sqliteTable(
  'events',
  {
    ...base,
    title: text().notNull(),
    description: text().notNull().default(''),
    startAt: integer().notNull(),
    endAt: integer(),
    allDay: integer({ mode: 'boolean' }).notNull().default(false),
    remindMinutes: integer(),
    recurrence: text().notNull().default('none'),
    color: text(),
    remindedFor: integer(),
    /** Second reminder (e.g. a day before + an hour before). */
    remind2Minutes: integer(),
    reminded2For: integer(),
    /** Owner of an auto-created event, e.g. "job_stage" — keeps both sides in sync. */
    sourceType: text(),
    sourceId: text()
  },
  (t) => [index('events_start_idx').on(t.startAt)]
)

/* ───────────── Notes (general) ───────────── */

export const notes = sqliteTable('notes', {
  ...base,
  title: text().notNull(),
  body: text().notNull().default(''),
  folder: text().notNull().default('')
})

/* ───────────── Freelance ───────────── */

export const platforms = sqliteTable('platforms', {
  id: text().primaryKey(),
  name: text().notNull(),
  kind: text().notNull().default('other'),
  color: text(),
  currency: text().notNull().default('USD'),
  creditsName: text().notNull().default(''),
  creditPrice: real().notNull().default(0),
  defaultFeePercent: real().notNull().default(0),
  preChecklist: text({ mode: 'json' })
    .$type<{ id: string; label: string }[]>()
    .notNull()
    .default([]),
  notes: text().notNull().default(''),
  archived: integer({ mode: 'boolean' }).notNull().default(false),
  position: real().notNull().default(0),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull()
})

export const proposals = sqliteTable(
  'proposals',
  {
    ...base,
    platformId: text().notNull(),
    jobTitle: text().notNull(),
    jobUrl: text().notNull().default(''),
    jobDescription: text().notNull().default(''),
    niche: text().notNull().default(''),
    status: text().notNull().default('sent'),
    sentAt: integer(),
    credits: integer().notNull().default(0),
    boostCredits: integer().notNull().default(0),
    bidType: text().notNull().default('fixed'),
    bidAmount: real().notNull().default(0),
    feePercent: real(),
    coverLetter: text().notNull().default(''),
    templateId: text(),
    clientId: text(),
    clientName: text().notNull().default(''),
    clientCountry: text().notNull().default(''),
    clientRating: real(),
    clientSpent: real(),
    clientHireRate: real(),
    paymentVerified: integer({ mode: 'boolean' }),
    proposalsOnJob: text().notNull().default(''),
    checks: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
    starred: integer({ mode: 'boolean' }).notNull().default(false),
    notes: text().notNull().default(''),
    repliedAt: integer(),
    hiredAt: integer(),
    projectId: text()
  },
  (t) => [
    index('proposals_platform_idx').on(t.platformId, t.status),
    index('proposals_sent_idx').on(t.sentAt)
  ]
)

export const creditTxs = sqliteTable(
  'credit_txs',
  {
    id: text().primaryKey(),
    platformId: text().notNull(),
    kind: text().notNull().default('purchase'),
    amount: integer().notNull(),
    cost: real().notNull().default(0),
    at: integer().notNull(),
    note: text().notNull().default(''),
    createdAt: integer().notNull()
  },
  (t) => [index('credit_txs_platform_idx').on(t.platformId, t.at)]
)

export const messageTemplates = sqliteTable('message_templates', {
  ...base,
  situation: text().notNull().default('proposal'),
  /** «Для чого»: freelance / jobs / any. The app always writes it (derived from the situation when not given). */
  purpose: text().notNull().default('any'),
  title: text().notNull(),
  trigger: text().notNull().default(''),
  body: text().notNull().default(''),
  /** Name of the first version (`body`); empty — «Основна». */
  bodyName: text().notNull().default(''),
  /** Further text versions: [{ name, body }] (translations, a short variant). */
  versions: text({ mode: 'json' }).$type<TemplateVersion[]>().notNull().default([]),
  note: text().notNull().default(''),
  /** «Тип завдання» from before: no longer edited, kept for search and export. */
  niche: text().notNull().default(''),
  copyCount: integer().notNull().default(0)
})

export const portfolioCases = sqliteTable('portfolio_cases', {
  ...base,
  title: text().notNull(),
  niche: text().notNull().default(''),
  client: text().notNull().default(''),
  problem: text().notNull().default(''),
  whatDone: text().notNull().default(''),
  result: text().notNull().default(''),
  stack: text().notNull().default(''),
  url: text().notNull().default(''),
  textEn: text().notNull().default(''),
  projectId: text(),
  coverPath: text()
})

export const redFlags = sqliteTable('red_flags', {
  ...base,
  title: text().notNull(),
  signs: text().notNull().default(''),
  action: text().notNull().default(''),
  severity: integer().notNull().default(2)
})

export const goals = sqliteTable('goals', {
  id: text().primaryKey(),
  title: text().notNull().default(''),
  metric: text().notNull(),
  period: text().notNull().default('month'),
  target: real().notNull(),
  platformId: text(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: integer().notNull()
})

/* ───────────── Finance ───────────── */

export const subscriptions = sqliteTable('subscriptions', {
  id: text().primaryKey(),
  title: text().notNull(),
  amount: real().notNull(),
  currency: text().notNull().default('USD'),
  period: text().notNull().default('monthly'),
  billingDay: integer().notNull().default(1),
  billingMonth: integer().notNull().default(0),
  category: text().notNull().default('subscription'),
  url: text().notNull().default(''),
  note: text().notNull().default(''),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  startedAt: integer(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
  /** false = a client pays it (their server, hosting): out of every expense total, still on the list and calendar. */
  ownExpense: integer({ mode: 'boolean' }).notNull().default(true)
})

export const expenses = sqliteTable(
  'expenses',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    amount: real().notNull(),
    currency: text().notNull().default('USD'),
    category: text().notNull().default('other'),
    at: integer().notNull(),
    subscriptionId: text(),
    note: text().notNull().default(''),
    createdAt: integer().notNull()
  },
  (t) => [index('expenses_at_idx').on(t.at)]
)

export const withdrawals = sqliteTable(
  'withdrawals',
  {
    id: text().primaryKey(),
    platformId: text(),
    amount: real().notNull(),
    currency: text().notNull().default('USD'),
    fee: real().notNull().default(0),
    rate: real().notNull().default(1),
    receivedCurrency: text().notNull().default('UAH'),
    received: real().notNull().default(0),
    method: text().notNull().default(''),
    at: integer().notNull(),
    note: text().notNull().default(''),
    createdAt: integer().notNull()
  },
  (t) => [index('withdrawals_at_idx').on(t.at)]
)

/* ───────────── Job search ───────────── */

export const jobBoards = sqliteTable('job_boards', {
  id: text().primaryKey(),
  name: text().notNull(),
  url: text().notNull().default(''),
  color: text(),
  dailyTarget: integer().notNull().default(1),
  weekdays: text({ mode: 'json' }).$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  notes: text().notNull().default(''),
  position: real().notNull().default(0),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull()
})

export const boardCheckins = sqliteTable(
  'board_checkins',
  {
    boardId: text().notNull(),
    day: text().notNull(),
    note: text().notNull().default(''),
    createdAt: integer().notNull()
  },
  (t) => [primaryKey({ columns: [t.boardId, t.day] })]
)

export const companies = sqliteTable('companies', {
  ...base,
  name: text().notNull(),
  website: text().notNull().default(''),
  reviewsUrl: text().notNull().default(''),
  stack: text().notNull().default(''),
  size: text().notNull().default(''),
  location: text().notNull().default(''),
  contacts: text().notNull().default(''),
  notes: text().notNull().default(''),
  rating: integer().notNull().default(0)
})

export const resumes = sqliteTable('resumes', {
  id: text().primaryKey(),
  title: text().notNull(),
  changes: text().notNull().default(''),
  isCurrent: integer({ mode: 'boolean' }).notNull().default(false),
  filePath: text(),
  fileName: text().notNull().default(''),
  mime: text().notNull().default(''),
  size: integer().notNull().default(0),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull()
})

export const resumeBoards = sqliteTable(
  'resume_boards',
  {
    resumeId: text().notNull(),
    boardId: text().notNull(),
    uploadedAt: integer().notNull()
  },
  (t) => [primaryKey({ columns: [t.resumeId, t.boardId] })]
)

export const applications = sqliteTable(
  'applications',
  {
    ...base,
    title: text().notNull(),
    companyId: text(),
    companyName: text().notNull().default(''),
    boardId: text(),
    url: text().notNull().default(''),
    description: text().notNull().default(''),
    status: text().notNull().default('applied'),
    appliedAt: integer(),
    salaryMin: real(),
    salaryMax: real(),
    currency: text().notNull().default('USD'),
    format: text().notNull().default('remote'),
    location: text().notNull().default(''),
    resumeId: text(),
    templateId: text(),
    coverLetter: text().notNull().default(''),
    contact: text().notNull().default(''),
    followUpAt: integer(),
    notes: text().notNull().default(''),
    repliedAt: integer(),
    closedAt: integer()
  },
  (t) => [
    index('applications_status_idx').on(t.status),
    index('applications_applied_idx').on(t.appliedAt)
  ]
)

export const applicationStages = sqliteTable(
  'application_stages',
  {
    id: text().primaryKey(),
    applicationId: text()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: text().notNull().default('screening'),
    title: text().notNull().default(''),
    at: integer(),
    durationMin: integer().notNull().default(60),
    deadlineAt: integer(),
    status: text().notNull().default('planned'),
    location: text().notNull().default(''),
    notes: text().notNull().default(''),
    interviewers: text().notNull().default(''),
    eventId: text(),
    deadlineEventId: text(),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull()
  },
  (t) => [index('stages_application_idx').on(t.applicationId)]
)

export const interviewQuestions = sqliteTable('interview_questions', {
  ...base,
  category: text().notNull().default('technical'),
  topic: text().notNull().default(''),
  question: text().notNull(),
  answer: text().notNull().default(''),
  lang: text().notNull().default('ru'),
  difficulty: integer().notNull().default(2),
  companyId: text(),
  applicationId: text(),
  ease: real().notNull().default(2.5),
  intervalDays: real().notNull().default(0),
  repetitions: integer().notNull().default(0),
  lapses: integer().notNull().default(0),
  dueAt: integer().notNull(),
  lastReviewedAt: integer()
})

/* ───────────── Developer workspace ───────────── */

export const devProjects = sqliteTable('dev_projects', {
  id: text().primaryKey(),
  name: text().notNull(),
  path: text().notNull(),
  notes: text().notNull().default(''),
  editor: text().notNull().default('vscode'),
  mainScript: text().notNull().default(''),
  favorite: integer({ mode: 'boolean' }).notNull().default(false),
  githubRepo: text().notNull().default(''),
  lastOpenedAt: integer(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull()
})

/* ───────────── Weekly review ───────────── */

export const weeklyReviews = sqliteTable('weekly_reviews', {
  id: text().primaryKey(),
  weekStart: text().notNull().unique(),
  snapshot: text({ mode: 'json' }).$type<unknown>(),
  summary: text().notNull().default(''),
  plan: text().notNull().default(''),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull()
})
