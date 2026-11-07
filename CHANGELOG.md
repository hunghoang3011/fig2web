# Changelog

## 0.1.0 (2026-11-07)

Initial release.

- Parser for the reverse-engineered .fig container (ZIP { canvas.fig, meta.json, images/<sha1> })
  and fig-kiwi wire format (self-describing Kiwi schema, chunked compression).
- `fig2web` CLI: rebuild all screens as static HTML/CSS (`fig2web design.fig`),
  structural reports (`--inspect`), JSON summary (`--json`).
- `fig2web-mcp` stdio MCP server with `convert_fig_to_html` and `inspect_fig` tools.
- Node >= 18 (native zstd when available, fzstd fallback).
- Formats documented in README (nodeChanges wire fields, path-blob opcode layout).
- Tests: unit + synthetic-roundtrip + MCP stdio integration; optional real-file smoke (`npm run smoke`).
