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

Words that begin with an opening mark or end with a closing mark are wrapped whole in a plain inline span (`om-start`, `om-end`, or both), in place; nothing else in the paragraph changes, and the browser keeps laying it out as usual. After layout, each mark is measured with a DOM `Range`, so the measurement uses the rendered font: its size, variation settings, features and your letter-spacing. (Canvas `measureText` is the fallback where the DOM can't measure.) A word whose opening mark starts a line gets a negative `margin-inline-start`, and one whose closing mark ends a line a negative `margin-inline-end`, of the mark's advance × its fraction (capped by `maxHangRatio`). Logical properties keep the direction right in both LTR and RTL. Calling `applyOpticalMargin` again with the same snapshot and options only re-measures and re-checks which marks start or end a line; the React hook and Webflow embed do this on resize and after fonts load.

**Start character set:** `"` `'` `“` `‘` `«` `(` `[`

**End character set:** `.` `,` `;` `:` `!` `?` `"` `'` `”` `’` `»` `-` `–` `—` `…` `)` `]`

**Aligned edges only:** start hangs apply to start-aligned and justified text, end hangs to end-aligned and justified text. A ragged edge has nothing to align, and a hang there would only move line breaks.

**Line breaks:** the text is never locked into lines, so hyphenation (`hyphens: auto`, `&shy;`) keeps working, CJK and Thai break as usual, and `text-indent`, justification and `white-space: pre` behave as normal. A hang gives its line a little more room (like CSS `hanging-punctuation` where it's supported), which can occasionally move a later line break. The layout check repeats until it settles; a mark whose hang would let its word move to the neighbouring line is left flush rather than flip back and forth. In our test paragraphs (4 fonts, 6 widths, 49 lines starting with a mark), 46 hung by 0.6–0.86 of the mark's width and 3 were left flush.

**Markup:** the author's markup is never split or copied: a link that wraps stays one link, with its listeners, and copy-paste gives the original text. `removeOpticalMargin()` puts the original text nodes back; `getCleanHTML()` returns the original markup.

**Browser support:** works in every modern browser. Where nothing can be measured (SSR), the hang is `0` and text renders flush — the same as not applying the effect.

**React is optional.** The main entry also exports the React hook and component, so it imports `react`; without React installed, import the vanilla API from `@overpunch/opticalmargin/core`.

---

## Accessibility

Optical Margin is a presentation transform that keeps the readable text and markup as they are:

- The injected spans carry no semantics, and no line breaks are added.
- A link or emphasis that wraps across lines stays one element, so a screen reader announces one link.
- Copy-paste gives the original text, reflowing as one paragraph.
- On `OpticalMarginText`, `aria-label` and all other HTML attributes pass through to the root element unchanged.

---

## Migrating from 1.x

2.0 stops locking lines. The generated markup changed: there are no `om-line` / `om-word` spans or `<br data-om>` breaks any more, only `om-start` / `om-end` spans around the words with hanging marks (`OPTICAL_MARGIN_CLASSES` is now `{ start, end }`). If your CSS targeted `.om-line` or `.om-word`, update it. End hangs now apply only to justified or end-aligned text, where they show. The options and function signatures are unchanged.

The Webflow embed loads the latest version from jsDelivr, so Webflow sites get 2.0 within the CDN's cache window.

---

## API reference

### `getCleanHTML(el: HTMLElement): string`

Returns the element's original innerHTML: for an element this library processed, the exact snapshot it was built from; otherwise the innerHTML with any optical-margin markup (`om-start` / `om-end` spans) unwrapped. Safe to call multiple times — idempotent.

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
