---
name: fig2web
description: >
  Rebuild Figma .fig files as static HTML/CSS and inspect their contents —
  fully offline, no Figma account, no Dev Mode, no paid MCP service.
  Use whenever a user shares a .fig file and asks to view, rebuild, or
  extract screens, text, palette, or assets from it.
---

# fig2web — read .fig files without Figma

You are looking at a Figma `.fig` file the user cannot (or prefers not to)
open in Figma. `fig2web` reads the file offline and produces either a static
HTML rebuild of every screen or a structural JSON report.

## Quick start

```bash
# Rebuild all screens as HTML (gallery + screens/ + assets/)
npx fig2web "Design.fig"

# Custom output dir
npx fig2web "Design.fig" -o ./out

# Structural report instead of HTML (tree/texts/palette/variables/components)
npx fig2web "Design.fig" --inspect
```

Default output: `<name>-html/` containing:

- `index.html` — gallery with scaled thumbnails of every screen
- `screens/*.html` — one absolutely-positioned HTML/CSS page per screen
- `assets/` — image fills extracted from the file (png/jpg/webp)
- `styles.css` — shared screen chrome

Then OPEN `index.html` (or any screen) in a browser for the user, and/or
reference `screens/*.html` when implementing the design in code.

## MCP

`fig2web-mcp` is a stdio MCP server exposing two tools:

- `convert_fig_to_html { fig_path, out_dir? }`
- `inspect_fig { fig_path }`

Register it for Claude Desktop / Claude Code (after `npm i -g fig2web`):

```json
{
  "mcpServers": {
    "fig2web": { "command": "fig2web-mcp" }
  }
}
```

Or with npx without installing: `npx -y -p fig2web fig2web-mcp`.

Register for Claude Code:

```bash
claude mcp add fig2web -- fig2web-mcp
```

## interpreting output

- Every screen is a `position:relative` div sized like the Figma frame;
  children are absolutely positioned with the node transforms baked in.
- Vectors are inline SVGs parsed from `fillGeometry` command blobs
  (cmds 0=Z 1=M 2=L 3=Q 4=C, little-endian f32 coordinates).
- Image fills are extracted by content sha1 into `assets/`.
- Hidden pages are included: they hold flows and master components.

## Limitations (be transparent with the user)

- Static output only — no interactions, prototyping, auto-layout reflow.
- Masks are approximated (radius donation); boolean compositing is visual
  approximation.
- Fonts are linked from Google Fonts when identified; proprietary fonts
  (e.g. SF Pro) fall back to system-ui.
- Output is a faithful but not pixel-perfect reconstruction.
