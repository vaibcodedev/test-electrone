/**
 * The log follows userData: dev (vault-dev) and tests (--user-data-dir) must never write to — or clean —
 * the installed Vault's log, which electron-log's default %APPDATA%/<package name>/logs would be.
 */
import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'

const USER_DATA = join('C:', 'tmp', 'vault-test-user-data')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? USER_DATA : ''),
    getVersion: () => 'test',
    isPackaged: false
  }
}))

/** electron-log stand-in: getFile() resolves the path the way the real file transport does. */
vi.mock('electron-log/main', () => {
  const file: {
    resolvePathFn?: (v: { fileName?: string }) => string
    getFile: () => { path: string }
  } = {
    getFile: () => ({ path: file.resolvePathFn!({ fileName: 'main.log' }) })
  }
  return {
    default: {
      transports: { file, console: {} },
      functions: {},
      errorHandler: { startCatching: () => undefined },
      info: () => undefined
    }
  }
})

const { logFilePath, setupLogging } = await import('@main/core/logger')

describe('log file', () => {
  it('lies in <userData>/logs', () => {
    setupLogging()
    expect(logFilePath()).toBe(join(USER_DATA, 'logs', 'main.log'))
  })
})
