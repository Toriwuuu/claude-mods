/** What the line under the prompt is computed from. */
export type Glance = {
  /** When the main conversation last sent a request, in $.clock.now() ms; 0 while unknown. */
  lastRequestAt: number
  /** Tokens the prompt cache holds for the main conversation. */
  ctx: number
  /** The model that answered last, for its cache-write price. */
  model: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'cache-glance': {
      lastRequestAt: Glance['lastRequestAt']
      ctx: Glance['ctx']
      model: Glance['model']
    }
  }
}
