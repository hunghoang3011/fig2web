# fig2web

[![CI](https://github.com/hunghoang3011/fig2web/actions/workflows/ci.yml/badge.svg)](https://github.com/hunghoang3011/fig2web/actions)
[![npm](https://img.shields.io/npm/v/fig2web)](https://www.npmjs.com/package/fig2web)

**Read Figma files without Figma.** `fig2web` rebuilds every screen of a
`.fig` file as static HTML/CSS and inspects its contents — fully offline,
no Figma account, no Dev Mode, no paid MCP service.

Trade-off, up front: the output is a faithful **static** reconstruction
(layout, text, colors, gradients, vectors, images) — not pixel-perfect, and
not interactive.

## Why

Figma's Dev Mode MCP server requires a paid seat. The `.fig` format, however,
is a ZIP container carrying a self-describing
[Kiwi](https://github.com/evanw/kiwi) binary payload — readable offline once
you speak its language. fig2web speaks it.

The container/wire format notes below were reverse-engineered from real files
(420-screen baseline, 100% text extraction, adversarially verified).

## Install

**1. Install** — requires Node.js >= 18, nothing else:

```bash
npm i -g fig2web
```

**2. Convert a file:**

```bash
fig2web "My Design.fig"
```

**3. Open the result** — `open My\ Design-html/index.html` (macOS),
`xdg-open` (Linux), `start` (Windows):

You get a gallery of every screen plus `screens/*.html` and extracted
`assets/`. No Figma account required.

> No global install? `npx -y fig2web "My Design.fig"` works too.

## CLI

    fig2web design.fig                   # -> design-html/ (gallery + screens + assets)
    fig2web design.fig -o out/           # custom dir
    fig2web design.fig --inspect         # analysis reports (tree/texts/palette/…)
    fig2web design.fig --json            # machine-readable summary on stdout

The HTML bundle:

    design-html/
      index.html        # gallery with scaled live thumbnails
      screens/*.html    # one page per screen, absolutely-positioned HTML/CSS
      assets/           # image fills extracted by sha1
      styles.css

## MCP

Ships a stdio MCP server. After `npm i -g fig2web`:

    claude mcp add fig2web -- fig2web-mcp

Claude Desktop `claude_desktop_config.json`:

```json
{ "mcpServers": { "fig2web": { "command": "fig2web-mcp" } } }
```

Tools: `convert_fig_to_html { fig_path, out_dir? }`, `inspect_fig { fig_path }`.

## API

    import { convertToHtml, inspectFig } from 'fig2web';

    const res = convertToHtml('design.fig', { outDir: 'out' });
    // { outDir, screens: 420, stats: {...}, screenList: [...] }

    const { summary } = inspectFig('design.fig');
    // pages, screens, texts, colors, fonts, variables (tokens!), components, assets

## How .fig files work (format notes)

A `.fig` file is a ZIP container:

    file.fig = ZIP {
      canvas.fig     # the payload
      meta.json      # { schemaVersion, exportedAt: ISO-8601, ... }
      thumbnail.png
      images/<sha1>  # image binaries; name = content sha1, no extension
    }

`canvas.fig` binary layout:

    "fig-kiwi" (8B magic; siblings: fig-jam. FigJam, fig-deck Slides, fig-makee Make)
    u32 LE version               # 106 observed
    chunks: [u32 len][payload]*  # payload sniffed: zstd magic 28 B5 2F FD, else raw-deflate
      chunk 0 = Kiwi binary schema, raw-deflate
      chunk 1 = message { nodeChanges[], blobs[] }

The message conforms to a **self-describing** Kiwi schema embedded as chunk 0 —
every file carries its own schema; decoded with kiwi-schema (Evan Wallace).

### nodeChanges essentials

- Flat array — the tree is rebuilt from `guid (sessionID:localID)` +
  `parentIndex`, ordered by ascending `position` (numeric string, stable sort).
- `phase`: CREATED/UPDATED last-wins; DELETED removes.
- Field names as observed on the wire: `guid`, `parentIndex`, `phase`, `type`,
  `name`, `visible`, `size {x,y}`, `transform` (2x3 matrix), `cornerRadius`,
  `rectangleTopLeftCornerRadius` (…Right/Bottom pairs), `opacity`, `mask`,
  `clipContent`, `blendMode`, `effects[]` (DROP_SHADOW → box-shadow),
  `fillPaints[]`/`strokePaints[]`, `textData.characters`,
  `fontSize`, `fontName {family,style}`, `lineHeight`, `letterSpacing`,
  `textAlignHorizontal`, `fillGeometry[]`/`strokeGeometry[]`
  (`commandsBlob` indexes `blobs[]`), `textData` vs `variableDataValues`
  (VARIABLE nodes → design tokens via `variableResolvedType`),
  `variableResolvedType`, `variableDataValues.entries[].variableData.value.colorValue`.

### paint → output mapping

- SOLID → css color; GRADIENT_* → css gradients (inverse-matrix angle)
- IMAGE paint: `p.image.hash` is 20 raw bytes → hex string = filename in images/
- Vectors: blobs = [u8 cmd][LE f32*], cmds 0=Z 1=M 2=L 3=Q 4=C → inline SVG
- DROP_SHADOW → box-shadow; mask nodes donate corner radius to next sibling

## Limitations

- Static only: no prototyping, interactions, or auto-layout reflow.
- Masks/booleans are visual approximations.
- Google-Fonts linkage when identified; proprietary fonts fall back to system.
- Faithful, not pixel-perfect.

## Related

- [kiwi-schema](https://www.npmjs.com/package/kiwi-schema) — kiwi format tools
- [fig2sketch](https://github.com/UpToFive/fig2sketch) — .fig → Sketch converter
- Figma's own `.fig` thumbnailer… (official docs are sparse; this README + source are the reference.)

## License

MIT
