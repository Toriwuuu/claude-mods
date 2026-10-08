import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'
import { describe, normalize, summarize } from './format'

const TOOL = 'mcp__task-progress__progress'

// Kept in $.state so a reload of the mod can put the sidebar back as it was.
const steps = atom({ plugin: 'task-progress', key: 'steps' } as const, [] as Step[])

const RULES = `# Task progress
The person follows your work in their cmux sidebar. For work of 3 or more steps, call ${TOOL} with the whole step list: once before you start, then again each time a step finishes or the plan changes. Use 2 to 8 steps, each title at most 6 words in the person's language, exactly one step "active" while you work, and every step "done" when you finish. Skip it for quick answers and questions.`

// Set at session.start when Claude Code runs inside a cmux terminal; outside cmux
// the mod registers nothing and adds nothing to the prompt.
let cmux: { bin: string; workspace: string } | undefined

/** Writes the list into the cmux workspace: the full list as its description, the summary as its progress. */
async function push($: EngineInterface, list: readonly Step[]) {
  if (!cmux) return
  const { bin, workspace } = cmux
  const run = (args: string[]) =>
    $.process.run([bin, ...args, '--workspace', workspace], { timeoutMs: 5_000 }).catch(() => undefined)

  if (list.length === 0) {
    await Promise.all([run(['clear-progress']), run(['workspace-action', '--action', 'clear-description'])])
    return
  }
  const { value, label } = summarize(list)
  await Promise.all([
    run(['set-progress', value.toFixed(3), '--label', label]),
    run(['workspace-action', '--action', 'set-description', '--description', describe(list)]),
  ])
}

async function setSteps($: EngineInterface, list: Step[]) {
  await update($, steps, () => list)
  await push($, list)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const workspace = await $.env.get('CMUX_WORKSPACE_ID')
    if (!workspace) return result
    cmux = { bin: (await $.env.get('CMUX_BUNDLED_CLI_PATH')) ?? 'cmux', workspace }
    await $.tool.register({
      name: 'progress',
      description:
        'Shows your step list for the current task in the person\'s cmux sidebar. Send the whole list every time; an empty list clears it.',
      inputSchema: {
        type: 'object',
        required: ['steps'],
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'status'],
              properties: {
                title: { type: 'string', description: 'At most 6 words, in the person\'s language' },
                status: { enum: ['done', 'active', 'todo'] },
              },
            },
          },
        },
      },
    })
    // After a reload, put back what the sidebar showed.
    const current = await read($, steps)
    if (current.length > 0) await push($, current)
    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!cmux) return result
    return { sections: [...result.sections, { id: 'task-progress:rules', text: RULES, scope: 'session' as const }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // A subagent's own plan would overwrite the main conversation's.
    if (e.agentId) return { result: '只有主對話的進度會顯示在側欄，這次沒有更新。' }
    const list = normalize((e as unknown as { steps?: unknown }).steps)
    if (typeof list === 'string') return { result: `沒有更新：${list}` }
    await setSteps($, list)
    return { result: list.length === 0 ? '側欄的任務清單已清除。' : `側欄已更新：${summarize(list).label}` }
  })

  // A finished list stays up until the person starts the next request.
  on('prompt.submit', async ($, e, next) => {
    const current = await read($, steps)
    if (current.length > 0 && summarize(current).isFinished) await setSteps($, [])
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear') await setSteps($, [])
    return result
  })

  // Leave nothing behind in the sidebar once the session is gone.
  on('session.end', async ($, e, next) => {
    await push($, [])
    return next(e)
  })
}
