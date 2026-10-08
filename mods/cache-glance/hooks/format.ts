import type { Glance } from '../types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The prompt cache's lifetime after the last request: one hour on a subscription. */
export const DEFAULT_TTL_MS = HOUR
export const SHORT_TTL_MS = 5 * MINUTE

// $ per million tokens for a one-hour cache write, list prices September 2026.
// From cache-tax by Karan Bansal (MIT), so both mods quote the same figure.
// Longer family names first: a model id matches the first row it contains.
const WRITE_PRICES: Array<[string, number]> = [
  ['fable-5-1', 20],
  ['fable-5', 20],
  ['opus-5', 10],
  ['opus-4', 10],
  ['sonnet-5', 4],
  ['sonnet', 6],
  ['haiku', 2],
]

// A five-minute write costs 1.25x the base input rate, a one-hour write 2x.
const SHORT_WRITE_SHARE = 1.25 / 2

/** What re-writing `tokens` into the cache costs on `model`, or null for a model not in the table. */
export const rewriteUsd = (model: string | null, tokens: number, ttlMs = DEFAULT_TTL_MS): number | null => {
  const id = (model ?? '').toLowerCase().replace(/[\s.]+/g, '-')
  const row = WRITE_PRICES.find(([family]) => id.includes(family))
  if (!row) return null
  const perMillion = ttlMs <= SHORT_TTL_MS ? row[1] * SHORT_WRITE_SHARE : row[1]
  return (tokens * perMillion) / 1e6
}

/** 47m, 1h 5m, <1m */
export const formatDuration = (ms: number): string => {
  if (ms < MINUTE) return '<1m'
  const hours = Math.floor(ms / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export type CacheState = 'warm' | 'cold' | 'unknown'

/** The line's two parts, drawn in their own colors; undefined before there is a conversation to cache. */
export type Reading = { state: CacheState; detail: string }

export const readCache = (g: Glance, now: number, ttlMs = DEFAULT_TTL_MS): Reading | undefined => {
  if (g.ctx <= 0) return undefined
  if (g.lastRequestAt <= 0) return { state: 'unknown', detail: '下次回覆後開始計時' }

  const usd = rewriteUsd(g.model, g.ctx, ttlMs)
  const left = g.lastRequestAt + ttlMs - now
  if (left > 0) {
    const cost = usd === null ? '' : ` · 過期重寫約 $${usd.toFixed(2)}`
    return { state: 'warm', detail: `${formatDuration(left)} 後過期${cost}` }
  }
  const cost = usd === null ? '' : ` · 下次送出重寫約 $${usd.toFixed(2)}`
  return { state: 'cold', detail: `已過期 ${formatDuration(-left)}${cost}` }
}

/** The whole line as plain text: 快取 warm · 47m 後過期 · 過期重寫約 $3.91 */
export const lineText = (r: Reading): string =>
  r.state === 'unknown' ? `快取 · ${r.detail}` : `快取 ${r.state} · ${r.detail}`
