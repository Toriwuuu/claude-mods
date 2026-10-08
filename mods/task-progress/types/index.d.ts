/** One step of the task list Claude reports. */
export type Step = { title: string; status: 'done' | 'active' | 'todo' }

declare module 'claude-code' {
  interface PluginState {
    'task-progress': {
      /** The main conversation's current list; empty when there is none. */
      steps: Step[]
    }
  }
}
