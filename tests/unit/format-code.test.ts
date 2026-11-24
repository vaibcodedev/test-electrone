import { describe, expect, it } from 'vitest'
import { canFormat, formatCode } from '@/lib/format-code'

describe('formatCode (Prettier standalone)', () => {
  it('formats JSON', async () => {
    expect(await formatCode('{"a":1,"b":[true,null]}', 'json')).toBe(
      '{ "a": 1, "b": [true, null] }\n'
    )
  })

  it('formats TypeScript in the project style: single quotes, no semicolons', async () => {
    const out = await formatCode(
      'const a: string = "x";\nfunction f(n:number){return n*2;}',
      'typescript'
    )
    expect(out).toBe("const a: string = 'x'\nfunction f(n: number) {\n  return n * 2\n}\n")
  })

  it('formats TSX', async () => {
    const out = await formatCode('export const A = () => <div className="a">{1+1}</div>;', 'tsx')
    expect(out).toBe('export const A = () => <div className="a">{1 + 1}</div>\n')
  })

  it('respects printWidth', async () => {
    const code = "const list = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']"
    const wide = await formatCode(code, 'javascript', 100)
    const narrow = await formatCode(code, 'javascript', 40)
    expect(wide).toBe(code + '\n')
    expect(narrow.split('\n').length).toBeGreaterThan(3)
    expect(narrow.split('\n').every((l) => l.length <= 40)).toBe(true)
  })

  it('formats CSS, GraphQL and markdown', async () => {
    expect(await formatCode('a{color:red}', 'css')).toBe('a {\n  color: red;\n}\n')
    expect(await formatCode('query{a{b}}', 'graphql')).toBe('query {\n  a {\n    b\n  }\n}\n')
    expect(await formatCode('*  one\n*  two', 'markdown')).toBe('- one\n- two\n')
  })

  it('throws on a parse error and on unsupported languages', async () => {
    await expect(formatCode('const = ;', 'typescript')).rejects.toThrow()
    await expect(formatCode('echo hi', 'bash')).rejects.toThrow('Форматування недоступне')
    expect(canFormat('bash')).toBe(false)
    expect(canFormat('sql')).toBe(false)
    expect(canFormat('tsx')).toBe(true)
  })
})
