/**
 * The single contract between renderer and main.
 * Main implements it (src/main/ipc/router.ts), renderer consumes it through a typed proxy.
 * Every method takes at most ONE argument so that the transport stays trivial: rpc(path, arg).
 */
import type { EntityType } from './entity-types'
import type { EntityRef, EntitySummary, Tag, TagWithUsage } from './domain/common'
import type { Idea, IdeaInput, IdeaListQuery, IdeaPatch } from './domain/ideas'
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
import type { ClaudeInput, ClaudeItem, ClaudeListQuery, ClaudePatch } from './domain/claude'
import type { Library, LibraryInput, LibraryListQuery, LibraryPatch } from './domain/libraries'
import type {
  ComponentInput,
  ComponentListQuery,
  ComponentPatch,
  UiComponent
} from './domain/components'
import type {
  Design,
  DesignInput,
  DesignListQuery,
  DesignPatch,
  FileSource,
  Moodboard,
  MoodboardDetails,
  MoodboardInput,
  MoodboardPatch
} from './domain/designs'
import type { Snippet, SnippetInput, SnippetListQuery, SnippetPatch } from './domain/snippets'
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
  TimeEntryPatch
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
import type { Bookmark, BookmarkInput, BookmarkListQuery, BookmarkPatch } from './domain/bookmarks'
import type {
  EnglishStats,
  ReviewGrade,
  Word,
  WordInput,
  WordListQuery,
  WordPatch
} from './domain/english'
import type { CalendarEvent, CalendarItem, DateRange, EventInput, EventPatch } from './domain/calendar'
import type { Note, NoteInput, NoteListQuery, NotePatch } from './domain/notes'
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
  SearchHit,
  SearchQuery,
  Settings,
  SettingsPatch,
  TagInput,
  TrashItem,
  UpdateStatus
} from './domain/system'

/** Standard CRUD surface shared by most modules (Interface Segregation: modules add their own extras). */
export interface CrudApi<TEntity, TInput, TPatch, TQuery = void> {
  list(query?: TQuery): Promise<TEntity[]>
  get(id: string): Promise<TEntity | null>
  create(input: TInput): Promise<TEntity>
  update(args: { id: string; patch: TPatch }): Promise<TEntity>
  /** Soft delete → goes to trash for 30 days. */
  remove(id: string): Promise<void>
}

export interface IdeasApi extends CrudApi<Idea, IdeaInput, IdeaPatch, IdeaListQuery> {
  /** Creates a board from the idea (default columns, idea body as first card) and links them. */
  convertToBoard(id: string): Promise<Board>
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
}

export type LibrariesApi = CrudApi<Library, LibraryInput, LibraryPatch, LibraryListQuery>

export interface ComponentsApi
  extends CrudApi<UiComponent, ComponentInput, ComponentPatch, ComponentListQuery> {
  setCover(args: { id: string; source: FileSource }): Promise<UiComponent>
  removeCover(id: string): Promise<UiComponent>
}

export interface DesignsApi extends CrudApi<Design, DesignInput, DesignPatch, DesignListQuery> {
  /** Imports an image and creates a design from it. */
  importImage(args: { source: FileSource; input?: DesignInput }): Promise<Design>
  replaceImage(args: { id: string; source: FileSource }): Promise<Design>
  /** All distinct colors used across designs (for the color filter). */
  palette(): Promise<string[]>
}

export interface MoodboardsApi
  extends CrudApi<Moodboard, MoodboardInput, MoodboardPatch> {
  details(id: string): Promise<MoodboardDetails | null>
  addDesigns(args: { moodboardId: string; designIds: string[] }): Promise<void>
  removeDesign(args: { moodboardId: string; designId: string }): Promise<void>
  reorder(args: { moodboardId: string; designIds: string[] }): Promise<void>
}

export interface SnippetsApi extends CrudApi<Snippet, SnippetInput, SnippetPatch, SnippetListQuery> {
  markCopied(id: string): Promise<void>
}

export interface ClientsApi extends CrudApi<ClientSummary, ClientInput, ClientPatch> {
  details(id: string): Promise<ClientDetails | null>
}

export interface ProjectsApi
  extends CrudApi<ProjectSummary, ProjectInput, ProjectPatch, ProjectListQuery> {
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

export interface ChecklistsApi {
  list(args?: { kind?: ChecklistKind; search?: string; tagId?: string }): Promise<Checklist[]>
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
}

export type FixesApi = CrudApi<Fix, FixInput, FixPatch, FixListQuery>
export type BookmarksApi = CrudApi<Bookmark, BookmarkInput, BookmarkPatch, BookmarkListQuery>

export interface EnglishApi extends CrudApi<Word, WordInput, WordPatch, WordListQuery> {
  /** Words due for review now, oldest first. */
  queue(limit?: number): Promise<Word[]>
  review(args: { id: string; grade: ReviewGrade }): Promise<Word>
  stats(): Promise<EnglishStats>
}

export interface EventsApi extends CrudApi<CalendarEvent, EventInput, EventPatch> {
  /** Everything placed on the calendar in a range: events (expanded recurrences), card deadlines, payments, project deadlines. */
  feed(range: DateRange): Promise<CalendarItem[]>
}

export type NotesApi = CrudApi<Note, NoteInput, NotePatch, NoteListQuery> & {
  /** Distinct folders in use. */
  folders(): Promise<string[]>
}

export interface PlatformsApi {
  list(args?: { includeArchived?: boolean }): Promise<Platform[]>
  get(id: string): Promise<Platform | null>
  create(input: PlatformInput): Promise<Platform>
  update(args: { id: string; patch: PlatformPatch }): Promise<Platform>
  reorder(ids: string[]): Promise<void>
}

export interface ProposalsApi extends CrudApi<Proposal, ProposalInput, ProposalPatch, ProposalListQuery> {
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

export interface TemplatesApi extends CrudApi<MessageTemplate, TemplateInput, TemplatePatch, { situation?: TemplateSituation; search?: string; tagId?: string }> {
  markCopied(id: string): Promise<void>
}

export type CasesApi = CrudApi<PortfolioCase, CaseInput, CasePatch, { search?: string; niche?: string; tagId?: string }> & {
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
  overview(): Promise<FinanceOverview>
  month(args: { month: string }): Promise<MonthReport>
  income(args: { from: number; to: number }): Promise<IncomeRow[]>
  subscriptions(): Promise<Subscription[]>
  subscriptionMonth(args: { month: string }): Promise<SubscriptionMonthRow[]>
  createSubscription(input: SubscriptionInput): Promise<Subscription>
  updateSubscription(args: { id: string; patch: SubscriptionPatch }): Promise<Subscription>
  removeSubscription(id: string): Promise<void>
  /** Marks a subscription paid for the month (creates an expense) or unpaid (removes it). */
  setSubscriptionPaid(args: { id: string; month: string; paid: boolean; amount?: number }): Promise<void>
  expenses(args: { from: number; to: number }): Promise<Expense[]>
  createExpense(input: ExpenseInput): Promise<Expense>
  updateExpense(args: { id: string; patch: ExpensePatch }): Promise<Expense>
  removeExpense(id: string): Promise<void>
  withdrawals(args?: { from?: number; to?: number }): Promise<Withdrawal[]>
  createWithdrawal(input: WithdrawalInput): Promise<Withdrawal>
  updateWithdrawal(args: { id: string; patch: WithdrawalPatch }): Promise<Withdrawal>
  removeWithdrawal(id: string): Promise<void>
}

export interface TagsApi {
  list(): Promise<TagWithUsage[]>
  create(input: TagInput): Promise<Tag>
  update(args: { id: string; patch: Partial<TagInput> }): Promise<Tag>
  remove(id: string): Promise<void>
  /** Every entity carrying the tag. */
  entities(tagId: string): Promise<EntitySummary[]>
}

export interface LinksApi {
  list(ref: EntityRef): Promise<LinkedEntity[]>
  create(input: LinkInput): Promise<void>
  remove(linkId: string): Promise<void>
}

export interface PinsApi {
  list(kind?: PinKind): Promise<PinnedEntity[]>
  /** Returns the new state. */
  toggle(args: { ref: EntityRef; kind: PinKind }): Promise<boolean>
  state(ref: EntityRef): Promise<Record<PinKind, boolean>>
  reorder(args: { kind: PinKind; refs: EntityRef[] }): Promise<void>
}

export interface SearchApi {
  query(query: SearchQuery): Promise<SearchHit[]>
  recent(limit?: number): Promise<EntitySummary[]>
}

export interface TrashApi {
  list(): Promise<TrashItem[]>
  restore(ref: EntityRef): Promise<void>
  purge(ref: EntityRef): Promise<void>
  empty(): Promise<number>
}

export interface FilesApi {
  list(ref: EntityRef): Promise<Attachment[]>
  add(args: { ref: EntityRef; source: FileSource }): Promise<Attachment>
  remove(id: string): Promise<void>
  open(id: string): Promise<void>
  reveal(id: string): Promise<void>
  /** True if the system clipboard currently holds an image. */
  clipboardHasImage(): Promise<boolean>
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

export interface SettingsApi {
  get(): Promise<Settings>
  update(patch: SettingsPatch): Promise<Settings>
  info(): Promise<AppInfo>
  openDataDir(): Promise<void>
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
  tags: TagsApi
  links: LinksApi
  pins: PinsApi
  search: SearchApi
  trash: TrashApi
  files: FilesApi
  backup: BackupApi
  settings: SettingsApi
  updates: UpdatesApi
  app: AppApi
}

export type ApiNamespace = keyof Api

/* ───────────── Main → renderer events ───────────── */

export interface MainEvents {
  /** Data changed outside the current window (quick add, reminders, restore…). */
  'data:changed': { types: EntityType[] | 'all' }
  'navigate': { route: string }
  'updates:status': UpdateStatus
  'settings:changed': Settings
  'quick-add:open': { target?: string }
  'command:search': Record<string, never>
}

export type MainEventName = keyof MainEvents
export const MAIN_EVENTS: MainEventName[] = [
  'data:changed',
  'navigate',
  'updates:status',
  'settings:changed',
  'quick-add:open',
  'command:search'
]

/** Shape of the RPC envelope; errors are serialised explicitly to keep messages intact. */
export type RpcResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string }

export const RPC_CHANNEL = 'vault:rpc'
