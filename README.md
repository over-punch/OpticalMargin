# Optical Margin

[![npm](https://img.shields.io/npm/v/%40overpunch%2Fopticalmargin.svg)](https://www.npmjs.com/package/@overpunch/opticalmargin) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![part of liiift type-tools](https://img.shields.io/badge/liiift-type--tools-blueviolet)](https://github.com/over-punch/type-tools)

**Hanging punctuation** nudges marks smaller than a letter — opening quotes, commas, dashes, periods — slightly past the edge of a text block, so the *letters*, not the punctuation, hold a clean optical margin. It's what fine book typesetting does to make a column edge look straight.

CSS `hanging-punctuation` is Safari-only, uses hard-coded character tables, and gives no control over hang amount, threshold, or which characters hang. Optical Margin measures each punctuation character's actual width in the rendered font — not a lookup table — and hangs a set fraction of it into the margin with a negative margin. Works in every browser, with every font.

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
| `threshold` | `0.5` | Minimum hang in px before applying. Prevents near-zero corrections. A non-finite value falls back to the default, with a warning |
| `maxHangRatio` | `0.9` | Max proportion of the character's advance width to hang (0–1). Clamped to [0,1]. Caps every character's fraction |
| `hangFractions` | see below | Per-character hang fractions: the proportion of the character's advance width to hang (0 = no hang, 1 = the whole character outside the margin). Keys are single characters. You can pass a sparse object — unspecified characters fall back to built-in defaults. Default fractions: hyphens/dashes (`-` `–` `—`) `1.0`; quotes (`"` `'` `«` `»`) and `.` `!` `?` `…` `)` `]` `0.8`; opening parens/brackets (`(` `[`) and `,` `;` `:` `0.6` |

**`OpticalMarginText` component only:**

| Prop | Default | Description |
|------|---------|-------------|
| `as` | `'p'` | HTML element to render, e.g. `'blockquote'`, `'h1'` |

`OpticalMarginText` also forwards all standard HTML attributes (`aria-label`, `id`, `role`, `className`, `style`, etc.) to the root element.

---

## How it works

Each word is wrapped in a plain inline span, with the spaces between words left in the text flow, so the browser lays the paragraph out exactly as before; words are then grouped into lines by position. The first and last character of each line is measured in place with a DOM `Range`, so the measurement uses the rendered font: its size, variation settings, features and your letter-spacing. (Canvas `measureText` is the fallback where the DOM can't measure.) The hang is that advance width × the character's fraction (capped by `maxHangRatio`), applied as `margin-inline-start` (start hang) or `margin-inline-end` (end hang) on each line span. Logical properties keep the direction right in both LTR and RTL. The React hook and Webflow embed re-run on resize and after fonts finish loading.

**Start character set:** `"` `'` `"` `'` `«` `(` `[`

**End character set:** `.` `,` `;` `:` `!` `?` `"` `'` `"` `'` `»` `-` `–` `—` `…` `)` `]`

**Line break safety:** each line is locked (`white-space: nowrap`) with exactly the words the browser put on it, including a word the browser itself splits at a hyphen. Text without spaces between words (CJK, Thai) breaks between characters as usual. Justified text stays justified, `text-indent` applies to the first line only, and `white-space: pre` keeps its lines.

**Markup:** inline elements (`<em>`, `<a>`, `<strong>`…) and your own `<br>` and images are kept, and the original elements are reused, so event listeners on them (React's included) keep working. An element that runs across a line break is split into one copy per line (a link over two lines becomes two links to the same place; only the first keeps its `id`, and listeners are only on the first). `getCleanHTML()` returns the original markup.

**Limits:** words broken by `hyphens: auto` or `&shy;` aren't hyphenated (a locked line can't hyphenate, so the word moves whole to the next line). The lines are locked at the width they had when the effect ran: re-apply after a resize or a font load (the React hook and Webflow embed do this for you).

**Browser support:** works in every modern browser. Where nothing can be measured (SSR), the hang is `0` and text renders flush — the same as not applying the effect.

**React is optional.** The main entry also exports the React hook and component, so it imports `react`; without React installed, import the vanilla API from `@overpunch/opticalmargin/core`.

---

## Accessibility

Optical Margin is a presentation transform that keeps the readable text, including its spaces:

- The injected line spans carry no semantics; injected line-break elements (`<br data-om>`) are `aria-hidden="true"`.
- A link or emphasis that wraps across lines is split into one element per line, so a screen reader announces two links where there was one. Keep links short, or don't apply the effect to text where that matters.
- On `OpticalMarginText`, `aria-label` and all other HTML attributes pass through to the root element unchanged.

**Copy/paste caveat:** because the effect rebuilds the visual lines with real `<br>` elements, text copied from a processed element includes hard line breaks matching the on-screen wrap, rather than reflowing as one paragraph. If a verbatim, unbroken copy is important (e.g. quotable legal text), call `removeOpticalMargin(el, original)` before exposing the text for copy, or keep an off-screen flush copy as the canonical source.

---

## API reference

### `getCleanHTML(el: HTMLElement): string`

Returns the element's original innerHTML: for an element this library processed, the exact snapshot it was built from; otherwise the innerHTML with any optical-margin markup (`om-line` spans, `<br data-om>` separators) stripped. Safe to call multiple times — idempotent.

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
