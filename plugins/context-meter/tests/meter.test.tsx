import { expect, test } from 'claude-code/testing'

const HINT = {
  plugin: 'context-meter',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

test('the hint line shows the fill and opens the pane on press', async ($, on) => {
  let opened = ''
  on('command.register', () => ({ value: { command: 'context-meter' } }))
  on('session.usage', () => ({
    value: { startedAt: 0, rateLimits: [], context: { tokens: 84_000, window: 200_000, percent: 42 } },
  }))
  on('ui.open', (_, e) => {
    opened = e.id
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...HINT, surface } as never)
    const row = await ui.find({ type: 'Text', text: /42%/ })
    expect(row?.text).toBe('42%')
    expect(await ui.find({ type: 'Text', text: /for shortcuts/ })).toBeDefined()
    await ui.press({ key: 'open' })
    expect(opened).toBe('context-meter')
    await ui.unmount()
  }
})
