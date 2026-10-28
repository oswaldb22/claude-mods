# claude-mods

Mods for Claude Code: small plugins that change its interface or behaviour.

## Mods

### context-meter

Shows how full the context window is, in the hint line under the prompt:
a coloured bar, the percentage and the tokens used out of the window. Green
below 50%, yellow from 50%, red from 80%. It refreshes after each tool call,
at the end of each turn and after a compaction.

Click the meter (or run `/context-meter`) to open a pane with the full
breakdown, as `/context` gives it: the grid, tokens per category, memory
files, MCP tools by server, the largest skills and agents, and the
auto-compact threshold. Esc closes the pane.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install context-meter --marketplace oswaldb22/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install context-meter --marketplace oswaldb22/claude-mods
```
