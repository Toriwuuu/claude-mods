/** Whether this session's side panes were already opened. */
export type Launch = { launched: boolean }

declare module 'claude-code' {
  interface PluginState {
    'auto-panes': {
      /** Set once per session, so a reload of the mod doesn't open (or toggle) the panes again. */
      launched: Launch['launched']
    }
  }
}
