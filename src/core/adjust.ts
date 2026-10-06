// optical-margin/src/core/adjust.ts — framework-agnostic optical margin alignment algorithm
import { OPTICAL_MARGIN_CLASSES, type OpticalMarginOptions } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Resolved defaults applied when options are omitted */
const DEFAULTS = {
	hangStart: true,
	hangEnd: true,
	threshold: 0.5,
	maxHangRatio: 0.9,
} as const

/** Characters eligible for hanging at the START of a line (opening punctuation) */
const HANG_START_CHARS = new Set(['"', "'", '\u201C', '\u2018', '\u00AB', '(', '['])

/** Characters eligible for hanging at the END of a line (closing punctuation and sentence marks) */
const HANG_END_CHARS = new Set([
	'.', ',', ';', ':', '!', '?',
	'"', "'", '\u201D', '\u2019', '\u00BB',
	'-', '\u2013', '\u2014',
	'\u2026', // ellipsis (…)
	')', ']',
])

/**
 * Default hang fractions by character — editorial practice varies how deeply
 * each punctuation mark is hung. Hyphens and dashes hang fully; commas and
 * colons hang partially because their ink occupies more of the advance width.
 */
const DEFAULT_HANG_FRACTIONS: Record<string, number> = {
	'-':       1.0,
	'\u2013':  1.0, // en dash
	'\u2014':  1.0, // em dash
	'"':       0.8,
	"'":       0.8,
	'\u201C':  0.8, // left double quotation mark
	'\u201D':  0.8, // right double quotation mark
	'\u2018':  0.8, // left single quotation mark
	'\u2019':  0.8, // right single quotation mark
	'\u00AB':  0.8, // left-pointing double angle quotation mark
	'\u00BB':  0.8, // right-pointing double angle quotation mark
	'.':       0.8,
	'!':       0.8,
	'?':       0.8,
	'\u2026':  0.8, // ellipsis (…)
	')':       0.8,
	']':       0.8,
	'(':       0.6, // opening parenthesis — bracket ink covers ~60% of advance
	'[':       0.6, // opening bracket — similar proportion to parenthesis
	',':       0.6,
	';':       0.6,
	':':       0.6,
}

// ─── Canvas helpers ────────────────────────────────────────────────────────────

/** Module-level canvas singleton — created once, reused across all applyOpticalMargin calls */
let _canvas: HTMLCanvasElement | null | undefined = undefined

/** Measurement memo: key = `${char}|${fontStyle}`, value = hang in px */
const _hangCache = new Map<string, number>()

/**
 * Resets the module-level canvas singleton and measurement cache.
 * Exposed for testing only — allows tests to swap the canvas mock between cases.
 * Do not call in production code.
 */
export function _resetCanvasForTesting(): void {
	_canvas = undefined
	_hangCache.clear()
}

/**
 * Returns a module-level singleton offscreen canvas, or null in environments
 * without Canvas support (e.g. SSR, happy-dom without canvas plugin).
 * The instance is created once and reused to avoid repeated element allocation.
 */
function getCanvas(): HTMLCanvasElement | null {
	if (_canvas !== undefined) return _canvas
	if (typeof document === 'undefined') { _canvas = null; return null }
	try {
		const c = document.createElement('canvas')
		const ctx = c.getContext('2d')
		_canvas = ctx ? c : null
	} catch {
		_canvas = null
	}
	return _canvas
}

/**
 * The canvas font string for an element. Canvas rejects some computed values (Chrome reports
 * font-stretch as "100%", which makes the whole string invalid and leaves the canvas at its
 * default 10px sans-serif), so stretch is set through ctx.fontStretch only when it is a keyword.
 */
function canvasFont(cs: CSSStyleDeclaration): string {
	return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
}

/**
 * Advance width of one character in the element's font, measured with Canvas (fallback when the
 * DOM can't measure it). Memoised by (char, font).
 */
function canvasAdvance(char: string, cs: CSSStyleDeclaration | null, ctx: CanvasRenderingContext2D | null): number {
	if (!ctx || !cs) return 0
	const font = canvasFont(cs)
	const key = `${char}|${font}|${cs.fontStretch}`
	const cached = _hangCache.get(key)
	if (cached !== undefined) return cached
	ctx.font = font
	const stretch = cs.fontStretch
	const ctxS = ctx as unknown as { fontStretch?: string }
	if ('fontStretch' in ctxS) ctxS.fontStretch = /^[a-z-]+$/.test(stretch) ? stretch : 'normal'
	const width = ctx.measureText(char).width
	const advance = Number.isFinite(width) && width > 0 ? width : 0
	_hangCache.set(key, advance)
	return advance
}

/**
 * Advance width of the first (or last) non-space character of an item in the live DOM, measured
 * with a Range on that character, so the font, size, variation settings, features and the
 * author's letter-spacing are all as rendered. Returns 0 when the DOM can't measure it.
 */
function domAdvance(item: HTMLElement, fromEnd: boolean): number {
	const text = item.firstChild
	if (!text || text.nodeType !== Node.TEXT_NODE || typeof document.createRange !== 'function') return 0
	const value = text.textContent ?? ''
	const chars = Array.from(value)
	if (!chars.length) return 0
	const ch = fromEnd ? chars[chars.length - 1] : chars[0]
	const startOffset = fromEnd ? value.length - ch.length : 0
	try {
		const range = document.createRange()
		range.setStart(text, startOffset)
		range.setEnd(text, startOffset + ch.length)
		const w = range.getBoundingClientRect?.().width ?? 0
		return Number.isFinite(w) && w > 0 ? w : 0
	} catch {
		return 0
	}
}

/** Per-item data kept during one apply: the whitespace before it, an author <br> before it, and whether it is a whole element. */
interface ItemMeta {
	lead: string
	breakBefore: HTMLBRElement | null
	atomic?: boolean
}

/** A piece of one item on one line: usually a whole word, or part of a word the browser breaks. */
interface Segment {
	item: HTMLElement
	text: string
	top: number
	bottom: number
	lead: string
	breakBefore: HTMLBRElement | null
	atomic: boolean
	/** Whether this is the item's first segment (its start is the span's start). */
	first: boolean
}

/**
 * Splits a text node that the browser lays out over several lines into one piece per line, by
 * measuring where each character's box starts a new line. Used only for the rare word that wraps.
 */
function splitAtLineBreaks(node: Text, text: string): { text: string; top: number; bottom: number }[] {
	const pieces: { text: string; top: number; bottom: number }[] = []
	const range = document.createRange()
	let start = 0
	let top = NaN, bottom = NaN
	for (let i = 0; i < text.length; i++) {
		range.setStart(node, i)
		range.setEnd(node, i + 1)
		const rect = range.getClientRects()[0]
		if (!rect) continue
		const middle = (rect.top + rect.bottom) / 2
		if (Number.isNaN(top)) { top = rect.top; bottom = rect.bottom; continue }
		if (middle > bottom) {
			pieces.push({ text: text.slice(start, i), top, bottom })
			start = i
			top = rect.top
			bottom = rect.bottom
		} else {
			bottom = Math.max(bottom, rect.bottom)
		}
	}
	pieces.push({ text: text.slice(start), top: Number.isNaN(top) ? 0 : top, bottom: Number.isNaN(bottom) ? 0 : bottom })
	return pieces.filter((p) => p.text.length > 0)
}

/** Elements kept whole during the rebuild (no text of their own to split). */
const ATOMIC_TAGS = new Set(['IMG', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'MATH'])

/** Scripts written without spaces between words: every grapheme is a possible line break. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/**
 * Splits a space-free token into the pieces a line may break between: graphemes for CJK, Thai and
 * similar scripts (Intl.Segmenter keeps combining marks with their base), the whole token otherwise.
 */
function splitUnspaced(token: string): string[] {
	if (!UNSPACED_SCRIPT.test(token)) return [token]
	const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
	if (!Seg) return Array.from(token)
	return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(token), (seg) => seg.segment)
}

/** A finite number, else the default (with a one-time warning). */
function finiteOr(value: unknown, fallback: number, name: string): number {
	if (value === undefined) return fallback
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (!warned.has(name)) {
		warned.add(name)
		console.warn(`[opticalMargin] ${name} must be a finite number; got ${String(value)}, using ${fallback}`)
	}
	return fallback
}

/** Warnings already printed. */
const warned = new Set<string>()

/** The snapshot each processed element was built from, returned by getCleanHTML. */
const originals = new WeakMap<HTMLElement, string>()

/**
 * The element's original nodes: each element's child list, so a refit or removal can put the very
 * same nodes back (keeping their event listeners, React's included) instead of re-parsing HTML.
 */
interface NodeSnapshot { html: string; children: Map<Node, Node[]> }
const snapshots = new WeakMap<HTMLElement, NodeSnapshot>()

/** Records every element's child list under root. */
function takeSnapshot(root: HTMLElement, html: string): NodeSnapshot {
	const children = new Map<Node, Node[]>()
	const visit = (node: Node) => {
		children.set(node, Array.from(node.childNodes))
		node.childNodes.forEach((child) => { if (child.nodeType === Node.ELEMENT_NODE) visit(child) })
	}
	visit(root)
	return { html, children }
}

/** Puts the original nodes back where they were. */
function restoreSnapshot(snapshot: NodeSnapshot): void {
	snapshot.children.forEach((kids, parent) => (parent as Element).replaceChildren(...kids))
}

/**
 * Pass 1: bring the element back to its original content, reusing the original nodes when they
 * are still known (a refit, or a first run on an element that already holds originalHTML).
 */
function resetElement(element: HTMLElement, originalHTML: string): void {
	const snap = snapshots.get(element)
	if (snap && snap.html === originalHTML) {
		restoreSnapshot(snap)
		return
	}
	if (snap) restoreSnapshot(snap)
	const current = element.querySelector(`.${OPTICAL_MARGIN_CLASSES.line}`) ? null : element.innerHTML
	if (current !== originalHTML) element.innerHTML = originalHTML
	snapshots.set(element, takeSnapshot(element, originalHTML))
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Strips all optical-margin injected markup from a clone of the element and returns the clean
 * innerHTML (the author's own <br> tags are kept). Safe to call multiple times — idempotent.
 *
 * @param el - Element that may contain optical-margin markup
 */
export function getCleanHTML(el: HTMLElement): string {
	// An element this library processed returns the exact snapshot it was built from (an element the
	// browser wrapped across lines was rebuilt as one copy per line, which unwrapping can't merge).
	const original = originals.get(el)
	if (original !== undefined && el.querySelector(`.${OPTICAL_MARGIN_CLASSES.line}`)) return original
	const clone = el.cloneNode(true) as HTMLElement
	const injected = clone.querySelectorAll(
		`.${OPTICAL_MARGIN_CLASSES.word}, .${OPTICAL_MARGIN_CLASSES.line}`,
	)
	injected.forEach((node) => {
		const parent = node.parentNode
		if (!parent) return
		while (node.firstChild) parent.insertBefore(node.firstChild, node)
		parent.removeChild(node)
	})
	// Also clean up injected <br> elements between line spans
	clone.querySelectorAll('br[data-om]').forEach((br) => br.parentNode?.removeChild(br))
	// Merge the text nodes the rebuild split, so the result matches the original markup
	clone.normalize()
	return clone.innerHTML
}

/**
 * Applies optical margin alignment (hanging punctuation) to an element.
 *
 * The algorithm runs four passes:
 *  1. Reset — restore the element to the originalHTML snapshot
 *  2. Word wrap — wrap each word in a plain inline om-word span, leaving the spaces between words
 *     in the text flow, so the browser breaks lines exactly as it does for the original text
 *  3. Read — group words into visual lines by position, and measure the advance of each line's
 *     first and last character in place
 *  4. Write — rebuild the content as one om-line span per line (inline markup kept, a link stays
 *     one link within a line) with negative margin-inline-start/end for the hanging punctuation
 *
 * @param element      - Live DOM element to adjust (must be rendered and visible)
 * @param originalHTML - HTML snapshot taken before the first run (from getCleanHTML)
 * @param options      - Optical margin options (merged with defaults)
 */
export function applyOpticalMargin(
	element: HTMLElement,
	originalHTML: string,
	options: OpticalMarginOptions | null = {},
): void {
	if (typeof window === 'undefined') return
	const opts = options ?? {}

	const hangStart    = opts.hangStart    ?? DEFAULTS.hangStart
	const hangEnd      = opts.hangEnd      ?? DEFAULTS.hangEnd
	const threshold    = finiteOr(opts.threshold, DEFAULTS.threshold, 'threshold')
	// Clamp maxHangRatio to [0,1] — values outside this range produce nonsensical hang
	const maxHangRatio = Math.max(0, Math.min(1, finiteOr(opts.maxHangRatio, DEFAULTS.maxHangRatio, 'maxHangRatio')))
	const hangFractions = opts.hangFractions ?? DEFAULT_HANG_FRACTIONS

	// --- Pass 1: Reset ---
	resetElement(element, originalHTML)
	originals.set(element, originalHTML)

	if (!originalHTML.trim()) {
		// Nothing to do on an empty element
		return
	}

	// Guard: element must be laid out before BCR measurements are meaningful.
	// offsetWidth is preferred; fall back to getBoundingClientRect for environments
	// (e.g. happy-dom in tests) where offsetWidth is always 0.
	if (!element.offsetWidth && !element.getBoundingClientRect().width) return

	// --- Pass 2: Word wrap ---
	// Each word goes in a plain inline span holding only the word; the whitespace around it stays as
	// text in the flow. (Measuring words as inline-blocks with their leading space inside dropped that
	// space, packed lines too tightly, and the locked nowrap lines then overflowed.) Text without
	// spaces (CJK, Thai) is split into graphemes so each character is a possible break. Author <br>,
	// images and other childless elements become atomic items so they survive the rebuild.
	// createTreeWalker is intentionally avoided — it skips inline elements in happy-dom 12.
	const items: HTMLElement[] = []
	const meta = new WeakMap<Element, ItemMeta>()
	let pendingSpace = ''
	let pendingBreak: HTMLBRElement | null = null

	const pushWord = (span: HTMLElement, lead: string) => {
		meta.set(span, { lead: pendingSpace + lead, breakBefore: pendingBreak })
		pendingSpace = ''
		pendingBreak = null
		items.push(span)
	}

	const walk = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = node as Text
			const text = textNode.textContent ?? ''
			if (!text.trim()) {
				// Whitespace between elements ("<em>a</em> <b>b</b>"): carried as the next word's lead.
				pendingSpace += text
				return
			}
			const fragment = document.createDocumentFragment()
			let lead = ''
			for (const token of text.split(/(\s+)/)) {
				if (!token) continue
				if (/^\s+$/.test(token)) {
					fragment.appendChild(document.createTextNode(token))
					lead += token
					continue
				}
				for (const piece of splitUnspaced(token)) {
					const span = document.createElement('span')
					span.className = OPTICAL_MARGIN_CLASSES.word
					// No automatic hyphenation inside a word: a locked nowrap line can't hyphenate, so the
					// measurement mustn't either (a word split across two lines would land on one).
					span.style.hyphens = 'manual'
					span.textContent = piece
					fragment.appendChild(span)
					pushWord(span, lead)
					lead = ''
				}
			}
			// Trailing whitespace of this text node leads the next word.
			pendingSpace += lead
			textNode.parentNode!.replaceChild(fragment, textNode)
			return
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return
		const el = node as Element
		if (el.tagName === 'BR') {
			pendingBreak = el as HTMLBRElement
			return
		}
		if (!el.hasChildNodes() || ATOMIC_TAGS.has(el.tagName)) {
			meta.set(el, { lead: pendingSpace, breakBefore: pendingBreak, atomic: true })
			pendingSpace = ''
			pendingBreak = null
			items.push(el as HTMLElement)
			return
		}
		Array.from(el.childNodes).forEach(walk)
	}
	Array.from(element.childNodes).forEach(walk)

	if (items.length === 0) {
		element.innerHTML = originalHTML
		return
	}

	// --- Pass 3: Read — group items into lines, measure hanging characters (no writes) ---
	// A word starts a new line when its vertical middle is below the bottom of the current line's
	// boxes. Comparing middles, not tops, keeps a superscript or a taller inline image in its line,
	// and still separates lines whose glyph boxes overlap (fonts with tall ascenders and descenders,
	// such as Arabic, set at a tight line-height).
	// A word the browser itself breaks across lines (after a hyphen: "words-|everywhere") is split
	// into one segment per line at the real break, found by measuring its characters.
	const segments: Segment[] = []
	for (const item of items) {
		const rects = item.getClientRects?.()
		const rect = rects && rects.length ? rects[0] : item.getBoundingClientRect()
		const info = meta.get(item)
		const text = info?.atomic ? '' : item.textContent ?? ''
		if (rects && rects.length > 1 && !info?.atomic && item.firstChild?.nodeType === Node.TEXT_NODE) {
			for (const [k, piece] of splitAtLineBreaks(item.firstChild as Text, text).entries()) {
				segments.push({ item, text: piece.text, top: piece.top, bottom: piece.bottom, lead: k === 0 ? info?.lead ?? '' : '', breakBefore: k === 0 ? info?.breakBefore ?? null : null, atomic: false, first: k === 0 })
			}
			continue
		}
		segments.push({ item, text, top: rect.top, bottom: rect.bottom ?? rect.top, lead: info?.lead ?? '', breakBefore: info?.breakBefore ?? null, atomic: !!info?.atomic, first: true })
	}

	const lines: Segment[][] = []
	let current: Segment[] | null = null
	let groupBottom = -Infinity
	for (const seg of segments) {
		const middle = (seg.top + seg.bottom) / 2
		if (current === null || middle > groupBottom || (current.length > 0 && seg.breakBefore)) {
			current = []
			lines.push(current)
			groupBottom = seg.bottom
		} else {
			groupBottom = Math.max(groupBottom, seg.bottom)
		}
		current.push(seg)
	}

	const computed = typeof getComputedStyle !== 'undefined' ? getComputedStyle(element) : null
	const canvasCtx = getCanvas()?.getContext('2d') ?? null

	/** Hang in px for a character: advance × its fraction, capped at advance × maxHangRatio. */
	const hangFor = (char: string, advance: number): number => {
		const fraction = Math.max(0, Math.min(1, hangFractions[char] ?? DEFAULT_HANG_FRACTIONS[char] ?? 1.0))
		return advance * Math.min(fraction, maxHangRatio)
	}

	const lineData = lines.map((lineItems) => {
		const first = lineItems[0]
		const last = lineItems[lineItems.length - 1]
		const firstChar = first.atomic ? '' : Array.from(first.text.trimStart())[0] ?? ''
		const lastChars = last.atomic ? [] : Array.from(last.text.trimEnd())
		const lastChar = lastChars[lastChars.length - 1] ?? ''
		let startHang = 0
		if (hangStart && firstChar && HANG_START_CHARS.has(firstChar)) {
			// A segment that starts mid-word can't be measured from its span's start: use Canvas.
			const advance = (first.first ? domAdvance(first.item, false) : 0) || canvasAdvance(firstChar, computed, canvasCtx)
			startHang = hangFor(firstChar, advance)
		}
		let endHang = 0
		if (hangEnd && lastChar && HANG_END_CHARS.has(lastChar)) {
			const isWholeEnd = last.text === (last.item.textContent ?? '') || !last.first
			const advance = (isWholeEnd ? domAdvance(last.item, true) : 0) || canvasAdvance(lastChar, computed, canvasCtx)
			endHang = hangFor(lastChar, advance)
		}
		return { lineItems, startHang, endHang }
	})

	// Author settings a locked line has to carry over.
	const textAlign = computed?.textAlign ?? ''
	const justify = textAlign === 'justify'
	const ws = computed?.whiteSpace ?? ''
	const lineWhiteSpace = ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces' ? 'pre' : 'nowrap'
	const pad = (v: string | undefined) => parseFloat(v ?? '') || 0
	const contentWidth = justify && computed
		? element.getBoundingClientRect().width - pad(computed.paddingLeft) - pad(computed.paddingRight) - pad(computed.borderLeftWidth) - pad(computed.borderRightWidth)
		: 0

	// --- Pass 4: Write — one om-line span per line ---
	// Ancestor chains are read for every segment before anything moves.
	const chains = new Map<Segment, Element[]>()
	for (const line of lineData) {
		for (const seg of line.lineItems) {
			const ancestors: Element[] = []
			let node: Element | null = seg.item.parentElement
			while (node && node !== element) {
				ancestors.unshift(node)
				node = node.parentElement
			}
			chains.set(seg, ancestors)
		}
	}
	const copied = new Set<Element>()
	const fragment = document.createDocumentFragment()

	/** The line built before the current one (for a separator space at its end). */
	let prevLineSpan: HTMLElement | null = null
	lineData.forEach(({ lineItems, startHang, endHang }, lineIndex) => {
		const lineSpan = document.createElement('span')
		lineSpan.className = OPTICAL_MARGIN_CLASSES.line
		lineSpan.style.display = 'inline-block'
		lineSpan.style.whiteSpace = lineWhiteSpace
		// text-indent is inherited: without this, every line would be indented, not just the first.
		lineSpan.style.textIndent = '0'
		const hangsStart = startHang > threshold
		const hangsEnd = endHang > threshold
		if (hangsStart) lineSpan.style.marginInlineStart = `-${startHang}px`
		if (hangsEnd) lineSpan.style.marginInlineEnd = `-${endHang}px`

		// Justified text: every line but the last of a paragraph (and lines before an author <br>)
		// fills the column, including the hang.
		const nextItem = lineData[lineIndex + 1]?.lineItems[0]
		const endsParagraph = !nextItem || !!nextItem.breakBefore
		if (justify && !endsParagraph && contentWidth > 0) {
			lineSpan.style.width = `${contentWidth + (hangsStart ? startHang : 0) + (hangsEnd ? endHang : 0)}px`
			lineSpan.style.textAlignLast = 'justify'
		}

		// Rebuild the line's text inside copies of its inline ancestors. Consecutive words that share
		// an ancestor share one copy (one link stays one link within a line); an element that continues
		// onto a later line is copied again there, without its id so ids stay unique.
		let openChain: { source: Element; clone: Element }[] = []
		lineItems.forEach((seg, k) => {
			const item = seg.item
			const ancestors = chains.get(seg) ?? []
			let shared = 0
			while (shared < openChain.length && shared < ancestors.length && openChain[shared].source === ancestors[shared]) shared++
			openChain = openChain.slice(0, shared)
			let parent: Node = shared ? openChain[shared - 1].clone : lineSpan
			// The space before a word is kept (collapsed at a line start, but text and copy-paste keep
			// it); a newline there is the line break itself, which the line span now provides.
			let lead = seg.lead
			if (k === 0 && /[\r\n]/.test(lead)) {
				// A newline at a line start is the line break itself, which the line span now provides. If it
				// was the only separator, a space at the end of the previous line keeps the words apart
				// (normal white-space, so it collapses at the line end even in a pre line).
				lead = lead.replace(/[\r\n]+/g, '')
				if (!lead && prevLineSpan) {
					const space = document.createElement('span')
					space.className = OPTICAL_MARGIN_CLASSES.word
					space.style.whiteSpace = 'normal'
					space.textContent = ' '
					prevLineSpan.appendChild(space)
				}
			}
			if (lead) parent.appendChild(document.createTextNode(lead))
			for (let a = shared; a < ancestors.length; a++) {
				// The first appearance reuses the original element (emptied), so listeners attached to
				// it — including React's — keep working; later lines get a copy without its id.
				let copy: Element
				if (copied.has(ancestors[a])) {
					copy = ancestors[a].cloneNode(false) as Element
					copy.removeAttribute('id')
				} else {
					copy = ancestors[a]
					copy.replaceChildren()
				}
				copied.add(ancestors[a])
				parent.appendChild(copy)
				openChain.push({ source: ancestors[a], clone: copy })
				parent = copy
			}
			// Atomic items (images, inputs, buttons) are moved, not copied, so they keep their listeners.
			if (seg.atomic) {
				parent.appendChild(item)
			} else {
				// Each word keeps an om-word span in the output, as before, for anyone styling it.
				const word = document.createElement('span')
				word.className = OPTICAL_MARGIN_CLASSES.word
				word.textContent = seg.text
				parent.appendChild(word)
			}
		})

		fragment.appendChild(lineSpan)
		prevLineSpan = lineSpan

		if (lineIndex < lineData.length - 1) {
			// The author's own <br> at this boundary is kept (getCleanHTML returns it); otherwise an
			// injected, aria-hidden break that getCleanHTML removes.
			const authorBreak = lineData[lineIndex + 1].lineItems[0].breakBefore
			if (authorBreak) {
				fragment.appendChild(authorBreak.cloneNode(false))
			} else {
				const br = document.createElement('br')
				br.dataset.om = '1'
				br.setAttribute('aria-hidden', 'true')
				fragment.appendChild(br)
			}
		}
	})

	element.innerHTML = ''
	element.appendChild(fragment)
}

/**
 * Strips all optical-margin markup and restores the element to the originalHTML snapshot.
 *
 * @param element      - Element previously adjusted by applyOpticalMargin
 * @param originalHTML - The snapshot passed to the original applyOpticalMargin call
 */
export function removeOpticalMargin(element: HTMLElement, originalHTML: string): void {
	const snap = snapshots.get(element)
	if (snap && snap.html === originalHTML) restoreSnapshot(snap)
	else element.innerHTML = originalHTML
	snapshots.delete(element)
	originals.delete(element)
}
