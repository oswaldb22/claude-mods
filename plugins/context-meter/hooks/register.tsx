import { atom, read, update } from 'claude-code'
import type { ContextGridSquare, EngineInterface, Register } from 'claude-code'

import type { Fill } from '../types'

const PANE = 'context-meter'
const TITLE = 'Context'

// Change the tag when Fill's fields change: it declines what an earlier
// version stored, which outlives a reload.
const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, null, {
  shape: 'fill-1',
})

const kTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`

const levelColor = (percent: number) =>
  percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'

const bar = (percent: number, width: number) => {
  const filled = Math.round((Math.min(percent, 100) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const square = (s: ContextGridSquare) =>
  s.categoryName === 'Free space' ? '⛶' : s.squareFullness >= 0.7 ? '⛁' : '⛀'

const shortPath = (path: string) => path.replace(/^\/Users\/[^/]+/, '~')

// The plain usage call is free: the status line's own figures.
async function refresh($: EngineInterface) {
  try {
    const { context } = await $.session.usage()
    if (context.percent === undefined || context.tokens === undefined) {
      return
    }
    const next: Fill = {
      percent: context.percent,
      tokens: context.tokens,
      window: context.window,
    }
    await update($, fill, () => next)
  } catch {
    // No session bound yet; the next turn tries again.
  }
}

const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-meter',
      description: 'Show the context window breakdown in a pane',
    })
    const started = await next(e)
    await refresh($)

    return started
  })

  on('command.run', { command: 'context-meter' }, async $ => {
    await openPane($)

    return { text: 'Context breakdown opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    void refresh($)

    return compacted
  })

  // The hint line under the prompt: the meter as a button, then the engine's
  // own hint text, so `? for shortcuts` and `esc to interrupt` still show.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const current = await read($, fill)
    if (current === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const color = levelColor(current.percent)

    return (
      <Box>
        <Button key="open" plain onPress={() => openPane($)}>
          <Text color={color}>{bar(current.percent, 10)}</Text>{' '}
          <Text color={color} bold>
            {current.percent}%
          </Text>{' '}
          <Text dimColor>
            {kTokens(current.tokens)} / {kTokens(current.window)}
          </Text>
        </Button>
        {e.props.hint && <Text dimColor> · {e.props.hint}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    // Read so a refresh redraws the pane.
    await read($, fill)

    let usage
    try {
      usage = await $.session.usage({
        breakdown: 'summary',
        columns: e.props.bodyColumns,
      })
    } catch {
      return <Text dimColor>No context figures yet: send a prompt first.</Text>
    }
    const b = usage.context.breakdown
    if (!b) {
      return <Text dimColor>No breakdown available for this session.</Text>
    }

    const shown = b.categories.filter(c => c.kind !== 'deferred' && c.tokens > 0)
    const deferred = b.categories.filter(c => c.kind === 'deferred')
    const pct = (n: number) => `${((n / b.rawMaxTokens) * 100).toFixed(1)}%`

    const servers = new Map<string, { tokens: number; count: number }>()
    for (const tool of b.mcpTools) {
      if (!tool.isLoaded) continue
      const one = servers.get(tool.serverName) ?? { tokens: 0, count: 0 }
      servers.set(tool.serverName, {
        tokens: one.tokens + tool.tokens,
        count: one.count + 1,
      })
    }
    const topServers = [...servers.entries()].sort((a, c) => c[1].tokens - a[1].tokens).slice(0, 8)
    const topSkills = [...(b.skills?.skillFrontmatter ?? [])]
      .sort((a, c) => c.tokens - a.tokens)
      .slice(0, 8)
    const topAgents = [...b.agents].sort((a, c) => c.tokens - a.tokens).slice(0, 5)

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{b.model}</Text>
          <Text dimColor> · </Text>
          <Text color={levelColor(b.percentage)} bold>
            {kTokens(b.totalTokens)} / {kTokens(b.rawMaxTokens)} ({b.percentage}%)
          </Text>
        </Text>
        <Text dimColor>
          {b.isAutoCompactEnabled && b.autoCompactThreshold !== undefined
            ? `Auto-compact at ${kTokens(b.autoCompactThreshold)} (${b.autocompactSource})`
            : 'Auto-compact off'}
          {usage.cost ? ` · session cost $${usage.cost.usd.toFixed(2)}` : ''}
        </Text>
        <Text> </Text>

        {b.gridRows.map(row => (
          <Text>
            {row.map(s => (
              <Text color={s.color}>{square(s)} </Text>
            ))}
          </Text>
        ))}
        <Text> </Text>

        <Text bold>By category</Text>
        {shown.map(c => (
          <Text>
            <Text color={c.color}>⛁ </Text>
            {c.name}: <Text bold>{kTokens(c.tokens)}</Text>{' '}
            <Text dimColor>({pct(c.tokens)})</Text>
          </Text>
        ))}
        {deferred.map(c => (
          <Text dimColor>
            ⛶ {c.name}: {kTokens(c.tokens)} (loaded on demand, not counted)
          </Text>
        ))}

        {b.memoryFiles.length > 0 && <Text> </Text>}
        {b.memoryFiles.length > 0 && <Text bold>Memory files</Text>}
        {b.memoryFiles.map(f => (
          <Text wrap="truncate-start">
            <Text dimColor>{f.type} </Text>
            {shortPath(f.path)}: <Text bold>{kTokens(f.tokens)}</Text>
          </Text>
        ))}

        {topServers.length > 0 && <Text> </Text>}
        {topServers.length > 0 && <Text bold>MCP tools loaded, by server</Text>}
        {topServers.map(([name, s]) => (
          <Text>
            {name}: <Text bold>{kTokens(s.tokens)}</Text>{' '}
            <Text dimColor>({s.count} tools)</Text>
          </Text>
        ))}

        {b.skills && <Text> </Text>}
        {b.skills && (
          <Text bold>
            Skills: {kTokens(b.skills.tokens)}{' '}
            <Text dimColor>
              ({b.skills.includedSkills} of {b.skills.totalSkills} listed)
            </Text>
          </Text>
        )}
        {topSkills.map(s => (
          <Text>
            {s.name}: {kTokens(s.tokens)}
          </Text>
        ))}

        {topAgents.length > 0 && <Text> </Text>}
        {topAgents.length > 0 && <Text bold>Custom agents</Text>}
        {topAgents.map(a => (
          <Text>
            {a.agentType}: {kTokens(a.tokens)}
          </Text>
        ))}

        {b.slashCommands && <Text> </Text>}
        {b.slashCommands && (
          <Text bold>
            Slash commands: {kTokens(b.slashCommands.tokens)}{' '}
            <Text dimColor>
              ({b.slashCommands.includedCommands} of {b.slashCommands.totalCommands} listed)
            </Text>
          </Text>
        )}

        <Text> </Text>
        <Text dimColor>Estimated locally, as /context does. Esc closes.</Text>
      </Box>
    )
  })
}
