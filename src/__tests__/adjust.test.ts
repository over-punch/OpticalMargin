// optical-margin/src/__tests__/adjust.test.ts — core tests for 2.0: hanging punctuation on the words that start or end a line, in the text flow (no line locking)
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyOpticalMargin, removeOpticalMargin, getCleanHTML, _resetCanvasForTesting } from '../core/adjust'
import { OPTICAL_MARGIN_CLASSES } from '../core/types'

// ─── Measurement mocks ────────────────────────────────────────────────────────
// Every measured character is 10px wide, so a mark with fraction 0.8 hangs 8px and one with 0.6 hangs 6px.
// Text that contains "NEXTLINE" is laid out on the second line (top 20): a closing mark followed by it ends
// its line, and a word that contains it (e.g. “NEXTLINE) starts the second line.
const CONTAINER_WIDTH = 600
const ADVANCE = 10

/** A DOMRect-shaped object. */
function rect(top: number, width: number): DOMRect {
	return { width, height: 20, top, left: 0, right: width, bottom: top + 20, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

/** The line a node's text sits on in the mock layout. */
function lineTop(node: Node | null): number {
	return node && /NEXTLINE/.test(node.textContent ?? '') ? 20 : 0
}

/** A paragraph in the document with the given markup. */
function makeElement(html: string, style = ''): HTMLElement {
	const el = document.createElement('p')
	el.innerHTML = html
	el.style.cssText = `width:${CONTAINER_WIDTH}px;${style}`
	document.body.appendChild(el)
	return el
}

/** All spans of one class. */
function spans(el: HTMLElement, cls: string): HTMLElement[] {
	return Array.from(el.querySelectorAll<HTMLElement>(`.${cls}`))
}

describe('optical-margin 2.0', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		_resetCanvasForTesting()
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
			const el = this as HTMLElement
			const injected = [OPTICAL_MARGIN_CLASSES.start, OPTICAL_MARGIN_CLASSES.end].some((c) => el.classList?.contains(c))
			return injected ? rect(lineTop(el), ADVANCE * (el.textContent ?? '').length) : rect(0, CONTAINER_WIDTH)
		})
		vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
			return [this.getBoundingClientRect()] as unknown as DOMRectList
		})
		vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
			return [rect(lineTop(this.startContainer), ADVANCE)] as unknown as DOMRectList
		})
		vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
			return rect(lineTop(this.startContainer), ADVANCE)
		})
	})

	afterEach(() => { vi.restoreAllMocks() })

	it('getCleanHTML returns the original markup after apply, and is idempotent', () => {
		const html = 'He said “hello,” and <em>left</em>. <a href="#x">A (link)</a>'
		const el = makeElement(html)
		applyOpticalMargin(el, getCleanHTML(el), {})
		expect(getCleanHTML(el)).toBe(html)
		expect(getCleanHTML(el)).toBe(getCleanHTML(el))
	})

	it('does not throw on an empty or whitespace-only element', () => {
		for (const html of ['', '   ']) {
			const el = makeElement(html)
			expect(() => applyOpticalMargin(el, html, {})).not.toThrow()
			expect(el.querySelectorAll('span').length).toBe(0)
		}
	})

	it('a word whose opening mark starts a line hangs the mark; the same word mid-line does not', () => {
		const el = makeElement('He said “hello” to “NEXTLINE me')
		applyOpticalMargin(el, getCleanHTML(el), {})
		const starts = spans(el, OPTICAL_MARGIN_CLASSES.start)
		expect(starts.map((s) => s.textContent)).toEqual(['“hello”', '“NEXTLINE'])
		expect(starts[0].style.marginInlineStart).toBe('')       // "said" is on the same line
		expect(starts[1].style.marginInlineStart).toBe('-8px')   // starts line 2: 10px × 0.8
	})

	it('wraps the whole word, so the browser can still hyphenate it', () => {
		const el = makeElement('A “Incomprehensibilities” word')
		applyOpticalMargin(el, getCleanHTML(el), {})
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start)[0].textContent).toBe('“Incomprehensibilities”')
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start)[0].classList.contains(OPTICAL_MARGIN_CLASSES.end)).toBe(true)
	})

	it('an opening mark at the very start, or after a <br>, starts a line and hangs', () => {
		const el = makeElement('“First” line<br>(second) line')
		applyOpticalMargin(el, getCleanHTML(el), {})
		const starts = spans(el, OPTICAL_MARGIN_CLASSES.start)
		expect(starts.map((p) => p.textContent)).toEqual(['“First”', '(second)'])
		expect(starts[0].style.marginInlineStart).toBe('-8px')
		expect(starts[1].style.marginInlineStart).toBe('-6px')   // ( hangs 0.6
	})

	it('centred and end-aligned text get no start hangs (the start edge is ragged)', () => {
		for (const align of ['center', 'right']) {
			document.body.innerHTML = ''
			const el = makeElement('“First” line', `text-align:${align}`)
			applyOpticalMargin(el, getCleanHTML(el), {})
			expect(spans(el, OPTICAL_MARGIN_CLASSES.start)[0].style.marginInlineStart).toBe('')
		}
	})

	it('marks inside words are left alone (an apostrophe, a quote after a letter)', () => {
		const el = makeElement("it's the dog's bowl and a\"b")
		applyOpticalMargin(el, getCleanHTML(el), {})
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start).length).toBe(0)
		expect(spans(el, OPTICAL_MARGIN_CLASSES.end).length).toBe(0)
	})

	it('hangStart: false makes no start spans', () => {
		const el = makeElement('He said “hello to me')
		applyOpticalMargin(el, getCleanHTML(el), { hangStart: false })
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start).length).toBe(0)
	})

	it('in justified text, a closing mark that ends a line hangs; one mid-line does not', () => {
		const el = makeElement('One, two words. NEXTLINE more', 'text-align: justify')
		applyOpticalMargin(el, getCleanHTML(el), {})
		const ends = spans(el, OPTICAL_MARGIN_CLASSES.end)
		expect(ends.map((e) => e.textContent)).toEqual(['One,', 'words.'])
		expect(ends[0].style.marginInlineEnd).toBe('')       // "two" follows on the same line
		expect(ends[1].style.marginInlineEnd).toBe('-8px')   // NEXTLINE follows on the next line
	})

	it('the last mark of the text ends a line', () => {
		const el = makeElement('The end.', 'text-align: justify')
		applyOpticalMargin(el, getCleanHTML(el), {})
		expect(spans(el, OPTICAL_MARGIN_CLASSES.end)[0].style.marginInlineEnd).toBe('-8px')
	})

	it('left-aligned text gets no end hangs (they would not show, and could reflow the line)', () => {
		const el = makeElement('Two words. NEXTLINE more')
		applyOpticalMargin(el, getCleanHTML(el), {})
		spans(el, OPTICAL_MARGIN_CLASSES.end).forEach((e) => expect(e.style.marginInlineEnd).toBe(''))
	})

	it('hangEnd: false makes no end spans', () => {
		const el = makeElement('Two words. NEXTLINE more', 'text-align: justify')
		applyOpticalMargin(el, getCleanHTML(el), { hangEnd: false })
		expect(spans(el, OPTICAL_MARGIN_CLASSES.end).length).toBe(0)
	})

	it('threshold above the hang, or maxHangRatio 0, applies no margins', () => {
		for (const opts of [{ threshold: 20 }, { maxHangRatio: 0 }]) {
			document.body.innerHTML = ''
			const el = makeElement('“He said hello.” NEXTLINE', 'text-align: justify')
			applyOpticalMargin(el, getCleanHTML(el), opts)
			el.querySelectorAll<HTMLElement>('span').forEach((s) => {
				expect(s.style.marginInlineStart).toBe('')
				expect(s.style.marginInlineEnd).toBe('')
			})
		}
	})

	it('hangFractions overrides the default fraction', () => {
		const el = makeElement('“He said hello to me')
		applyOpticalMargin(el, getCleanHTML(el), { hangFractions: { '“': 0.5 } })
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start)[0].style.marginInlineStart).toBe('-5px')
	})

	it('never splits or copies elements: a link keeps its node, its listener and its id', () => {
		const el = makeElement('See <a href="#x" id="L">the “quoted” link, here.</a> NEXTLINE', 'text-align: justify')
		const link = el.querySelector('a')!
		let clicks = 0
		link.addEventListener('click', (e) => { e.preventDefault(); clicks++ })
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		expect(el.querySelectorAll('a').length).toBe(1)
		expect(el.querySelector('#L')).toBe(link)
		link.click()
		removeOpticalMargin(el, original)
		expect(el.querySelector('a')).toBe(link)
		link.click()
		expect(clicks).toBe(2)
		expect(el.innerHTML).toBe(original)
	})

	it('remove puts the original text nodes back', () => {
		const el = makeElement('He said “hello.” Done.')
		const textNode = el.firstChild
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		removeOpticalMargin(el, original)
		expect(el.firstChild).toBe(textNode)
		expect(el.innerHTML).toBe(original)
	})

	it('applying twice with the same snapshot and options does not wrap twice', () => {
		const el = makeElement('He said “hello.” Done.', 'text-align: justify')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		const first = el.innerHTML
		applyOpticalMargin(el, original, {})
		expect(el.innerHTML).toBe(first)
		expect(el.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.start} .${OPTICAL_MARGIN_CLASSES.start}`).length).toBe(0)
	})

	it('changed options re-wrap from the original', () => {
		const el = makeElement('He said “hello” to me')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		applyOpticalMargin(el, original, { hangStart: false })
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start).length).toBe(0)
		expect(getCleanHTML(el)).toBe(original)
	})

	it('leaves scripts, styles and text areas alone', () => {
		const el = makeElement('Text <textarea>a “b”</textarea><style>.x{content:" (y)"}</style>')
		applyOpticalMargin(el, getCleanHTML(el), {})
		expect(el.querySelector('textarea')!.querySelectorAll('span').length).toBe(0)
		expect(el.querySelector('style')!.querySelectorAll('span').length).toBe(0)
	})

	it('falls back to defaults for invalid numbers, and accepts null options', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const el = makeElement('“He said hello to me')
		applyOpticalMargin(el, getCleanHTML(el), { threshold: NaN })
		expect(spans(el, OPTICAL_MARGIN_CLASSES.start)[0].style.marginInlineStart).toBe('-8px')
		const el2 = makeElement('He said “hello” to me')
		expect(() => applyOpticalMargin(el2, getCleanHTML(el2), null)).not.toThrow()
		warn.mockRestore()
	})

	it('is a no-op without a window (SSR)', () => {
		const el = makeElement('He said “hello”')
		const win = (globalThis as Record<string, unknown>).window
		delete (globalThis as Record<string, unknown>).window
		try {
			expect(() => applyOpticalMargin(el, el.innerHTML, {})).not.toThrow()
		} finally {
			;(globalThis as Record<string, unknown>).window = win
		}
	})
})

// ─── Reflowing mock layout ────────────────────────────────────────────────────
// The mocks above pin every word to a line. These tests need hangs to move line breaks, so they use a small
// greedy line breaker: every character and every space is 10px wide, a word's width is reduced by its span's
// negative margins, and a word that doesn't fit starts the next line (20px lower). Text is plain words only.

/** One laid-out word: the text node it is in, its character range there, and its line. */
interface MockWord { node: Text; from: number; to: number; line: number }

/** Lays the element's words out greedily in a column `width` px wide. */
function mockLayout(el: HTMLElement, width: number): MockWord[] {
	const words: MockWord[] = []
	const walk = (node: Node) => node.childNodes.forEach((child) => {
		if (child.nodeType !== Node.TEXT_NODE) { walk(child); return }
		const re = /\S+/g
		let m: RegExpExecArray | null
		while ((m = re.exec((child as Text).data))) words.push({ node: child as Text, from: m.index, to: m.index + m[0].length, line: 0 })
	})
	walk(el)
	let x = 0, line = 0
	for (const w of words) {
		const span = w.node.parentElement && w.node.parentElement !== el ? w.node.parentElement : null
		const margins = span ? (parseFloat(span.style.marginInlineStart) || 0) + (parseFloat(span.style.marginInlineEnd) || 0) : 0
		const wordWidth = ADVANCE * (w.to - w.from) + margins
		if (x > 0 && x + ADVANCE + wordWidth > width) { line++; x = 0 }
		x += (x > 0 ? ADVANCE : 0) + wordWidth
		w.line = line
	}
	return words
}

describe('optical-margin 2.0: hangs that move line breaks', () => {
	/** Column width of the mock layout, set by each test before it applies. */
	let columnWidth = 0
	/** The paragraph under test. */
	let para: HTMLElement

	/** The mock line of the word at a character position. */
	const lineAt = (node: Node, offset: number): number => {
		const words = mockLayout(para, columnWidth)
		const word = words.find((w) => w.node === node && offset >= w.from && offset < w.to) ?? words.find((w) => w.node === node)
		return word ? word.line : 0
	}
	/** The mock line of a span's word. */
	const lineOf = (span: Element): number => (span.firstChild ? lineAt(span.firstChild, 0) : 0)
	/** The words that start each mock line. */
	const lineStarts = (): string[] => {
		const words = mockLayout(para, columnWidth)
		return words.filter((w, i) => i === 0 || words[i - 1].line !== w.line).map((w) => w.node.data.slice(w.from, w.to))
	}

	beforeEach(() => {
		document.body.innerHTML = ''
		_resetCanvasForTesting()
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
			const injected = [OPTICAL_MARGIN_CLASSES.start, OPTICAL_MARGIN_CLASSES.end].some((c) => this.classList?.contains(c))
			return injected ? rect(lineOf(this) * 20, ADVANCE * (this.textContent ?? '').length) : rect(0, columnWidth)
		})
		vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
			return [this.getBoundingClientRect()] as unknown as DOMRectList
		})
		vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
			return [rect(lineAt(this.startContainer, this.startOffset) * 20, ADVANCE)] as unknown as DOMRectList
		})
		vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
			return rect(lineAt(this.startContainer, this.startOffset) * 20, ADVANCE)
		})
	})

	afterEach(() => { vi.restoreAllMocks() })

	/** Makes the paragraph, applies the effect at a column width, and returns its start spans by word. */
	function applyAt(text: string, width: number): Record<string, HTMLElement> {
		columnWidth = width
		para = makeElement(text)
		applyOpticalMargin(para, getCleanHTML(para), {})
		return Object.fromEntries(spans(para, OPTICAL_MARGIN_CLASSES.start).map((s) => [s.textContent ?? '', s]))
	}

	// Regression (2.0.0): a mark that was hung and then found off its edge was left flush for good, whatever
	// the reason. Here “bbb starts line 2 and “ddd starts line 3. Hanging “bbb (8px) lets it fit at the end
	// of line 1, which pulls “ddd up into line 2; the first check found both off their edge and gave up on
	// both. With “bbb back flush, “ddd starts line 3 again and its hang moves nothing, so it must hang.
	it('a mark moved off its edge by another mark’s hang still hangs once the layout settles', () => {
		const s = applyAt('aaaaaaa aaaaaaaa “bbb cccccc cccccc “ddd eee', 205)
		expect(lineStarts()).toEqual(['aaaaaaa', '“bbb', '“ddd'])
		expect(s['“bbb'].style.marginInlineStart).toBe('')        // its own hang would move it to line 1
		expect(s['“ddd'].style.marginInlineStart).toBe('-8px')    // stable: it starts line 3 either way
	})

	it('a mark whose own hang would move its word to the line above is left flush', () => {
		const s = applyAt('aaaaaaa aaaaaaaa “bbb cccccc cccccc', 205)
		expect(lineStarts()).toEqual(['aaaaaaa', '“bbb'])
		expect(s['“bbb'].style.marginInlineStart).toBe('')
	})

	it('at every width, each line-start mark hangs unless its own hang would move it, and no hang is left mid-line', () => {
		const text = '“aa bbbb cc “dddd ee fff “gg hhhhh ii “jjj kk lllll “mm nnn oooo “pp qq rrrrr “ss ttt uu “vvvv ww xxx “yy zzzz'
		for (let width = 95; width <= 405; width += 10) {
			document.body.innerHTML = ''
			applyAt(text, width)
			const words = mockLayout(para, width)
			for (const span of spans(para, OPTICAL_MARGIN_CLASSES.start)) {
				const i = words.findIndex((w) => w.node === span.firstChild)
				const startsLine = i === 0 || words[i - 1].line !== words[i].line
				const hung = span.style.marginInlineStart !== ''
				if (!startsLine) { expect(hung, `${span.textContent} at ${width}px is mid-line`).toBe(false); continue }
				if (hung) continue
				// Flush at a line start: hanging it by hand must move it off the line start.
				span.style.marginInlineStart = '-8px'
				const after = mockLayout(para, width)
				const stillStarts = i === 0 || after[i - 1].line !== after[i].line
				span.style.marginInlineStart = ''
				expect(stillStarts, `${span.textContent} at ${width}px could have hung`).toBe(false)
			}
		}
	})
})
