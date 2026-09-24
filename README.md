# Optical Margin

[![npm](https://img.shields.io/npm/v/%40overpunch%2Fopticalmargin.svg)](https://www.npmjs.com/package/@overpunch/opticalmargin) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![part of liiift type-tools](https://img.shields.io/badge/liiift-type--tools-blueviolet)](https://github.com/over-punch/type-tools)

**Hanging punctuation** nudges marks smaller than a letter — opening quotes, commas, dashes, periods — slightly past the edge of a text block, so the *letters*, not the punctuation, hold a clean optical margin. It's what fine book typesetting does to make a column edge look straight.

CSS `hanging-punctuation` is Safari-only, uses hard-coded character tables, and gives no control over hang amount, threshold, or which characters hang. Optical Margin measures each punctuation character's actual hang amount from Canvas font metrics — not a lookup table — and applies it as a negative margin. Works in every browser, with every font.

![Two paragraphs of the same quotation. In the top panel the opening quote sits flush, indenting the first letter inside the margin guide. In the bottom panel the opening quote hangs left past the guide so the letter T aligns to the margin, and line-end dashes extend to a clean right edge.](https://raw.githubusercontent.com/over-punch/OpticalMargin/main/assets/hero-before-after.png?v=1)

**[opticalmargin.com](https://opticalmargin.com)** · [npm](https://www.npmjs.com/package/@overpunch/opticalmargin) · [GitHub](https://github.com/over-punch/OpticalMargin)

TypeScript · Zero dependencies · Canvas measurement · Cross-browser · React + Vanilla JS

---

## Install

```bash
npm install @overpunch/opticalmargin
```

---

## Usage

> **Next.js App Router:** this library uses browser APIs. Add `"use client"` to any component file that imports from it.

### React component

```tsx
import { OpticalMarginText } from '@overpunch/opticalmargin'

<OpticalMarginText>
  "Typography is the craft of endowing human language with a durable visual form."
</OpticalMarginText>
```

Both `hangStart` and `hangEnd` default to `true`, so no props are required for standard use.

### React hook

```tsx
import { useOpticalMargin } from '@overpunch/opticalmargin'

// The options object is required; pass {} for defaults.
function Quote({ children }: { children: React.ReactNode }) {
  const ref = useOpticalMargin({})
  return <blockquote ref={ref}>{children}</blockquote>
}
```

The hook re-runs automatically on resize via `ResizeObserver` (width changes only — vertical-only resizes are skipped) and after fonts load via `document.fonts.ready`.

Inline markup is preserved — italics, bold, and links survive the per-line wrapping:

```tsx
<OpticalMarginText as="blockquote">
  “Typography is the craft of endowing <em>human language</em> with a
  durable <strong>visual form</strong>.”
</OpticalMarginText>
```

### Vanilla JS

```ts
import { applyOpticalMargin, removeOpticalMargin, getCleanHTML } from '@overpunch/opticalmargin'

const el = document.querySelector('blockquote')
const original = getCleanHTML(el)
const opts = { hangStart: true, hangEnd: true }

function run() {
  applyOpticalMargin(el, original, opts)
}

run()
document.fonts.ready.then(run)

const ro = new ResizeObserver(() => run())
ro.observe(el)

// Later — disconnect and restore original markup:
// ro.disconnect()
// removeOpticalMargin(el, original)
```

### TypeScript

```ts
import type { OpticalMarginOptions } from '@overpunch/opticalmargin'

const opts: OpticalMarginOptions = { threshold: 1, maxHangRatio: 0.8 }
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `hangStart` | `true` | Hang opening punctuation at line starts |
| `hangEnd` | `true` | Hang closing punctuation and sentence-end marks at line ends |
| `threshold` | `0.5` | Minimum effective hang amount in px before applying (compared after `hangFractions` multiplication). Prevents near-zero corrections on characters that barely protrude |
| `maxHangRatio` | `0.9` | Max proportion of the character's advance width to hang (0–1). Clamped to [0,1]. Caps extreme hangs on very wide punctuation |
| `hangFractions` | see below | Per-character hang fraction overrides. Keys are single characters; values are fractions (0–1) of the measured hang to apply (0 = no hang, 1 = full hang). You can pass a sparse object — unspecified characters fall back to built-in defaults. Default fractions: hyphens/dashes (`-` `–` `—`) `1.0`; quotes (`"` `'` `«` `»`) and `.` `!` `?` `…` `)` `]` `0.8`; opening parens/brackets (`(` `[`) and `,` `;` `:` `0.6` |

**`OpticalMarginText` component only:**

| Prop | Default | Description |
|------|---------|-------------|
| `as` | `'p'` | HTML element to render, e.g. `'blockquote'`, `'h1'` |

`OpticalMarginText` also forwards all standard HTML attributes (`aria-label`, `id`, `role`, `className`, `style`, etc.) to the root element.

---

## How it works

Canvas `measureText` returns both `width` (advance width) and `actualBoundingBoxLeft` / `actualBoundingBoxRight` (visual bounds). The difference between advance width and visual bounds is the optical overhang — how far a character's ink sits inside its typographic cell. That value, clamped by `maxHangRatio` and `threshold`, is applied as `margin-inline-start` (start hang) or `margin-inline-end` (end hang) on each line span. Using logical properties means the direction is correct in both LTR and RTL contexts. The algorithm re-runs on resize and after fonts finish loading (`document.fonts.ready`).

**Start character set:** `"` `'` `"` `'` `«` `(` `[`

**End character set:** `.` `,` `;` `:` `!` `?` `"` `'` `"` `'` `»` `-` `–` `—` `…` `)` `]`

Falls back to zero hang (no margin applied) in environments without Canvas support (e.g. SSR).

**Line break safety:** Line breaks are locked to the browser's natural layout. Word breaks never change — the negative margins only affect the optical edge position, not line content or width.

**Browser support:** Works in every modern browser. The hang amounts come from Canvas `TextMetrics.actualBoundingBoxLeft` / `actualBoundingBoxRight`, supported in Chrome/Edge 77+, Safari 11.1+, and Firefox 74+. If those metrics are unavailable (very old engines, or SSR with no Canvas), the measured hang is `0` and text renders flush — the same as not applying the effect. There is no layout breakage on unsupported platforms, so it is safe to ship unconditionally.

---

## Accessibility

Optical Margin is a presentation-only transform — the injected markup is hidden from assistive technology and never alters the readable text:

- Injected word and line wrappers carry `role="presentation"`, so screen readers traverse the text as a single uninterrupted flow.
- Injected line-break elements (`<br data-om>`) are `aria-hidden="true"`.
- On `OpticalMarginText`, `aria-label` and all other HTML attributes pass through to the root element unchanged.

**Copy/paste caveat:** because the effect rebuilds the visual lines with real `<br>` elements, text copied from a processed element includes hard line breaks matching the on-screen wrap, rather than reflowing as one paragraph. If a verbatim, unbroken copy is important (e.g. quotable legal text), call `removeOpticalMargin(el, original)` before exposing the text for copy, or keep an off-screen flush copy as the canonical source.

---

## API reference

### `getCleanHTML(el: HTMLElement): string`

Returns the element's innerHTML with all optical-margin injected markup (`om-word` spans, `om-line` spans, `<br data-om>` separators) stripped. Safe to call multiple times — idempotent.

Use this to capture the **original HTML snapshot** before the first `applyOpticalMargin` call. The snapshot must be passed as the second argument to both `applyOpticalMargin` and `removeOpticalMargin` every time they are called.

```ts
const original = getCleanHTML(el)  // capture once, before any apply

function run() {
  applyOpticalMargin(el, original, opts)
}

// Later:
removeOpticalMargin(el, original)  // same snapshot
```

**Important:** Always capture the snapshot from the element's initial state (or via `getCleanHTML` on an already-applied element). Never pass `el.innerHTML` directly after `applyOpticalMargin` has run — the snapshot will include injected markup and the algorithm will double-wrap on the next call.

---

## Dev notes

### `next` in root devDependencies

`package.json` at the repo root lists `next` as a devDependency. This is a **Vercel detection workaround** — not a real dependency of the npm package. Vercel's build system inspects the root `package.json` to detect the framework; without `next` present it falls back to a static build and skips the Next.js pipeline, breaking the `/site` subdirectory deploy.

The package itself has zero runtime dependencies. Do not remove this entry.

---

## Future improvements

- **Hanging numerals** — detect and hang numerals (`1`, `7`) that protrude into the margin at display sizes
- **Configurable character set** — expose a `hangChars` option to override which characters are considered candidates, beyond the built-in punctuation list
- **Per-side max hang** — separate `maxHangStart` / `maxHangEnd` ratios for asymmetric control
- **RTL auto-detection** — automatically swap start/end hang sides based on the element's computed `direction` style
- **Intersection Observer** — skip measurement for off-screen elements and re-run when they enter the viewport

---

See [CHANGELOG](https://github.com/over-punch/OpticalMargin/releases) for version history.
