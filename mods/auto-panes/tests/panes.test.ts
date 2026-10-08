import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { START_DELAY_MS } from '../hooks/register'

// The commands each test saw run, in order.
let ran: string[] = []

// Stands in for a diff panel that is already up when the session starts.
const DIFF_ALREADY_OPEN = {
  name: 'fake-diff',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      const result = await next(e)
      await $.ui.open({ id: 'diff', title: 'Diff' })
      return result
    })
  },
}

const engine = (on: On) => {
  ran = []
  const clock = mock.clock(on, { now: 0 })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.run', (_$, e) => {
    ran.push(e.command)
    return { text: '' }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  return clock
}

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

test('opens the diff panel, then filetree, once the session has started', async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  expect(ran).toEqual([])

  await clock.advance(START_DELAY_MS)
  expect(ran).toEqual(['diff', 'filetree'])
})

test('a reload in the same session opens nothing again', async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  await clock.advance(START_DELAY_MS)
  ran = []

  await $.session.start(START)
  await clock.advance(START_DELAY_MS)
  expect(ran).toEqual([])
})

test('a diff panel already up is left alone', { plugins: [DIFF_ALREADY_OPEN] }, async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  await clock.advance(START_DELAY_MS)
  expect(ran).toEqual(['filetree'])
})
