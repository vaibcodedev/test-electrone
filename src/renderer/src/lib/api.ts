import type { Api, ApiNamespace } from '@shared/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

/**
 * Typed client for the main-process API: `api.ideas.list({...})`.
 * Built from a Proxy so the renderer never needs a hand-written client per module.
 */
function createApi(): Api {
  const namespaces = new Map<string, unknown>()
  return new Proxy({} as Api, {
    get(_, ns: string) {
      if (!namespaces.has(ns)) {
        namespaces.set(
          ns,
          new Proxy(
            {},
            {
              get(__, method: string) {
                return async (arg?: unknown) => {
                  const res = await window.vault.rpc(`${ns}.${method}`, arg)
                  if (!res.ok) throw new ApiError(res.error, res.code)
                  return res.data
                }
              }
            }
          )
        )
      }
      return namespaces.get(ns)
    }
  })
}

export const api = createApi()

/* ───── helper types for hooks ───── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (arg?: any) => Promise<any>

export type MethodOf<N extends ApiNamespace> = {
  [K in keyof Api[N]]: Api[N][K] extends AnyFn ? K : never
}[keyof Api[N]] &
  string

export type ArgOf<N extends ApiNamespace, M extends MethodOf<N>> = Api[N][M] extends (arg: infer A) => Promise<unknown>
  ? A
  : Api[N][M] extends () => Promise<unknown>
    ? void
    : never

export type ResultOf<N extends ApiNamespace, M extends MethodOf<N>> = Api[N][M] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never

export function call<N extends ApiNamespace, M extends MethodOf<N>>(
  ns: N,
  method: M,
  arg?: ArgOf<N, M>
): Promise<ResultOf<N, M>> {
  const fn = (api[ns] as unknown as Record<string, AnyFn>)[method]
  return fn(arg)
}
