import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_TTL_MS, SHORT_TTL_MS, readCache } from './format'
import type { CacheState } from './format'

// Kept in $.state so a reload of the mod keeps the clock it was running.
const lastRequestAt = atom({ plugin: 'cache-glance', key: 'lastRequestAt' } as const, 0)
const ctx = atom({ plugin: 'cache-glance', key: 'ctx' } as const, 0)
const model = atom({ plugin: 'cache-glance', key: 'model' } as const, null as string | null)

const REFRESH_MS = 30_000

// Theme keys, so the line follows the person's Claude Code theme.
const STATE_COLOR: Record<CacheState, string | undefined> = {
  warm: 'success',
  cold: 'warning',
  unknown: undefined,
}

let ttlMs = DEFAULT_TTL_MS

/** The cache lives five minutes when the person set it so, an hour otherwise. */
async function readTtl($: EngineInterface): Promise<number> {
  const fromEnv = await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')
  const fromSettings = (await $.settings.read()).promptCacheTtl
  return (fromEnv ?? fromSettings) === '5m' ? SHORT_TTL_MS : DEFAULT_TTL_MS
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // An earlier version pinned its line under the prompt; that pin outlives a reload.
    $.ui.status(undefined)
    ttlMs = await readTtl($)
    if ((await read($, model)) === null) {
      const current = await $.session.model()
      await update($, model, () => current)
    }
    // Loaded into a running session: the window's size is known, its clock is not.
    if ((await read($, ctx)) === 0) {
      const tokens = (await $.session.usage()).context.tokens ?? 0
      await update($, ctx, () => tokens)
    }
    // The countdown moves with the clock, not with any value: redraw it on a timer.
    $.clock.every(REFRESH_MS, () => $.ui.invalidate('ui.render'))
    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear') {
      await update($, lastRequestAt, () => 0)
      await update($, ctx, () => 0)
    } else if (e.source === 'compact') {
      // The next request writes the compacted conversation afresh.
      await update($, lastRequestAt, () => 0)
    } else if (e.source === 'resume' || e.source === 'fork') {
      const now = await $.clock.now()
      const seconds = e.seconds_since_last_response
      const tokens = e.context_tokens
      const resumedModel = e.model
      if (seconds !== undefined) await update($, lastRequestAt, () => now - seconds * 1000)
      if (tokens !== undefined && tokens > 0) await update($, ctx, () => tokens)
      if (resumedModel) await update($, model, () => resumedModel)
    }
    return result
  })

  // Each request of the main conversation reads the cache and restarts its clock.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, lastRequestAt, () => now)
    }
    return yield* next(e)
  })

  // A fork of the main conversation (cache-tax's keepwarm ping is one) reads the
  // same cache; when it did read it, the clock starts over just as for a turn.
  on('model.fork', async ($, e, next) => {
    const result = await next(e)
    const answer = 'value' in result ? result.value : undefined
    if (answer?.isAnswered && answer.usage.cache_read_input_tokens > 0) {
      const now = await $.clock.now()
      await update($, lastRequestAt, () => now)
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const now = await $.clock.now()
    const usage = e.usage
    const live = (await $.session.usage()).context.tokens
    const summed = usage
      ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : 0
    const tokens = live && live > 0 ? live : summed
    if (tokens > 0) await update($, ctx, () => tokens)
    const answered = usage?.model
    if (answered) await update($, model, () => answered)
    // No step stamped this turn (a hook answered it): its end is the latest request.
    await update($, lastRequestAt, at => (now - at > e.durationMs ? now : at))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const glance = {
      lastRequestAt: await read($, lastRequestAt),
      ctx: await read($, ctx),
      model: await read($, model),
    }
    const reading = readCache(glance, await $.clock.now(), ttlMs)
    if (!reading) return rest

    const { Box, Text } = $.ui.resolve(e)
    const color = STATE_COLOR[reading.state]
    // Cold costs money on the next send, so its detail reads at full strength.
    const isQuiet = reading.state !== 'cold'

    return (
      <Box flexDirection="column">
        {rest}
        <Box key="cache-glance" flexDirection="row">
          <Text dimColor>快取 </Text>
          {color ? (
            <Text color={color} bold>
              {reading.state}
            </Text>
          ) : (
            <Text dimColor>·</Text>
          )}
          <Text dimColor={isQuiet}> · {reading.detail}</Text>
        </Box>
      </Box>
    )
  })
}
