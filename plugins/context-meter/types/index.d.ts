export type Fill = { percent: number; tokens: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { fill: Shaped<Fill | null> }
  }
}
