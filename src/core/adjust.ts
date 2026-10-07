// optical-margin/src/core/adjust.ts — framework-agnostic optical margin alignment: hanging punctuation on the words that start or end a line, in the text flow (no line locking)
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
 * How many marks layoutHangs may have to try on their own before it stops deciding them one at a time (a hang
 * can move later line breaks). Marks still undecided then are hung in one batch and any that end up off their
 * edge are released.
 */
const MAX_LAYOUT_RETRIES = 64

/** How many marks layoutHangs hangs and checks at a time, so a long text costs a few reads per round, not all of them. */
const LAYOUT_WINDOW = 24

/** How many release-only passes the final check may take (each one only removes hangs, so it always ends). */
const MAX_RELEASE_PASSES = 8

/** Elements whose text is never touched: scripts, styles, form fields, templates. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TEMPLATE', 'NOSCRIPT', 'SELECT', 'OPTION'])

/** One original text node and the nodes that replaced it, so remove() can put the original back. */
interface Wrapped { original: Text; produced: Node[] }

/** One hangable mark: the word span that carries it, the character, and the edge it hangs at. */
interface Mark { span: HTMLElement; char: string; edge: 'start' | 'end' }

/** What a run changed on an element. */
interface ElementState {
	originalHTML: string
	optionsKey: string
	wrapped: Wrapped[]
	/** Words that begin with an opening mark (the span holds the whole word, so it can still hyphenate). */
	starts: { span: HTMLElement; char: string }[]
	/** Words that end with a closing mark. */
	ends: { span: HTMLElement; char: string }[]
	/** Every mark in document order (a word with both has its start mark first); layoutHangs decides them in this order. */
	marks: Mark[]
	opts: ResolvedOptions
}

/** Options after defaults and validation. */
interface ResolvedOptions {
	hangStart: boolean
	hangEnd: boolean
	threshold: number
	maxHangRatio: number
	hangFractions: Record<string, number>
}

/** Per-element state. */
const states = new WeakMap<HTMLElement, ElementState>()

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

/** Split text into graphemes (combining marks stay with their base). */
function graphemes(text: string): string[] {
	const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
	if (!Seg) return Array.from(text)
	return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (seg) => seg.segment)
}

/** The flow of an element: its text nodes in order, with author line breaks and replaced elements between them. */
type FlowItem = { kind: 'text'; node: Text } | { kind: 'break' } | { kind: 'object' }

/** Collect the element's text flow (recursive childNodes, not TreeWalker), skipping scripts, styles, fields and editable regions. */
function collectFlow(root: Node, out: FlowItem[] = []): FlowItem[] {
	root.childNodes.forEach((child) => {
		if (child.nodeType === Node.TEXT_NODE) out.push({ kind: 'text', node: child as Text })
		else if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement
			if (el.tagName === 'BR') { out.push({ kind: 'break' }); return }
			if (SKIP_TAGS.has(el.tagName) || el.isContentEditable) return
			if (!el.hasChildNodes()) { out.push({ kind: 'object' }); return }
			collectFlow(el, out)
		}
	})
	return out
}

/** The next node after `node` in document order, staying inside `root`. */
function nextInOrder(node: Node, root: Node): Node | null {
	if (node.firstChild) return node.firstChild
	let n: Node | null = node
	while (n && n !== root) {
		if (n.nextSibling) return n.nextSibling
		n = n.parentNode
	}
	return null
}

/** The rectangle of the first visible character after `from` inside `root` (null when nothing follows). */
function nextCharRect(from: Node, root: Node): DOMRect | null {
	let n: Node | null = from.lastChild ? from.lastChild : from
	// Skip past `from`'s own content.
	while (n && n !== root && !n.nextSibling) n = n.parentNode
	n = n && n !== root ? n.nextSibling : null
	for (; n; n = nextInOrder(n, root)) {
		if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'BR') return null
		if (n.nodeType !== Node.TEXT_NODE) continue
		const text = n.textContent ?? ''
		const i = text.search(/\S/)
		if (i < 0) continue
		const range = document.createRange()
		range.setStart(n, i)
		range.setEnd(n, i + 1)
		const r = range.getClientRects?.()[0] ?? range.getBoundingClientRect?.()
		return r ?? null
	}
	return null
}

/** The rectangle of the last visible character before `from` inside `root` (null when nothing precedes it on the flow). */
function prevCharRect(from: Node, root: Node): DOMRect | null {
	// Walk backwards in document order.
	const prevInOrder = (node: Node): Node | null => {
		if (node === root) return null
		if (node.previousSibling) {
			let n: Node = node.previousSibling
			while (n.lastChild) n = n.lastChild
			return n
		}
		return node.parentNode && node.parentNode !== root ? node.parentNode : null
	}
	for (let n = prevInOrder(from); n; n = prevInOrder(n)) {
		if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'BR') return null
		if (n.nodeType !== Node.TEXT_NODE) continue
		const text = n.textContent ?? ''
		let i = text.length - 1
		while (i >= 0 && /\s/.test(text[i])) i--
		if (i < 0) continue
		const range = document.createRange()
		range.setStart(n, i)
		range.setEnd(n, i + 1)
		const rects = range.getClientRects?.()
		return (rects && rects[rects.length - 1]) ?? range.getBoundingClientRect?.() ?? null
	}
	return null
}

/** Width of one character at the start or end of a span's text, as rendered (Canvas where the DOM can't measure). */
function markAdvance(span: HTMLElement, char: string, atEnd: boolean): number {
	const text = span.firstChild
	if (text && text.nodeType === Node.TEXT_NODE && typeof document.createRange === 'function') {
		const value = text.textContent ?? ''
		const start = atEnd ? value.length - char.length : 0
		try {
			const range = document.createRange()
			range.setStart(text, Math.max(0, start))
			range.setEnd(text, Math.max(0, start) + char.length)
			const w = range.getBoundingClientRect?.().width ?? 0
			if (Number.isFinite(w) && w > 0) return w
		} catch { /* fall through */ }
	}
	// The DOM couldn't measure it (no layout): the character's advance in the span's font, from Canvas.
	return canvasAdvance(char, typeof getComputedStyle !== 'undefined' ? getComputedStyle(span) : null, getCanvas()?.getContext('2d') ?? null)
}

/** Put an element's original text nodes back and drop the run's state. */
function unwrap(element: HTMLElement): void {
	const state = states.get(element)
	if (!state) return
	for (const w of state.wrapped) {
		const first = w.produced.find((n) => n.parentNode)
		if (first?.parentNode) first.parentNode.insertBefore(w.original, first)
		w.produced.forEach((n) => n.parentNode?.removeChild(n))
	}
	states.delete(element)
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the element's innerHTML without optical-margin markup (the start/end spans unwrapped).
 * Safe to call multiple times — idempotent.
 *
 * @param el - Element that may contain optical-margin markup
 */
export function getCleanHTML(el: HTMLElement): string {
	const clone = el.cloneNode(true) as HTMLElement
	clone.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.start}, .${OPTICAL_MARGIN_CLASSES.end}`).forEach((node) => {
		const parent = node.parentNode
		if (!parent) return
		while (node.firstChild) parent.insertBefore(node.firstChild, node)
		parent.removeChild(node)
	})
	clone.normalize()
	return clone.innerHTML
}

/**
 * Applies optical margin alignment (hanging punctuation) to an element, without locking its lines.
 *
 * Words that begin with an opening mark (“ ‘ « ( [ and straight quotes) or end with a closing mark
 * (. , ; : ! ? ” ’ » ) ] - – — …) are wrapped whole in a span, in place. After layout, a word whose mark
 * starts a line gets a negative start margin, so the mark hangs into the margin, and one whose mark ends a
 * line gets a negative end margin. Hangs apply on the aligned edges only: the start edge of start-aligned or
 * justified text, the end edge of end-aligned or justified text (a ragged edge has nothing to align).
 *
 * The text stays one flow: links and other elements are never split or copied, hyphenation and `&shy;`
 * keep working, and copy-paste is unchanged. Calling it again with the same snapshot and options (on
 * resize, after fonts load) only re-measures and re-checks which marks start or end a line.
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
	if (typeof window === 'undefined' || !element) return
	const o = options ?? {}
	const opts: ResolvedOptions = {
		hangStart: o.hangStart ?? DEFAULTS.hangStart,
		hangEnd: o.hangEnd ?? DEFAULTS.hangEnd,
		threshold: finiteOr(o.threshold, DEFAULTS.threshold, 'threshold'),
		// Clamp maxHangRatio to [0,1] — values outside this range produce nonsensical hang
		maxHangRatio: Math.max(0, Math.min(1, finiteOr(o.maxHangRatio, DEFAULTS.maxHangRatio, 'maxHangRatio'))),
		hangFractions: o.hangFractions ?? DEFAULT_HANG_FRACTIONS,
	}
	const optionsKey = JSON.stringify(opts)

	// Same snapshot and options: just re-measure (fonts may have loaded) and re-check line ends.
	const existing = states.get(element)
	if (existing && existing.originalHTML === originalHTML && existing.optionsKey === optionsKey && existing.wrapped.every((w) => w.produced.some((n) => n.isConnected))) {
		layoutHangs(element, existing)
		return
	}

	// --- Reset: the original text nodes back, or the snapshot if the content has changed ---
	unwrap(element)
	if (getCleanHTML(element) !== originalHTML) element.innerHTML = originalHTML
	if (!originalHTML.trim() || (!opts.hangStart && !opts.hangEnd)) return

	// --- Wrap: marks that can start or end a line, in place ---
	const flow = collectFlow(element)
	const state: ElementState = { originalHTML, optionsKey, wrapped: [], starts: [], ends: [], marks: [], opts }
	/** Whether the flow after item k (at its start) begins with whitespace, a line break or nothing. */
	const followedByBreak = (k: number): boolean => {
		for (let j = k; j < flow.length; j++) {
			const f = flow[j]
			if (f.kind === 'break') return true
			if (f.kind === 'object') return false
			const t = f.node.data
			if (!t) continue
			return /^\s/.test(t)
		}
		return true
	}
	let prev = ''   // the character before the current position in the flow ('' at the start or after a line break)
	flow.forEach((f, k) => {
		if (f.kind === 'break') { prev = ''; return }
		if (f.kind === 'object') { prev = 'x'; return }
		const node = f.node
		const text = node.data
		if (!text || !node.parentNode) return
		// Whole words (whitespace-separated tokens): a word that starts with an opening mark or ends with a closing
		// mark is wrapped whole, so the browser can still hyphenate it.
		const tokens = text.split(/(\s+)/).filter(Boolean)
		const pieces: { text: string; start?: string; end?: string }[] = []
		let changed = false
		tokens.forEach((token, ti) => {
			if (/^\s+$/.test(token)) { pieces.push({ text: token }); return }
			const gs = graphemes(token)
			const before = ti > 0 ? tokens[ti - 1].slice(-1) : prev
			const isLast = ti === tokens.length - 1
			const first = gs[0], last = gs[gs.length - 1]
			const start = opts.hangStart && HANG_START_CHARS.has(first) && (before === '' || /\s/.test(before)) ? first : undefined
			const end = opts.hangEnd && HANG_END_CHARS.has(last) && (!isLast || followedByBreak(k + 1)) && !(gs.length === 1 && start) ? last : undefined
			if (start || end) { pieces.push({ text: token, start, end }); changed = true }
			else pieces.push({ text: token })
		})
		prev = text.slice(-1)
		if (!changed) return
		const produced: Node[] = []
		for (const piece of pieces) {
			if (!piece.start && !piece.end) {
				const lastNode = produced[produced.length - 1]
				if (lastNode && lastNode.nodeType === Node.TEXT_NODE) (lastNode as Text).data += piece.text
				else produced.push(document.createTextNode(piece.text))
				continue
			}
			const span = document.createElement('span')
			span.className = [piece.start && OPTICAL_MARGIN_CLASSES.start, piece.end && OPTICAL_MARGIN_CLASSES.end].filter(Boolean).join(' ')
			span.textContent = piece.text
			produced.push(span)
			if (piece.start) { state.starts.push({ span, char: piece.start }); state.marks.push({ span, char: piece.start, edge: 'start' }) }
			if (piece.end) { state.ends.push({ span, char: piece.end }); state.marks.push({ span, char: piece.end, edge: 'end' }) }
		}
		const fragment = document.createDocumentFragment()
		produced.forEach((n) => fragment.appendChild(n))
		node.parentNode.replaceChild(fragment, node)
		state.wrapped.push({ original: node, produced })
	})
	if (!state.wrapped.length) return
	states.set(element, state)
	layoutHangs(element, state)
}

/** Hang in px for a character: advance × its fraction, capped at advance × maxHangRatio. */
function hangFor(opts: ResolvedOptions, char: string, advance: number): number {
	const key = Array.from(char)[0] ?? char
	const fraction = Math.max(0, Math.min(1, opts.hangFractions[key] ?? DEFAULT_HANG_FRACTIONS[key] ?? 1.0))
	return advance * Math.min(fraction, opts.maxHangRatio)
}

/**
 * Measure and set the hangs: a negative start margin on words whose opening mark starts a line, and a
 * negative end margin on words whose closing mark ends one — on the edges that are aligned (the start edge
 * of start-aligned or justified text, the end edge of end-aligned or justified text).
 *
 * A hang gives its line a little more room, which can pull a word up and change the line breaks after it,
 * so the marks are decided in document order (a hang never changes the lines before its own). Each round
 * hangs the next few undecided marks that are at their edge (all reads, then all writes) and checks the
 * result. If the layout agrees, they are final. Otherwise everything before the first mark that disagrees is final; that mark
 * is tried on its own, and it is left flush only if its own hang takes it off its edge (its word fits on
 * the neighbouring line), so it can't flip back and forth. Marks that were merely moved by an earlier hang
 * are looked at again in the next round.
 */
function layoutHangs(element: HTMLElement, state: ElementState): void {
	if (!element.offsetWidth && !element.getBoundingClientRect().width) return
	const { opts } = state
	const scrollY = window.scrollY
	// Clear, so the reads see natural positions.
	for (const s of state.starts) s.span.style.marginInlineStart = ''
	for (const e of state.ends) e.span.style.marginInlineEnd = ''

	const cs = getComputedStyle(element)
	const rtl = cs.direction === 'rtl'
	const align = cs.textAlign
	const startAligned = align === 'justify' || align === 'start' || align === '' || (align === 'left' && !rtl) || (align === 'right' && rtl) || align === '-webkit-auto'
	const endAligned = align === 'justify' || align === 'end' || (align === 'right' && !rtl) || (align === 'left' && rtl)

	const firstRect = (span: HTMLElement) => span.getClientRects?.()[0] ?? span.getBoundingClientRect()
	const lastRect = (span: HTMLElement) => { const rs = span.getClientRects?.(); return (rs && rs[rs.length - 1]) ?? span.getBoundingClientRect() }
	const startsLine = (span: HTMLElement): boolean => {
		const prevR = prevCharRect(span, element)
		return !prevR || prevR.bottom <= firstRect(span).top + 1
	}
	const endsLine = (span: HTMLElement): boolean => {
		const nextR = nextCharRect(span, element)
		return !nextR || nextR.top >= lastRect(span).bottom - 1
	}

	// The marks on aligned edges, in document order.
	const marks = state.marks.filter((m) => (m.edge === 'start' ? startAligned : endAligned))
	/** Whether the mark starts (or ends) a line in the current layout. */
	const atEdge = (m: Mark): boolean => (m.edge === 'start' ? startsLine(m.span) : endsLine(m.span))
	/** The margin that hangs the mark ('' when the hang is under the threshold). */
	const hangOf = (m: Mark): string => {
		const hang = hangFor(opts, m.char, markAdvance(m.span, m.char, m.edge === 'end'))
		return hang > opts.threshold ? `${-hang}px` : ''
	}
	const getHang = (m: Mark): string => (m.edge === 'start' ? m.span.style.marginInlineStart : m.span.style.marginInlineEnd)
	const setHang = (m: Mark, value: string): void => {
		if (m.edge === 'start') m.span.style.marginInlineStart = value
		else m.span.style.marginInlineEnd = value
	}
	/** The margin the mark should have in the current layout. */
	const wanted = (m: Mark): string => (!flush.has(m) && atEdge(m) ? hangOf(m) : '')

	/** Marks whose own hang takes them off their edge: left flush. */
	const flush = new Set<Mark>()
	/** Marks before this index are final. */
	let decided = 0
	for (let retries = 0; decided < marks.length;) {
		// Out of retries: hang the rest in one batch; the final check releases what doesn't hold.
		const end = retries >= MAX_LAYOUT_RETRIES ? marks.length : Math.min(marks.length, decided + LAYOUT_WINDOW)
		// Hang every mark in the window that is at its edge: all reads, then all writes.
		const wants = marks.slice(decided, end).map(wanted)
		wants.forEach((want, k) => setHang(marks[decided + k], want))
		if (retries >= MAX_LAYOUT_RETRIES) break
		// Read the new layout: the first mark in the window whose hang doesn't match where it now sits.
		let first = -1
		for (let i = decided; i < end && first < 0; i++) {
			if (getHang(marks[i]) !== wanted(marks[i])) first = i
		}
		if (first < 0) { decided = end; continue }
		// Everything before it is final. Take the hangs from it onwards off, and try it on its own.
		for (let i = first; i < end; i++) setHang(marks[i], '')
		const mark = marks[first]
		const want = wanted(mark)
		if (want) {
			setHang(mark, want)
			if (!atEdge(mark)) { setHang(mark, ''); flush.add(mark) }
		}
		decided = first + 1
		retries++
	}

	// Final check: no hang may stay on a word that isn't at its edge (it would pull the word over its neighbour).
	// Only releases, so it ends; in a greedy line layout there is nothing to release.
	for (let pass = 0; pass < MAX_RELEASE_PASSES; pass++) {
		const off = marks.filter((m) => getHang(m) !== '' && !atEdge(m))
		if (!off.length) break
		off.forEach((m) => setHang(m, ''))
	}

	requestAnimationFrame(() => {
		if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior })
	})
}

/**
 * Removes optical-margin markup: the element's original text nodes are put back (other nodes were never
 * touched, so listeners and form values are kept). If the element no longer matches `originalHTML`, it is
 * reset to it.
 *
 * @param element      - Element previously adjusted by applyOpticalMargin
 * @param originalHTML - The snapshot passed to the original applyOpticalMargin call
 */
export function removeOpticalMargin(element: HTMLElement, originalHTML: string): void {
	unwrap(element)
	if (typeof originalHTML === 'string' && element.innerHTML !== originalHTML && getCleanHTML(element) !== originalHTML) element.innerHTML = originalHTML
}
