import type { Step } from '../types'

const MAX_STEPS = 12
const MAX_TITLE = 40

/** The glyph each status starts its line with; the cmux sidebar reads them back. */
export const GLYPH: Record<Step['status'], string> = { done: '✓', active: '▸', todo: '·' }

const STATUSES = new Set<string>(['done', 'active', 'todo'])

/** The model's input as a clean list, or why it can't be used. An empty list clears. */
export function normalize(raw: unknown): Step[] | string {
  if (!Array.isArray(raw)) return 'steps 必須是陣列'
  const steps: Step[] = []
  for (const item of raw.slice(0, MAX_STEPS)) {
    const title = typeof item?.title === 'string' ? item.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : ''
    const status = typeof item?.status === 'string' && STATUSES.has(item.status) ? (item.status as Step['status']) : null
    if (!title || !status) return '每一步都要有 title 和 status（done、active 或 todo）'
    steps.push({ title, status })
  }
  return steps
}

/** The list as the sidebar shows it: one line per step, its glyph first. */
export const describe = (steps: readonly Step[]): string =>
  steps.map(step => `${GLYPH[step.status]} ${step.title}`).join('\n')

export type Summary = { value: number; label: string; isFinished: boolean }

/** 2/5 · 寫測試 — what is done, and the step under way (or the next one). */
export function summarize(steps: readonly Step[]): Summary {
  const total = steps.length
  const done = steps.filter(step => step.status === 'done').length
  const current = steps.find(step => step.status === 'active') ?? steps.find(step => step.status === 'todo')
  const isFinished = total > 0 && done === total
  return {
    value: total === 0 ? 0 : done / total,
    label: `${done}/${total} · ${isFinished ? '完成' : current?.title ?? ''}`,
    isFinished,
  }
}
