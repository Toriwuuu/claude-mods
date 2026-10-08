import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SHORT_TTL_MS, formatDuration, lineText, readCache, rewriteUsd } from '../hooks/format'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MINUTE = 60_000
const OPUS = 'claude-opus-5-5'
// The session /cache-tax priced at $3.91 for a cold write.
const CTX = 390_992

const line = (lastRequestAt: number, ctx = CTX, model = OPUS) => {
  const reading = readCache({ lastRequestAt, ctx, model }, NOW)
  return reading && lineText(reading)
}

describe('the line', () => {
  test('warm: time left and the price of letting it go cold', () => {
    expect(line(NOW - 13 * MINUTE)).toBe('快取 warm · 47m 後過期 · 過期重寫約 $3.91')
  })

  test('cold: how long ago it went cold and the price of the next send', () => {
    expect(line(NOW - 72 * MINUTE)).toBe('快取 cold · 已過期 12m · 下次送出重寫約 $3.91')
  })

  test('no clock yet, and nothing at all before the first message', () => {
    expect(line(0)).toBe('快取 · 下次回覆後開始計時')
    expect(line(0, 0)).toBeUndefined()
  })

  test('an unknown model drops the price, a five-minute cache prices lower', () => {
    expect(line(NOW, CTX, 'mystery')).toBe('快取 warm · 1h 0m 後過期')
    expect(rewriteUsd(OPUS, 1_000_000, SHORT_TTL_MS)).toBe(6.25)
    expect(formatDuration(30_000)).toBe('<1m')
  })
})

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

/** The engine beneath: an Opus session resumed 13 minutes after its last reply. */
const engine = (on: On) => {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, {})
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('settings.read', () => ({ value: {} }))
  on('session.model', () => ({ value: OPUS }))
  on('session.usage', () => ({
    value: { startedAt: NOW - 2 * 60 * MINUTE, context: { window: 1_000_000, tokens: CTX }, rateLimits: [] },
  }))
  on('ui.status', () => ({ value: undefined }))
  // The engine's own band, drawn beneath the mod's line.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: { key: 'engine' } }))
  return clock
}

test('above the prompt: counts down from the last reply, then turns cold in the warning color', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 13 * 60, context_tokens: CTX, model: OPUS })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-glance', surface, ...BAND })
    expect((await ui.find({ key: 'cache-glance' }))?.text).toBe('快取 warm · 47m 後過期 · 過期重寫約 $3.91')
    expect((await ui.find({ type: 'Text', text: 'warm' }))?.props.color).toBe('success')
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    await ui.unmount()
  }

  await clock.advance(60 * MINUTE)
  const ui = await $.ui.mount({ plugin: 'cache-glance', surface: 'terminal', ...BAND })
  expect((await ui.find({ key: 'cache-glance' }))?.text).toBe('快取 cold · 已過期 13m · 下次送出重寫約 $3.91')
  expect((await ui.find({ type: 'Text', text: 'cold' }))?.props.color).toBe('warning')
  await ui.unmount()
})

test('the line steps aside for a survey', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'cache-glance',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await ui.find({ key: 'cache-glance' })).toBeUndefined()
  await ui.unmount()
})
