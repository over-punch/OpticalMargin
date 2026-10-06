// optical-margin/src/__tests__/adjust.test.ts — core algorithm tests
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyOpticalMargin, removeOpticalMargin, getCleanHTML, _resetCanvasForTesting } from '../core/adjust'
import { OPTICAL_MARGIN_CLASSES } from '../core/types'

// ─── Canvas mock ──────────────────────────────────────────────────────────────
// Each character has advance width = 10px.
// actualBoundingBoxLeft = 1, actualBoundingBoxRight = advance - 3 - 1 = advance - 4.
// So visualWidth = 1 + (advance - 4) = advance - 3.
// hangAmount = advance - visualWidth = 3px (well above default threshold 0.5).
const mockCtx = {
	font: '',
	measureText: (text: string) => ({
		width: text.length * 10,
		actualBoundingBoxLeft: 1,
		actualBoundingBoxRight: text.length * 10 - 4,
	}),
}

const mockCanvas = {
	getContext: () => mockCtx,
} as unknown as HTMLCanvasElement

/** Canvas mock that returns null context — simulates Canvas-unavailable environments */
const mockCanvasNoCtx = {
	getContext: () => null,
} as unknown as HTMLCanvasElement

// ─── DOM measurement mock ─────────────────────────────────────────────────────
// Container = 600px wide; word spans report a consistent top=0 (all on one line)
// and a narrow width so they don't overflow the container.
const CONTAINER_WIDTH = 600

function makeElement(html: string): HTMLElement {
	const el = document.createElement('p')
	el.innerHTML = html
	el.style.width = `${CONTAINER_WIDTH}px`
	document.body.appendChild(el)
	return el
}

/**
 * Overrides getBoundingClientRect so that word spans are distributed across two
 * simulated lines. Words whose textContent starts with a line-2 marker character
 * (i.e. those in the second half of a known word list) report top=20 instead of top=0.
 * The caller controls which spans fall on line 2 via the `line2Words` set.
 */
function mockMultiLine(line2Words: Set<string>) {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		const el = this as HTMLElement
		const isWord = el.classList?.contains(OPTICAL_MARGIN_CLASSES.word)
		if (isWord) {
			const text = (el.textContent ?? '').trim()
			const top = line2Words.has(text) ? 20 : 0
			return {
				width: 40, height: 20, top, left: 0, right: 40, bottom: top + 20, x: 0, y: top,
				toJSON: () => ({}),
			} as DOMRect
		}
		return {
			width: CONTAINER_WIDTH, height: 40, top: 0, left: 0, right: CONTAINER_WIDTH, bottom: 40, x: 0, y: 0,
			toJSON: () => ({}),
		} as DOMRect
	})
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('optical-margin', () => {
	beforeEach(() => {
		document.body.innerHTML = ''

		// Reset module-level canvas singleton so each test gets a fresh canvas from the mock
		_resetCanvasForTesting()

		// Mock canvas creation — must happen before any call that could create a canvas
		vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			if (tag === 'canvas') return mockCanvas
			// Use the real createElement for all other tags, bypassing the spy to avoid recursion
			return document.createElement.wrappedFunction
				? (document.createElement as unknown as { wrappedFunction: (t: string) => HTMLElement }).wrappedFunction(tag)
				: HTMLDocument.prototype.createElement.call(document, tag)
		})

		// Mock getBoundingClientRect so word spans all appear on the same line (top=0)
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
			const el = this as HTMLElement
			const isWord = el.classList?.contains(OPTICAL_MARGIN_CLASSES.word)
			const w = isWord ? 40 : CONTAINER_WIDTH
			return {
				width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0,
				toJSON: () => ({}),
			} as DOMRect
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// ── Test 1: getCleanHTML is idempotent ────────────────────────────────────
	it('getCleanHTML is idempotent', () => {
		const el = makeElement('<em>Hello</em> world')
		const html = getCleanHTML(el)
		const html2 = getCleanHTML(el)
		expect(html).toBe(html2)
	})

	// ── Test 2: empty element does not throw ─────────────────────────────────
	it('applyOpticalMargin does not throw on empty element', () => {
		const el = makeElement('')
		const original = getCleanHTML(el)
		expect(() => applyOpticalMargin(el, original, {})).not.toThrow()
	})

	// ── Test 3: removeOpticalMargin restores original HTML ───────────────────
	it('removeOpticalMargin restores original HTML', () => {
		const el = makeElement('<em>Hello</em> world')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		removeOpticalMargin(el, original)
		expect(el.innerHTML).toBe(original)
	})

	// ── Test 4: om-line spans are created after apply ─────────────────────────
	it('after apply, om-line spans exist', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		const lines = el.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.line}`)
		expect(lines.length).toBeGreaterThan(0)
	})

	// ── Test 5: hangStart — opening quote gets negative marginInlineStart ─────
	it('lines starting with a hanging char have negative marginInlineStart', () => {
		// Opening curly-quote is in HANG_START_CHARS
		const el = makeElement('\u201CHello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: false, threshold: 0 })
		const firstLine = el.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)
		expect(firstLine).toBeTruthy()
		const margin = firstLine!.style.marginInlineStart
		expect(margin).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 6: hangEnd — period gets negative marginInlineEnd ────────────────
	it('lines ending with a hanging char have negative marginInlineEnd', () => {
		const el = makeElement('Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		const lastLine = lines[lines.length - 1]
		expect(lastLine).toBeTruthy()
		const margin = lastLine!.style.marginInlineEnd
		expect(margin).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 7: lines without hanging chars have no margin ───────────────────
	it('lines without hanging chars have no margin adjustment', () => {
		// 'H' is not a hang-start char, 'd' is not a hang-end char
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		expect(lines.length).toBeGreaterThan(0)
		for (const line of lines) {
			expect(line.style.marginInlineStart).toBe('')
			expect(line.style.marginInlineEnd).toBe('')
		}
	})

	// ── Test 8: hangStart:false skips start margin even when char is hangable ─
	it('hangStart: false skips start margin even when start char is hangable', () => {
		const el = makeElement('\u201CHello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: false, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		expect(lines.length).toBeGreaterThan(0)
		for (const line of lines) {
			expect(line.style.marginInlineStart).toBe('')
		}
	})

	// ── Test 9: hangEnd:false skips end margin ────────────────────────────────
	it('hangEnd: false skips end margin', () => {
		const el = makeElement('Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: false, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		expect(lines.length).toBeGreaterThan(0)
		for (const line of lines) {
			expect(line.style.marginInlineEnd).toBe('')
		}
	})

	// ── Test 10: inline elements are preserved ────────────────────────────────
	it('preserves inline elements after apply', () => {
		const el = makeElement('<em>italic</em> and <strong>bold</strong>')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		expect(el.querySelector('em')).toBeTruthy()
		expect(el.querySelector('strong')).toBeTruthy()
	})

	// ── Test 11: opening single-quote hangs start ─────────────────────────────
	it("opening single-quote (') hangs start", () => {
		const el = makeElement("'Hello world.")
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: false, threshold: 0 })
		const firstLine = el.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)
		expect(firstLine?.style.marginInlineStart).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 12: opening parenthesis hangs start ──────────────────────────────
	it('opening parenthesis hangs start', () => {
		const el = makeElement('(Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: false, threshold: 0 })
		const firstLine = el.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)
		expect(firstLine?.style.marginInlineStart).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 13: comma at end hangs ───────────────────────────────────────────
	it('comma at end of line gets negative marginInlineEnd', () => {
		const el = makeElement('Hello world,')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		const last = lines[lines.length - 1]
		expect(last?.style.marginInlineEnd).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 14: colon at end hangs ───────────────────────────────────────────
	it('colon at end of line gets negative marginInlineEnd', () => {
		const el = makeElement('Hello world:')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		const last = lines[lines.length - 1]
		expect(last?.style.marginInlineEnd).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 15: high threshold prevents all hanging ─────────────────────────
	// The mock canvas returns hangAmount = 3px. Threshold is in pixels, so any
	// threshold > 3px suppresses hanging for all characters in the mock.
	it('threshold above mock hangAmount prevents any hanging', () => {
		const el = makeElement('\u201CHello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: true, threshold: 100 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		for (const line of lines) {
			expect(line.style.marginInlineStart).toBe('')
			expect(line.style.marginInlineEnd).toBe('')
		}
	})

	// ── Test 16: getCleanHTML strips om-line class names after apply ──────────
	it('getCleanHTML strips om-line spans from applied element', () => {
		const el = makeElement('Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain(OPTICAL_MARGIN_CLASSES.line)
		expect(cleaned).not.toContain(OPTICAL_MARGIN_CLASSES.word)
	})

	// ── Test 17: applying twice from same original gives same line count ───────
	it('applying twice from same original does not double line spans', () => {
		const el = makeElement('Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, {})
		const count1 = el.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.line}`).length
		applyOpticalMargin(el, original, {})
		const count2 = el.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.line}`).length
		expect(count2).toBe(count1)
	})

	// ── Test 18: opening bracket '[' hangs start ──────────────────────────────
	it("opening bracket '[' hangs start", () => {
		const el = makeElement('[footnote] and more text here')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: false, threshold: 0 })
		const firstLine = el.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)
		expect(firstLine?.style.marginInlineStart).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 19: multi-line — correct number of om-line spans ─────────────────
	it('multi-line: produces two om-line spans when words span two visual lines', () => {
		// Words: "Hello" "world" on line 1; "foo" "bar." on line 2
		const el = makeElement('Hello world foo bar.')
		const original = getCleanHTML(el)
		mockMultiLine(new Set(['foo', 'bar.']))
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: false, threshold: 0 })
		const lines = el.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.line}`)
		expect(lines.length).toBe(2)
	})

	// ── Test 20: multi-line — br data-om inserted between lines ───────────────
	it('multi-line: a br[data-om] separator is inserted between lines', () => {
		const el = makeElement('Hello world foo bar.')
		const original = getCleanHTML(el)
		mockMultiLine(new Set(['foo', 'bar.']))
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: false, threshold: 0 })
		const brs = el.querySelectorAll('br[data-om]')
		expect(brs.length).toBe(1)
	})

	// ── Test 21: multi-line — line 2 start-hang char gets margin ─────────────
	it('multi-line: opening quote at start of line 2 gets marginInlineStart', () => {
		// Line 1: "Hello world"; line 2 starts with an opening curly quote
		const el = makeElement('Hello world “foo bar.')
		const original = getCleanHTML(el)
		// "“foo" is the first word-span text on line 2
		mockMultiLine(new Set(['“foo', 'bar.']))
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: false, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		expect(lines.length).toBe(2)
		expect(lines[1].style.marginInlineStart).toMatch(/^-[\d.]+px$/)
	})

	// ── Test 22: multi-line — line 1 end-hang char gets margin ───────────────
	it('multi-line: period at end of line 1 gets marginInlineEnd', () => {
		// Line 1 ends with "world."; line 2 is "foo bar"
		const el = makeElement('Hello world. foo bar')
		const original = getCleanHTML(el)
		mockMultiLine(new Set(['foo', 'bar']))
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		expect(lines.length).toBe(2)
		expect(lines[0].style.marginInlineEnd).toMatch(/^-[\d.]+px$/)
		// Line 2 ends with plain 'r' — no end-hang
		expect(lines[1].style.marginInlineEnd).toBe('')
	})

	// ── Test 23: multi-line — getCleanHTML removes br data-om ────────────────
	it('multi-line: getCleanHTML removes injected br[data-om] elements', () => {
		const el = makeElement('Hello world foo bar.')
		const original = getCleanHTML(el)
		mockMultiLine(new Set(['foo', 'bar.']))
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: false, threshold: 0 })
		// Confirm br is present after apply
		expect(el.querySelector('br[data-om]')).not.toBeNull()
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain('data-om')
	})

	// ── Test 24: SSR guard — applyOpticalMargin is a no-op when window is undefined ─
	it('applyOpticalMargin is a no-op when window is undefined', () => {
		const el = makeElement('Hello world.')
		const original = getCleanHTML(el)
		const originalHTML = el.innerHTML
		// Temporarily hide window
		const win = globalThis.window
		// @ts-expect-error intentional undefined override for SSR simulation
		globalThis.window = undefined
		try {
			applyOpticalMargin(el, original, {})
			// innerHTML should be unchanged since the function returned early
			expect(el.innerHTML).toBe(originalHTML)
		} finally {
			globalThis.window = win
		}
	})

	// ── Test 25: Canvas-unavailable fallback — no hang applied ────────────────
	it('no hang is applied when canvas context is unavailable', () => {
		vi.restoreAllMocks()
		document.body.innerHTML = ''

		// Reset the module-level canvas singleton so the new null-context mock is used
		_resetCanvasForTesting()

		// Install a canvas mock that returns null context
		vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			if (tag === 'canvas') return mockCanvasNoCtx
			return HTMLDocument.prototype.createElement.call(document, tag)
		})
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
			const el = this as HTMLElement
			const isWord = el.classList?.contains(OPTICAL_MARGIN_CLASSES.word)
			const w = isWord ? 40 : CONTAINER_WIDTH
			return {
				width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0,
				toJSON: () => ({}),
			} as DOMRect
		})

		const el = makeElement('“Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		expect(lines.length).toBeGreaterThan(0)
		for (const line of lines) {
			expect(line.style.marginInlineStart).toBe('')
			expect(line.style.marginInlineEnd).toBe('')
		}
	})

	// ── Test 26: custom hangFractions override ────────────────────────────────
	it('custom hangFractions override reduces hang amount', () => {
		const el1 = makeElement('“Hello world.')
		const orig1 = getCleanHTML(el1)
		applyOpticalMargin(el1, orig1, { hangStart: true, hangEnd: false, threshold: 0 })
		const fullHang = parseFloat(
			el1.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)?.style.marginInlineStart ?? '0',
		)

		const el2 = makeElement('“Hello world.')
		const orig2 = getCleanHTML(el2)
		applyOpticalMargin(el2, orig2, { hangStart: true, hangEnd: false, threshold: 0, hangFractions: { '“': 0.4 } })
		const reducedHang = parseFloat(
			el2.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)?.style.marginInlineStart ?? '0',
		)

		// Both should be negative; reduced fraction yields a smaller absolute value
		expect(fullHang).toBeLessThan(0)
		expect(reducedHang).toBeLessThan(0)
		expect(Math.abs(reducedHang)).toBeLessThan(Math.abs(fullHang))
	})

	// ── Test 27: maxHangRatio=0 suppresses all hang ───────────────────────────
	it('maxHangRatio=0 suppresses all hanging', () => {
		const el = makeElement('“Hello world.')
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: true, hangEnd: true, maxHangRatio: 0, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		for (const line of lines) {
			expect(line.style.marginInlineStart).toBe('')
			expect(line.style.marginInlineEnd).toBe('')
		}
	})

	// ── Test 28: whitespace-only input does not throw ────────────────────────
	it('whitespace-only input does not throw and produces no line spans', () => {
		const el = makeElement('   ')
		const original = getCleanHTML(el)
		expect(() => applyOpticalMargin(el, original, {})).not.toThrow()
		expect(el.querySelectorAll(`.${OPTICAL_MARGIN_CLASSES.line}`).length).toBe(0)
	})

	// ── Test 29: closing chars hang at end ────────────────────────────────────
	it.each([
		[')', 'closing parenthesis'],
		[']', 'closing bracket'],
		['!', 'exclamation mark'],
		['?', 'question mark'],
		['–', 'en dash'],
		['—', 'em dash'],
		['…', 'ellipsis'],
		['”', 'closing curly double-quote'],
		['’', 'closing curly single-quote'],
	])('closing char %s hangs at end', (char) => {
		const el = makeElement(`Hello world${char}`)
		const original = getCleanHTML(el)
		applyOpticalMargin(el, original, { hangStart: false, hangEnd: true, threshold: 0 })
		const lines = Array.from(el.querySelectorAll<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`))
		const last = lines[lines.length - 1]
		expect(last?.style.marginInlineEnd).toMatch(/^-[\d.]+px$/)
	})

	// ── Review fixes (2026-10) ───────────────────────────────────────────────

	it('getCleanHTML returns the original markup exactly, including author <br> and whitespace between elements', () => {
		const html = 'The <em>quick</em> <a href="#x" id="L">fox jumps</a> <strong>over</strong>.<br>Second line.'
		const el = makeElement(html)
		applyOpticalMargin(el, html, {})
		expect(getCleanHTML(el)).toBe(html)
		expect(el.querySelectorAll('#L').length).toBe(1)
		expect(el.querySelectorAll('br:not([data-om])').length).toBe(1)
	})

	it('keeps the original elements, so their event listeners survive a refit', () => {
		const html = '“Quoted <a href="#">link</a> text.”'
		const el = makeElement(html)
		const link = el.querySelector('a')!
		let clicks = 0
		link.addEventListener('click', (e) => { e.preventDefault(); clicks++ })
		applyOpticalMargin(el, html, {})
		applyOpticalMargin(el, html, {})
		el.querySelector('a')!.click()
		expect(el.querySelector('a')).toBe(link)
		expect(clicks).toBe(1)
		removeOpticalMargin(el, html)
		expect(el.querySelector('a')).toBe(link)
	})

	it('hangs a fraction of the advance width (mock advance 10px, quote fraction 0.8)', () => {
		const html = '“Hello world'
		const el = makeElement(html)
		applyOpticalMargin(el, html, {})
		const line = el.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)!
		expect(line.style.marginInlineStart).toBe('-8px')
	})

	it('a NaN threshold falls back to the default instead of turning hanging off', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		const html = '“Hello world'
		const el = makeElement(html)
		applyOpticalMargin(el, html, { threshold: Number.NaN })
		const line = el.querySelector<HTMLElement>(`.${OPTICAL_MARGIN_CLASSES.line}`)!
		expect(line.style.marginInlineStart).not.toBe('')
	})

	it('accepts null options', () => {
		const html = '“Hello world'
		const el = makeElement(html)
		expect(() => applyOpticalMargin(el, html, null)).not.toThrow()
	})
})
