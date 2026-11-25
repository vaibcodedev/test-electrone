/**
 * The single contract between renderer and main.
 * Main implements it (src/main/container.ts, served by src/main/ipc/rpc.ts), renderer consumes it through a typed proxy.
 * Every method takes at most ONE argument so that the transport stays trivial: rpc(path, arg).
 */
import type { EntityType } from './entity-types'
import type {
  ChipCountsQuery,
  EntityRef,
  EntitySummary,
  PageQuery,
  Tag,
  TagWithUsage
} from './domain/common'
import type { Idea, IdeaInput, IdeaListQuery, IdeaPatch, IdeaStatus } from './domain/ideas'
import type {
  AiConfigPatch,
  AiStatus,
  AiSuggestTagsInput,
  AiTagSuggestion,
  AiTestResult
} from './domain/ai'
import type {
  Board,
  BoardColumn,
  BoardDetails,
  BoardInput,
  BoardPatch,
  BoardSummary,
  Card,
  CardDetails,
  CardInput,
  CardMove,
  CardPatch,
  ChecklistEntry,
  ColumnInput,
  ColumnPatch,
  DueCard
} from './domain/boards'
import type {
  ClaudeInput,
  ClaudeItem,
  ClaudeKind,
  ClaudeListQuery,
  ClaudePatch
} from './domain/claude'
import type {
  Library,
  LibraryInput,
  LibraryListQuery,
  LibraryPatch,
  LibraryStatus
} from './domain/libraries'
import type {
  ComponentInput,
  ComponentListQuery,
  ComponentPatch,
  UiComponent
} from './domain/components'
import type {
  ClipboardImage,
  Design,
  DesignCountsQuery,
  DesignInput,
  DesignKind,
  DesignListQuery,
  DesignPatch,
  FileSource,
  Moodboard,
  MoodboardDetails,
  MoodboardInput,
  MoodboardListQuery,
  MoodboardPatch
} from './domain/designs'
import type {
  Snippet,
  SnippetInput,
  SnippetLanguage,
  SnippetListQuery,
  SnippetPatch
} from './domain/snippets'
import type {
  ClientDetails,
  ClientInput,
  ClientPatch,
  ClientSummary,
  CrmOverview,
  Credential,
  CredentialInput,
  CredentialPatch,
  Payment,
  PaymentInput,
  PaymentPatch,
  ProjectDetails,
  ProjectInput,
  ProjectListQuery,
  ProjectPatch,
  ProjectSummary,
  RunningTimer,
  TimeEntry,
  TimeEntryInput,
  TimeEntryPatch,
  ClientListQuery
} from './domain/crm'
import type {
  Checklist,
  ChecklistDetails,
  ChecklistInput,
  ChecklistItem,
  ChecklistItemInput,
  ChecklistItemPatch,
  ChecklistKind,
  ChecklistPatch,
  InstantiateInput
} from './domain/checklists'
import type { Fix, FixInput, FixListQuery, FixPatch } from './domain/fixes'
import type {
  Bookmark,
  BookmarkInput,
  BookmarkKind,
  BookmarkListQuery,
  BookmarkPatch,
  BookmarkStatus
} from './domain/bookmarks'
import type {
  EnglishStats,
  ReviewGrade,
  Word,
  WordInput,
  WordListQuery,
  WordPatch
} from './domain/english'
import type {
  CalendarEvent,
  CalendarItem,
  DateRange,
  EventInput,
  EventPatch
} from './domain/calendar'
import type { Note, NoteInput, NoteListQuery, NotePatch } from './domain/notes'
import type {
  CaptureInfo,
  PairAnswer,
  PairRequestView,
  DevProject,
  DevProjectInput,
  DevProjectPatch,
  GithubCommit,
  GithubIssue,
  GithubRepo,
  GithubStatus,
  LogChunk,
  RunningScript
} from './domain/dev'
import type { ReviewNotesInput, WeeklyReview } from './domain/review'
import type { SandboxInfo } from './domain/sandbox'
import type { ImportKind, ImportResult } from './domain/import'
import type {
  Application,
  ApplicationDetails,
  ApplicationInput,
  ApplicationListQuery,
  ApplicationPatch,
  CheckinInput,
  Company,
  CompanyInput,
  CompanyPatch,
  DailyBoard,
  InterviewQuestion,
  JobBoard,
  JobBoardInput,
  JobBoardPatch,
  JobsOverview,
  JobStats,
  QuestionCategory,
  QuestionInput,
  QuestionListQuery,
  QuestionPatch,
  Resume,
  ResumeInput,
  ResumePatch,
  Stage,
  StageInput,
  StagePatch,
  StageWithApplication
} from './domain/jobs'
import type {
  CaseInput,
  CasePatch,
  CreditsSummary,
  CreditTx,
  CreditTxInput,
  FreelanceStats,
  Goal,
  GoalInput,
  GoalPatch,
  GoalProgress,
  HireInput,
  MessageTemplate,
  Platform,
  PlatformInput,
  PlatformPatch,
  PortfolioCase,
  Proposal,
  ProposalInput,
  ProposalListQuery,
  ProposalPatch,
  RedFlag,
  RedFlagInput,
  RedFlagPatch,
  StatsQuery,
  TemplateInput,
  TemplatePatch,
  TemplateSituation
} from './domain/freelance'
import type {
  Expense,
  ExpenseInput,
  ExpensePatch,
  FinanceOverview,
  FinanceOverviewQuery,
  IncomeRow,
  MonthReport,
  Subscription,
  SubscriptionInput,
  SubscriptionMonthRow,
  SubscriptionPatch,
  Withdrawal,
  WithdrawalInput,
  WithdrawalPatch
} from './domain/finance'
import type {
  AppInfo,
  Attachment,
  BackupEntry,
  DashboardData,
  ExportFormat,
  LinkedEntity,
  LinkInput,
  PinKind,
  PinnedEntity,
  QuickAddInput,
  RecentQuery,
  SearchHit,
  SearchQuery,
  Settings,
  SettingsPatch,
  StorageFolder,
  StorageFreed,
  StorageUsage,
  TagInput,
  TrashItem,
  UpdateStatus
} from './domain/system'
import type { Mention, ResolvedLink } from './domain/mentions'

/** Standard CRUD surface shared by most modules (Interface Segregation: modules add their own extras). */
export interface CrudApi<TEntity, TInput, TPatch, TQuery = void> {
  /** Supports paging: pass { limit, offset } together with filters. */
  list(query?: TQuery & PageQuery): Promise<TEntity[]>
  get(id: string): Promise<TEntity | null>
  create(input: TInput): Promise<TEntity>
  update(args: { id: string; patch: TPatch }): Promise<TEntity>
  /** Soft delete → goes to trash for 30 days. */
  remove(id: string): Promise<void>
}

/** Live records per value of one column, under the page's search and tag (chip counters). */
export type ChipCounts<K extends string> = Partial<Record<K, number>>

export interface IdeasApi extends CrudApi<Idea, IdeaInput, IdeaPatch, IdeaListQuery> {
  /** Creates a board from the idea (default columns, idea body as first card) and links them. */
  convertToBoard(id: string): Promise<Board>
  counts(query?: ChipCountsQuery): Promise<ChipCounts<IdeaStatus>>
}

export interface BoardsApi extends CrudApi<BoardSummary, BoardInput, BoardPatch> {
  details(id: string): Promise<BoardDetails | null>
  addColumn(args: { boardId: string; input: ColumnInput }): Promise<BoardColumn>
  updateColumn(args: { id: string; patch: ColumnPatch }): Promise<BoardColumn>
  /** Hard-deletes a column; its cards move to `moveCardsTo` or are trashed if null. */
  removeColumn(args: { id: string; moveCardsTo: string | null }): Promise<void>
  reorderColumns(args: { boardId: string; ids: string[] }): Promise<void>
}

export interface CardsApi {
  get(id: string): Promise<CardDetails | null>
  create(input: CardInput): Promise<Card>
  update(args: { id: string; patch: CardPatch }): Promise<Card>
  remove(id: string): Promise<void>
  move(input: CardMove): Promise<void>
  /** Cards with a due date in range (for list/calendar views), optionally limited to one board. */
  due(args: { from: number; to: number; boardId?: string }): Promise<DueCard[]>
  addCheck(args: { cardId: string; text: string }): Promise<ChecklistEntry>
  updateCheck(args: { id: string; text?: string; done?: boolean }): Promise<ChecklistEntry>
  removeCheck(id: string): Promise<void>
  reorderChecks(args: { cardId: string; ids: string[] }): Promise<void>
}

export interface ClaudeApi extends CrudApi<ClaudeItem, ClaudeInput, ClaudePatch, ClaudeListQuery> {
  markCopied(id: string): Promise<void>
  counts(query?: ChipCountsQuery): Promise<ChipCounts<ClaudeKind>>
}

export interface LibrariesApi extends CrudApi<
  Library,
  LibraryInput,
  LibraryPatch,
  LibraryListQuery
> {
  counts(query?: ChipCountsQuery): Promise<ChipCounts<LibraryStatus>>
}

export interface ComponentsApi extends CrudApi<
  UiComponent,
  ComponentInput,
  ComponentPatch,
  ComponentListQuery
> {
  setCover(args: { id: string; source: FileSource }): Promise<UiComponent>
  removeCover(id: string): Promise<UiComponent>
}

export interface DesignsApi extends CrudApi<Design, DesignInput, DesignPatch, DesignListQuery> {
  /** Imports an image and creates a design from it. */
  importImage(args: { source: FileSource; input?: DesignInput }): Promise<Design>
  replaceImage(args: { id: string; source: FileSource }): Promise<Design>
  /** All distinct colors used across designs (for the color filter). */
  palette(): Promise<string[]>
  /**
   * Stores the palette extracted from the image (background fill-in): without updatedAt and a revision,
   * so the gallery sorted by «Змінено» doesn't reshuffle while you look at it.
   */
  setColors(args: { id: string; colors: string[] }): Promise<void>
  /** Live designs per kind under the same search, tag, colour and moodboard as `list` (kind chips). */
  counts(query?: DesignCountsQuery): Promise<ChipCounts<DesignKind>>
}

/**
 * Favourites first, then boards with designs, then empty ones. `designId`: each moodboard also says whether
 * that design is in it (`contains`, the «У добірку» picker); `search` — title and description.
 */
export interface MoodboardsApi extends CrudApi<
  Moodboard,
  MoodboardInput,
  MoodboardPatch,
  Omit<MoodboardListQuery, 'limit' | 'offset'>
> {
  /** Live moodboards (the «Добірки N» counter over the gallery). */
  count(): Promise<number>
  details(id: string): Promise<MoodboardDetails | null>
  addDesigns(args: { moodboardId: string; designIds: string[] }): Promise<void>
  removeDesign(args: { moodboardId: string; designId: string }): Promise<void>
  reorder(args: { moodboardId: string; designIds: string[] }): Promise<void>
}

export interface SnippetsApi extends CrudApi<
  Snippet,
  SnippetInput,
  SnippetPatch,
  SnippetListQuery
> {
  markCopied(id: string): Promise<void>
  counts(query?: ChipCountsQuery): Promise<ChipCounts<SnippetLanguage>>
}

/** A snippet or a Claude prompt in «Часто копіюю» (no code or prompt text: fetch it with `get` to copy). */
export interface CopiedItem {
  type: 'snippet' | 'claude'
  id: string
  title: string
  sub: string
  count: number
}

export interface KnowledgeApi {
  /** Snippets and prompts copied at least once, most copied first (limit ≤ 20, default 7). */
  mostCopied(limit?: number): Promise<CopiedItem[]>
}

export interface ClientsApi extends CrudApi<
  ClientSummary,
  ClientInput,
  ClientPatch,
  ClientListQuery
> {
  details(id: string): Promise<ClientDetails | null>
}

export interface ProjectsApi extends CrudApi<
  ProjectSummary,
  ProjectInput,
  ProjectPatch,
  ProjectListQuery
> {
  details(id: string): Promise<ProjectDetails | null>
  overview(): Promise<CrmOverview>
}

export interface CredentialsApi {
  list(args: { projectId?: string; clientId?: string }): Promise<Credential[]>
  create(input: CredentialInput): Promise<Credential>
  update(args: { id: string; patch: CredentialPatch }): Promise<Credential>
  remove(id: string): Promise<void>
  /** Decrypts the secret. Never cached in the renderer. */
  reveal(id: string): Promise<string>
}

export interface TimeApi {
  list(args: { projectId?: string; from?: number; to?: number }): Promise<TimeEntry[]>
  running(): Promise<RunningTimer | null>
  start(args: { projectId: string; description?: string }): Promise<RunningTimer>
  stop(): Promise<TimeEntry | null>
  create(input: TimeEntryInput): Promise<TimeEntry>
  update(args: { id: string; patch: TimeEntryPatch }): Promise<TimeEntry>
  remove(id: string): Promise<void>
}

export interface PaymentsApi {
  list(args: { projectId?: string }): Promise<Payment[]>
  create(input: PaymentInput): Promise<Payment>
  update(args: { id: string; patch: PaymentPatch }): Promise<Payment>
  remove(id: string): Promise<void>
}

/** Bulk import from JSON (see shared/domain/import IMPORT_DEFS). */
export interface ImporterApi {
  run(args: { kind: ImportKind; payload: unknown }): Promise<ImportResult>
}

export interface ChecklistsApi {
  list(
    args?: { kind?: ChecklistKind; search?: string; tagId?: string; favorite?: boolean } & PageQuery
  ): Promise<Checklist[]>
  /** Number of templates and runs (for the tab chips). */
  counts(): Promise<{ template: number; run: number }>
  get(id: string): Promise<ChecklistDetails | null>
  create(input: ChecklistInput): Promise<Checklist>
  update(args: { id: string; patch: ChecklistPatch }): Promise<Checklist>
  remove(id: string): Promise<void>
  /** Creates a run (copy) from a template. */
  instantiate(input: InstantiateInput): Promise<Checklist>
  /** Unticks every item of a run. */
  reset(id: string): Promise<void>
  addItem(input: ChecklistItemInput): Promise<ChecklistItem>
  updateItem(args: { id: string; patch: ChecklistItemPatch }): Promise<ChecklistItem>
  removeItem(id: string): Promise<void>
  reorderItems(args: { checklistId: string; ids: string[] }): Promise<void>
  /** Creates a template from JSON (checklistImportSchema) in one transaction. */
  importTemplate(json: unknown): Promise<Checklist>
}

export interface FixesApi extends CrudApi<Fix, FixInput, FixPatch, FixListQuery> {
  counts(query?: ChipCountsQuery): Promise<{ open: number; resolved: number }>
}

export interface BookmarksApi extends CrudApi<
  Bookmark,
  BookmarkInput,
  BookmarkPatch,
  BookmarkListQuery
> {
  /** `byStatus` within the chosen kind (as the status chips show it), `byKind` over all kinds. */
  counts(
    query?: ChipCountsQuery & { kind?: BookmarkKind }
  ): Promise<{ byStatus: ChipCounts<BookmarkStatus>; byKind: ChipCounts<BookmarkKind> }>
}

export interface EnglishApi extends CrudApi<Word, WordInput, WordPatch, WordListQuery> {
  /** Words due for review now, oldest first. */
  queue(limit?: number): Promise<Word[]>
  /** Words not due yet, hardest and soonest first — for practice beyond the daily norm. */
  practiceExtra(limit?: number): Promise<Word[]>
  review(args: { id: string; grade: ReviewGrade; extra?: boolean }): Promise<Word>
  stats(): Promise<EnglishStats>
}

export interface EventsApi extends CrudApi<CalendarEvent, EventInput, EventPatch> {
  /** Everything placed on the calendar in a range: events (expanded recurrences), card deadlines, payments, project deadlines. */
  feed(range: DateRange): Promise<CalendarItem[]>
}

export type NotesApi = CrudApi<Note, NoteInput, NotePatch, NoteListQuery> & {
  /** Distinct folders in use. */
  folders(): Promise<string[]>
  /** Live notes per folder ('' = without a folder), under the same search and tag as `list`. */
  folderCounts(query?: ChipCountsQuery): Promise<{ folder: string; count: number }[]>
}

export interface PlatformsApi {
  list(args?: { includeArchived?: boolean }): Promise<Platform[]>
  get(id: string): Promise<Platform | null>
  create(input: PlatformInput): Promise<Platform>
  update(args: { id: string; patch: PlatformPatch }): Promise<Platform>
  reorder(ids: string[]): Promise<void>
}

export interface ProposalsApi extends CrudApi<
  Proposal,
  ProposalInput,
  ProposalPatch,
  ProposalListQuery
> {
  /** Distinct niches used so far (for suggestions). */
  niches(): Promise<string[]>
  /** Sent proposals with no answer for N days (default 3) — time to follow up. */
  stale(args?: { days?: number; platformId?: string }): Promise<Proposal[]>
  /** Creates (or reuses) a CRM client and a contract from a won proposal; status → hired. */
  hire(input: HireInput): Promise<{ projectId: string; clientId: string }>
  /** Saves the cover letter as a new proposal template. */
  toTemplate(id: string): Promise<MessageTemplate>
}

export interface CreditsApi {
  list(args: { platformId: string }): Promise<CreditTx[]>
  add(input: CreditTxInput): Promise<CreditTx>
  remove(id: string): Promise<void>
  summary(args: { platformId: string }): Promise<CreditsSummary>
}

export interface TemplatesApi extends CrudApi<
  MessageTemplate,
  TemplateInput,
  TemplatePatch,
  { situation?: TemplateSituation; search?: string; tagId?: string }
> {
  markCopied(id: string): Promise<void>
}

export type CasesApi = CrudApi<
  PortfolioCase,
  CaseInput,
  CasePatch,
  { search?: string; niche?: string; tagId?: string }
> & {
  setCover(args: { id: string; source: FileSource }): Promise<PortfolioCase>
}

export type RedFlagsApi = CrudApi<RedFlag, RedFlagInput, RedFlagPatch, { search?: string }>

export interface GoalsApi {
  list(): Promise<Goal[]>
  progress(args?: { platformId?: string }): Promise<GoalProgress[]>
  create(input: GoalInput): Promise<Goal>
  update(args: { id: string; patch: GoalPatch }): Promise<Goal>
  remove(id: string): Promise<void>
}

export interface FreelanceApi {
  stats(query?: StatsQuery): Promise<FreelanceStats>
}

export interface FinanceApi {
  /** `{ month }` (yyyy-mm) older than the last 12 months moves the chart window to end with it. */
  overview(args?: FinanceOverviewQuery): Promise<FinanceOverview>
  month(args: { month: string }): Promise<MonthReport>
  income(args: { from: number; to: number }): Promise<IncomeRow[]>
  subscriptions(): Promise<Subscription[]>
  subscriptionMonth(args: { month: string }): Promise<SubscriptionMonthRow[]>
  createSubscription(input: SubscriptionInput): Promise<Subscription>
  updateSubscription(args: { id: string; patch: SubscriptionPatch }): Promise<Subscription>
  removeSubscription(id: string): Promise<void>
  /** Marks a subscription paid for the month (creates an expense) or unpaid (removes it). */
  setSubscriptionPaid(args: {
    id: string
    month: string
    paid: boolean
    amount?: number
  }): Promise<void>
  expenses(args: { from: number; to: number }): Promise<Expense[]>
  createExpense(input: ExpenseInput): Promise<Expense>
  updateExpense(args: { id: string; patch: ExpensePatch }): Promise<Expense>
  removeExpense(id: string): Promise<void>
  withdrawals(args?: { from?: number; to?: number }): Promise<Withdrawal[]>
  createWithdrawal(input: WithdrawalInput): Promise<Withdrawal>
  updateWithdrawal(args: { id: string; patch: WithdrawalPatch }): Promise<Withdrawal>
  removeWithdrawal(id: string): Promise<void>
}

export interface JobsApi {
  boards(args?: { includeInactive?: boolean }): Promise<JobBoard[]>
  createBoard(input: JobBoardInput): Promise<JobBoard>
  updateBoard(args: { id: string; patch: JobBoardPatch }): Promise<JobBoard>
  /** Deletes a board with no applications or check-ins yet; otherwise a UserError (switch it off instead). */
  removeBoard(id: string): Promise<void>
  reorderBoards(ids: string[]): Promise<void>
  /** Board × day matrix (default 28 days) with today's status and streaks. */
  daily(args?: { days?: number }): Promise<DailyBoard[]>
  /** Manual «проверил сегодня» mark. */
  checkin(input: CheckinInput): Promise<void>

  list(query?: ApplicationListQuery & PageQuery): Promise<Application[]>
  get(id: string): Promise<ApplicationDetails | null>
  create(input: ApplicationInput): Promise<Application>
  update(args: { id: string; patch: ApplicationPatch }): Promise<Application>
  remove(id: string): Promise<void>
  /** Open applications whose follow-up date passed or with no answer for 7+ days. */
  followUps(): Promise<Application[]>

  /** Adding a stage moves the application to «Собеседование»/«Тестовое» and creates calendar events. */
  addStage(input: StageInput): Promise<Stage>
  updateStage(args: { id: string; patch: StagePatch }): Promise<Stage>
  removeStage(id: string): Promise<void>
  upcoming(limit?: number): Promise<StageWithApplication[]>
  /** Finished or past stages, newest first (interview history). */
  pastStages(limit?: number): Promise<StageWithApplication[]>

  companies(query?: { search?: string } & PageQuery): Promise<Company[]>
  /** Company with this name (case-insensitive), if it exists — for «Вже є: Відкрити». */
  findCompany(name: string): Promise<Company | null>
  company(id: string): Promise<Company | null>
  createCompany(input: CompanyInput): Promise<Company>
  updateCompany(args: { id: string; patch: CompanyPatch }): Promise<Company>
  removeCompany(id: string): Promise<void>

  resumes(): Promise<Resume[]>
  createResume(args: { input: ResumeInput; source?: FileSource }): Promise<Resume>
  updateResume(args: { id: string; patch: ResumePatch }): Promise<Resume>
  replaceResumeFile(args: { id: string; source: FileSource }): Promise<Resume>
  removeResume(id: string): Promise<void>
  setResumeUploaded(args: { resumeId: string; boardId: string; uploaded: boolean }): Promise<void>

  questions(query?: QuestionListQuery & PageQuery): Promise<InterviewQuestion[]>
  /** Questions per category under the same search and tag as `questions` (chip counters). */
  questionCounts(query?: ChipCountsQuery): Promise<ChipCounts<QuestionCategory>>
  question(id: string): Promise<InterviewQuestion | null>
  createQuestion(input: QuestionInput): Promise<InterviewQuestion>
  updateQuestion(args: { id: string; patch: QuestionPatch }): Promise<InterviewQuestion>
  removeQuestion(id: string): Promise<void>
  topics(): Promise<string[]>
  practiceQueue(args?: {
    limit?: number
    category?: QuestionCategory
    group?: 'technical' | 'nontechnical'
  }): Promise<InterviewQuestion[]>
  reviewQuestion(args: { id: string; grade: number; extra?: boolean }): Promise<InterviewQuestion>
  /** Not-yet-due questions for extra practice: soonest due and weakest (lowest ease) first. */
  practiceExtra(args: {
    limit?: number
    category?: QuestionCategory
    group?: 'technical' | 'nontechnical'
    topic?: string
    excludeIds?: string[]
  }): Promise<InterviewQuestion[]>

  stats(args?: { from?: number; to?: number }): Promise<JobStats>
  overview(): Promise<JobsOverview>
}

export interface DevProjectsApi {
  list(): Promise<DevProject[]>
  get(id: string): Promise<DevProject | null>
  create(input: DevProjectInput): Promise<DevProject>
  update(args: { id: string; patch: DevProjectPatch }): Promise<DevProject>
  remove(id: string): Promise<void>
  /** Native folder picker; null if cancelled. */
  pickFolder(): Promise<string | null>
  /** Sub-folders of `root` that look like projects and are not added yet. */
  scan(
    root: string
  ): Promise<{ name: string; path: string; hasGit: boolean; hasPackage: boolean }[]>
  open(args: {
    projectId: string
    target: 'vscode' | 'cursor' | 'terminal' | 'folder'
  }): Promise<void>
  /** Runs a package.json script (only scripts that exist there). Logs stream via the "dev:log" event. */
  run(args: { projectId: string; script: string }): Promise<RunningScript>
  stop(runId: string): Promise<void>
  runs(): Promise<RunningScript[]>
  logs(runId: string): Promise<LogChunk[]>
  clearFinished(): Promise<void>
}

export interface GithubApi {
  status(): Promise<GithubStatus>
  /** Empty string disconnects. Stored encrypted. */
  setToken(args: { token: string }): Promise<GithubStatus>
  repos(args?: { force?: boolean }): Promise<GithubRepo[]>
  issues(args?: { repo?: string; force?: boolean }): Promise<GithubIssue[]>
  commits(args?: { repo?: string; force?: boolean }): Promise<GithubCommit[]>
}

/** «Штучний інтелект» on the person's own key: requests go only from main, the key never comes back. */
export interface AiApi {
  status(): Promise<AiStatus>
  /** Switch, provider, address, model, daily limit; a new provider starts from its recommended model. */
  setConfig(patch: AiConfigPatch): Promise<AiStatus>
  /** Key of the chosen provider, stored encrypted (OS keychain). */
  setKey(args: { key: string }): Promise<AiStatus>
  clearKey(): Promise<AiStatus>
  /** A tiny request without any record text; a plain Ukrainian error when it fails. */
  test(): Promise<AiTestResult>
  /**
   * Up to five tags for a record (existing ones preferred). A cloud provider needs `consent: true` once —
   * after the warning that the record text goes to it.
   */
  suggestTags(input: AiSuggestTagsInput): Promise<AiTagSuggestion[]>
  /** Aborts the requests in flight (the record was closed). */
  cancel(): Promise<void>
}

export interface ReviewApi {
  /** Week by its Monday (yyyy-mm-dd); current week when omitted. */
  get(args?: { weekStart?: string }): Promise<WeeklyReview>
  saveNotes(input: ReviewNotesInput): Promise<void>
  list(): Promise<{ weekStart: string; hasNotes: boolean }[]>
}

export interface CaptureApi {
  info(): Promise<CaptureInfo>
  /** A new key: every extension (paired or with a pasted key) is disconnected — «Відключити». */
  regenerateKey(): Promise<CaptureInfo>
  openExtensionDir(): Promise<void>
  /** The pairing request waiting for an answer (the dialog reads it on start), or null. */
  pairRequest(): Promise<PairRequestView | null>
  /** «Дозволити» / «Відхилити»: refused when the request is gone or was replaced meanwhile. */
  answerPair(input: PairAnswer): Promise<void>
}

export interface TagsApi {
  list(): Promise<TagWithUsage[]>
  create(input: TagInput): Promise<Tag>
  update(args: { id: string; patch: Partial<TagInput> }): Promise<Tag>
  remove(id: string): Promise<void>
  /** Live entities carrying the tag, recently changed first; pass `{ tagId, limit, offset }` to page. */
  entities(args: string | ({ tagId: string } & PageQuery)): Promise<EntitySummary[]>
}

export interface LinksApi {
  list(ref: EntityRef): Promise<LinkedEntity[]>
  create(input: LinkInput): Promise<void>
  remove(linkId: string): Promise<void>
}

/** Record links typed with «[[» in Markdown fields (separate from the manual «Зв’язки» of LinksApi). */
export interface MentionsApi {
  /** «Згадки»: live records whose text links to this one, recently changed first, with the words around it. */
  list(ref: EntityRef): Promise<Mention[]>
  /** Current title and state of the records a text links to (links are resolved by id when they render). */
  resolve(refs: EntityRef[]): Promise<ResolvedLink[]>
}

export interface PinsApi {
  list(kind?: PinKind): Promise<PinnedEntity[]>
  /** Live records with the mark, type + id only (★ marks in lists, the «Обране» chip). */
  refs(kind: PinKind): Promise<EntityRef[]>
  /** Returns the new state. */
  toggle(args: { ref: EntityRef; kind: PinKind }): Promise<boolean>
  state(ref: EntityRef): Promise<Record<PinKind, boolean>>
  reorder(args: { kind: PinKind; refs: EntityRef[] }): Promise<void>
}

export interface SearchApi {
  query(query: SearchQuery): Promise<SearchHit[]>
  /** A number is the limit; `{ limit, types }` narrows to those entity types on the server. */
  recent(args?: RecentQuery): Promise<EntitySummary[]>
}

/** A record's own row + tags at the moment editing started (see RevisionService). */
export interface RecordSnapshot {
  row: Record<string, unknown>
  tagIds: string[]
  /** Child rows edited with the record (checklist items): rolled back by «Скасувати» too. */
  children?: unknown
}

/** «Скасувати» in the view/edit mode. */
export interface RecordsApi {
  snapshot(ref: EntityRef): Promise<RecordSnapshot>
  changed(args: { ref: EntityRef; snapshot: RecordSnapshot }): Promise<boolean>
  revert(args: { ref: EntityRef; snapshot: RecordSnapshot }): Promise<void>
  /**
   * «Зберегти» on a record created a moment ago: keep it even under the default title and empty, so neither
   * leaving the page nor the next «+ Створити» treats it as an empty draft.
   */
  keep(ref: EntityRef): Promise<void>
}

export interface TrashApi {
  list(args?: PageQuery): Promise<TrashItem[]>
  count(): Promise<number>
  restore(ref: EntityRef): Promise<void>
  purge(ref: EntityRef): Promise<void>
  empty(): Promise<number>
  /** Deletes the record for good if it's still an empty draft; true when it was discarded. */
  discardDraft(ref: EntityRef): Promise<boolean>
  /** «Скасувати» on a just-created record: delete it for good (records from the last day only). */
  discardNew(ref: EntityRef): Promise<boolean>
}

export interface FilesApi {
  list(ref: EntityRef): Promise<Attachment[]>
  add(args: { ref: EntityRef; source: FileSource }): Promise<Attachment>
  remove(id: string): Promise<void>
  open(id: string): Promise<void>
  reveal(id: string): Promise<void>
  /** Opens a stored file (relative path under <data>/files) in its default app. */
  openPath(path: string): Promise<void>
  /** True if the system clipboard currently holds an image. */
  clipboardHasImage(): Promise<boolean>
  /** The clipboard's image for a preview («З буфера» asks before adding); null when there is none. */
  clipboardImage(): Promise<ClipboardImage | null>
}

export interface BackupApi {
  list(): Promise<BackupEntry[]>
  /** Creates a backup; with `saveAs` asks where to save it, otherwise stores in the backups folder. */
  create(args: { saveAs: boolean }): Promise<BackupEntry | null>
  /** Asks for a backup file (or uses `path`) and restores it. The app reloads afterwards. */
  restore(args: { path?: string }): Promise<boolean>
  /** Exports all data to a zip (markdown files or one JSON). Returns the saved path or null if cancelled. */
  export(format: ExportFormat): Promise<string | null>
}

/** Налаштування → Сховище: disk use by category and the cleanups that cannot touch user data. */
export interface StorageApi {
  /** Sizes by category; cached in main (10 s + a folder fingerprint). */
  usage(): Promise<StorageUsage>
  /** Drops the cache: the next usage() walks the disk again («Перерахувати»). */
  recount(): Promise<void>
  /** HTTP cache, V8 code cache, shader cache, Cache Storage. Never localStorage/IndexedDB/cookies. */
  clearCache(): Promise<StorageFreed>
  /** Rotated logs next to the current one; the current log stays. */
  clearLogs(): Promise<StorageFreed>
  /** Regular backups beyond backupKeep, pre-restore copies beyond the newest, stale .part files. */
  pruneBackups(): Promise<StorageFreed>
  openFolder(args: { folder: StorageFolder }): Promise<void>
}

export interface SettingsApi {
  get(): Promise<Settings>
  update(patch: SettingsPatch): Promise<Settings>
  info(): Promise<AppInfo>
  openDataDir(): Promise<void>
  /** Opens the log file folder. */
  openLogs(): Promise<void>
}

export interface UpdatesApi {
  status(): Promise<UpdateStatus>
  check(): Promise<UpdateStatus>
  install(): Promise<void>
}

export interface AppApi {
  dashboard(): Promise<DashboardData>
  quickAdd(input: QuickAddInput): Promise<EntitySummary>
  /** Hides the quick-add window. */
  closeQuickAdd(): Promise<void>
  showMain(args?: { route?: string }): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  /** Renderer errors go to the main log file. */
  logError(args: { message: string; stack?: string; source?: string }): Promise<void>
  /** Renderer reports the theme it actually shows, so the native window buttons match it. */
  setWindowTheme(theme: 'light' | 'dark'): Promise<void>
}

/**
 * «Тестовий режим». No method takes an argument: the sandbox folder is always computed in main, a path never
 * comes from the renderer. enter / exit / clear (in the sandbox) relaunch Vault a moment after answering.
 */
export interface SandboxApi {
  info(): Promise<SandboxInfo>
  /** Main profile only: relaunch with the test data. */
  enter(): Promise<void>
  /** Sandbox only: relaunch with the real data. */
  exit(): Promise<void>
  /** Main: delete the test folder (only with its own marker). Sandbox: relaunch with a fresh test database. */
  clear(): Promise<void>
  /** Sandbox only, once per test database: example records in every section. */
  fillDemo(): Promise<{ created: number }>
}

export interface Api {
  ideas: IdeasApi
  boards: BoardsApi
  cards: CardsApi
  claude: ClaudeApi
  libraries: LibrariesApi
  components: ComponentsApi
  designs: DesignsApi
  moodboards: MoodboardsApi
  snippets: SnippetsApi
  clients: ClientsApi
  projects: ProjectsApi
  credentials: CredentialsApi
  time: TimeApi
  payments: PaymentsApi
  checklists: ChecklistsApi
  fixes: FixesApi
  bookmarks: BookmarksApi
  knowledge: KnowledgeApi
  english: EnglishApi
  events: EventsApi
  notes: NotesApi
  platforms: PlatformsApi
  proposals: ProposalsApi
  credits: CreditsApi
  templates: TemplatesApi
  cases: CasesApi
  redflags: RedFlagsApi
  goals: GoalsApi
  freelance: FreelanceApi
  finance: FinanceApi
  jobs: JobsApi
  devProjects: DevProjectsApi
  github: GithubApi
  ai: AiApi
  review: ReviewApi
  capture: CaptureApi
  tags: TagsApi
  links: LinksApi
  mentions: MentionsApi
  pins: PinsApi
  search: SearchApi
  trash: TrashApi
  records: RecordsApi
  files: FilesApi
  backup: BackupApi
  storage: StorageApi
  settings: SettingsApi
  updates: UpdatesApi
  app: AppApi
  importer: ImporterApi
  sandbox: SandboxApi
}

export type ApiNamespace = keyof Api

/* ───────────── Main → renderer events ───────────── */

export interface MainEvents {
  /** Data changed outside the current window (quick add, reminders, restore…). */
  'data:changed': { types: EntityType[] | 'all' }
  navigate: { route: string }
  'updates:status': UpdateStatus
  'settings:changed': Settings
  'quick-add:open': { target?: string }
  'dev:log': LogChunk[]
  'dev:status': RunningScript
  /** Messages from background work (e.g. editor not found). */
  toast: { kind: 'error' | 'success' | 'info'; message: string }
  /** The extension asks for access («Під’єднати до Vault»); null once it is answered, replaced or expired. */
  'capture:pair': PairRequestView | null
}

export type MainEventName = keyof MainEvents
export const MAIN_EVENTS: MainEventName[] = [
  'data:changed',
  'navigate',
  'updates:status',
  'settings:changed',
  'quick-add:open',
  'dev:log',
  'dev:status',
  'toast',
  'capture:pair'
]

/** Shape of the RPC envelope; errors are serialised explicitly to keep messages intact. */
export type RpcResult<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string; code?: string }

export const RPC_CHANNEL = 'vault:rpc'
