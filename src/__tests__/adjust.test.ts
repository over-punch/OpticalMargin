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
