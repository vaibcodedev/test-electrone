/**
 * «Тестовий режим»: a second data profile of Vault in its own userData folder (`<main userData>-sandbox`).
 * The profile is a process argument, never a setting: a normal start always opens the real data.
 */
export const PROFILE_KINDS = ['main', 'sandbox'] as const
export type ProfileKind = (typeof PROFILE_KINDS)[number]

/** Main → renderer through webPreferences.additionalArguments (read in preload). */
export const PROFILE_ARG_PREFIX = '--vault-profile='

export interface SandboxInfo {
  profile: ProfileKind
  /** userData of the test Vault («…-sandbox»). Display only: no RPC method takes a path. */
  dir: string
  /** The folder exists at all (not only vault.db): leftovers of a failed start can be cleared too. */
  exists: boolean
  /** Main profile only, counted asynchronously; null in the sandbox (not shown there). */
  sizeBytes: number | null
  /** False under `npm run dev` (electron-vite owns the process and cannot be relaunched). */
  canSwitch: boolean
  /** Sandbox only: «Заповнити демо-даними» has already run on this test database. */
  demoFilled: boolean
  /** Scripts running in «Розробка»: the confirm says they will stop. */
  runningScripts: number
  /** Sandbox only: where the real backups are, for the «Відновити з файлу» hint. Display only. */
  mainBackupsDir: string | null
}
