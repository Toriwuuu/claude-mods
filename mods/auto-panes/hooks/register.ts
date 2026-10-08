import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// The side panes to open at the start of every session, in the order their tabs
// should read: the built-in diff panel, then filetree. Source control stays a
// click on its ◨ button: its `/git` opens the panel holding the keyboard, so
// what the person typed first would land in its commit field.
export const PANES = ['diff', 'filetree'] as const

// Long enough for the other mods to finish their own session start first.
export const START_DELAY_MS = 1_500

const launched = atom({ plugin: 'auto-panes', key: 'launched' } as const, false)

// `/diff` toggles: once the diff panel is up, running it again would close it.
let isDiffOpen = false

const isDiffPane = (id: string, title: string | undefined) => /diff/i.test(id) || /diff/i.test(title ?? '')

async function launch($: EngineInterface) {
  for (const command of PANES) {
    if (command === 'diff' && isDiffOpen) continue
    await $.command.run({ command }).catch(() => undefined)
  }
}

export const register: Register = on => {
  on('ui.open', async ($, e, next) => {
    if (isDiffPane(e.id, e.title)) isDiffOpen = true
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Once per session: a reload of the mod would otherwise toggle the diff panel shut.
    if (await read($, launched)) return result
    await update($, launched, () => true)
    $.clock.after(START_DELAY_MS, () => void launch($))
    return result
  })
}
