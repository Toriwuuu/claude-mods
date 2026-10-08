import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { describe as describeSteps, normalize, summarize } from '../hooks/format'

const TOOL = 'mcp__task-progress__progress'
const STEPS = [
  { title: '讀現有程式', status: 'done' },
  { title: '改 format.ts', status: 'done' },
  { title: '寫測試', status: 'active' },
  { title: '跑驗證', status: 'todo' },
  { title: '更新文件', status: 'todo' },
] as const

describe('format', () => {
  test('the sidebar lines carry a glyph per status', () => {
    expect(describeSteps([...STEPS])).toBe('✓ 讀現有程式\n✓ 改 format.ts\n▸ 寫測試\n· 跑驗證\n· 更新文件')
  })

  test('the summary counts done steps and names the one under way', () => {
    expect(summarize([...STEPS])).toEqual({ value: 0.4, label: '2/5 · 寫測試', isFinished: false })
    expect(summarize(STEPS.map(s => ({ ...s, status: 'done' as const }))).label).toBe('5/5 · 完成')
  })

  test('bad input is refused with a reason the model can act on', () => {
    expect(normalize('nope')).toBe('steps 必須是陣列')
    expect(typeof normalize([{ title: '', status: 'done' }])).toBe('string')
    expect(normalize([])).toEqual([])
  })
})

/** The engine beneath: cmux's CLI and workspace in the environment, every process run recorded. */
const engine = (on: On, env: Record<string, string>) => {
  const runs: string[][] = []
  const registered: string[] = []
  mock.env(on, env)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', (_$, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('process.run', (_$, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.compose', () => ({ sections: [] }))
  return { runs, registered }
}

const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'] as const, tools: [], outputStyle: null, traits: [], sections: [] }

const CMUX = { CMUX_WORKSPACE_ID: 'ws-1', CMUX_BUNDLED_CLI_PATH: '/cmux' }

test('in cmux: a reported list lands in the workspace as description and progress', async ($, on) => {
  const { runs, registered } = engine(on, CMUX)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['progress'])

  runs.length = 0
  const answer = await $.tool.call({ tool: TOOL, steps: [...STEPS] } as never)
  expect(JSON.stringify(answer)).toContain('2/5 · 寫測試')
  expect(runs).toContainEqual(['/cmux', 'set-progress', '0.400', '--label', '2/5 · 寫測試', '--workspace', 'ws-1'])
  expect(runs).toContainEqual([
    '/cmux', 'workspace-action', '--action', 'set-description',
    '--description', '✓ 讀現有程式\n✓ 改 format.ts\n▸ 寫測試\n· 跑驗證\n· 更新文件',
    '--workspace', 'ws-1',
  ])

  const composed = await $.prompt.compose(COMPOSE)
  expect(JSON.stringify(composed)).toContain(TOOL)
})

test('outside cmux: no tool, no prompt rule, no process', async ($, on) => {
  const { runs, registered } = engine(on, {})
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual([])
  const composed = await $.prompt.compose(COMPOSE)
  expect(JSON.stringify(composed)).not.toContain(TOOL)
  expect(runs).toEqual([])
})
