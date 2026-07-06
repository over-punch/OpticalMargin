// opticalMargin/src/webflow/embed.ts — zero-config browser bundle for Webflow Custom Code Embed.
// Auto-applies optical margin alignment (hanging punctuation) to any element marked with
// [data-opticalmargin], reading options from data-* attributes, and re-fits on viewport
// resize (line grouping depends on the container's width). Exposes a small window.OpticalMargin API.
import { applyOpticalMargin, removeOpticalMargin, getCleanHTML } from '../core/adjust'
import type { OpticalMarginOptions } from '../core/types'

/** Attribute that opts an element in to optical margin alignment. */
const OPT_IN_ATTR = 'data-opticalmargin'

/**
 * Per-element record. Stores the clean HTML snapshot taken before the first mutation so
 * that re-fits (on resize) and teardown both restore from the same pristine markup —
 * applyOpticalMargin resets to this snapshot on every call.
 */
const INSTANCES = new WeakMap<HTMLElement, string>()

/** Live element set, iterated on resize so every managed element re-fits together. */
const tracked = new Set<HTMLElement>()

/**
 * Read optical margin options from an element's data-* attributes.
 * Unset attributes fall through to the library defaults.
 *
 * Supported attributes:
 *   data-om-hang-start     — "false" to disable hanging opening punctuation (default true)
 *   data-om-hang-end       — "false" to disable hanging closing punctuation (default true)
 *   data-om-threshold      — minimum hang in px before applying (default 0.5)
 *   data-om-max-hang-ratio — max proportion of advance width to hang, 0–1 (default 0.9)
 *   data-om-hang-fractions — JSON object of per-character hang fractions, e.g. {"-":1,".":0.7}
 *
 * @param el - The opted-in element
 */
function readOptions(el: HTMLElement): OpticalMarginOptions {
	const d = el.dataset
	const opts: OpticalMarginOptions = {}

	if (d.omHangStart === 'false') opts.hangStart = false
	else if (d.omHangStart === 'true') opts.hangStart = true

	if (d.omHangEnd === 'false') opts.hangEnd = false
	else if (d.omHangEnd === 'true') opts.hangEnd = true

	if (d.omThreshold !== undefined) {
		const n = parseFloat(d.omThreshold)
		if (!isNaN(n)) opts.threshold = n
	}
	if (d.omMaxHangRatio !== undefined) {
		const n = parseFloat(d.omMaxHangRatio)
		// Clamp to [0,1] — the core clamps too, but reject NaN here so defaults survive.
		if (!isNaN(n)) opts.maxHangRatio = Math.max(0, Math.min(1, n))
	}
	if (d.omHangFractions !== undefined) {
		const parsed = parseHangFractions(d.omHangFractions)
		if (parsed) opts.hangFractions = parsed
	}

	return opts
}

/**
 * Parse the data-om-hang-fractions JSON attribute into a validated fraction map.
 * Returns undefined on malformed JSON or a non-object so the library default applies.
 *
 * @param raw - Raw attribute string, expected to be a JSON object of char → fraction
 */
function parseHangFractions(raw: string): Record<string, number> | undefined {
	try {
		const obj = JSON.parse(raw) as unknown
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined
		const out: Record<string, number> = {}
		for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
			const n = typeof value === 'number' ? value : parseFloat(String(value))
			if (!isNaN(n)) out[key] = Math.max(0, Math.min(1, n))
		}
		return Object.keys(out).length ? out : undefined
	} catch {
		console.warn('OpticalMargin: could not parse data-om-hang-fractions as JSON, ignoring')
		return undefined
	}
}

/**
 * Initialise a single element: snapshot its clean markup once, then apply optical margins.
 * Idempotent — a previously tracked element reuses its stored snapshot rather than
 * re-capturing already-processed markup.
 *
 * @param el - Element to align
 */
function initElement(el: HTMLElement): void {
	// Snapshot clean HTML on first sight; reuse it on every subsequent call so we never
	// capture injected om-* markup as if it were the original.
	let originalHTML = INSTANCES.get(el)
	if (originalHTML === undefined) {
		originalHTML = getCleanHTML(el)
		INSTANCES.set(el, originalHTML)
	}
	applyOpticalMargin(el, originalHTML, readOptions(el))
	tracked.add(el)
}

/**
 * Re-apply optical margins to every tracked element. Line grouping depends on the
 * container width, so a resize can change which characters land at line ends.
 * applyOpticalMargin resets to the stored snapshot first, so repeated calls are idempotent.
 */
function refit(): void {
	tracked.forEach((el) => {
		const originalHTML = INSTANCES.get(el)
		if (originalHTML === undefined) return
		applyOpticalMargin(el, originalHTML, readOptions(el))
	})
}

/**
 * Restore an element to its clean markup and stop tracking it.
 *
 * @param el - Element previously initialised
 */
function destroy(el: HTMLElement): void {
	const originalHTML = INSTANCES.get(el)
	if (originalHTML !== undefined) removeOpticalMargin(el, originalHTML)
	INSTANCES.delete(el)
	tracked.delete(el)
}

/**
 * Scan a root for opted-in elements and align each one.
 *
 * @param root - Element or document to search (default: document)
 */
function init(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>(`[${OPT_IN_ATTR}]`).forEach(initElement)
}

// Re-fit on viewport resize — the container's width drives line breaks, which drive
// which punctuation hangs. Throttled to one re-fit per animation frame so a drag-resize
// doesn't re-run the whole read/measure/write pass on every event.
let resizeRaf = 0
function onResize(): void {
	if (resizeRaf) cancelAnimationFrame(resizeRaf)
	resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; refit() })
}

/**
 * Auto-initialise once the DOM is parsed and web fonts have loaded.
 * Fonts must settle first: hang amounts are measured from final glyph metrics via Canvas,
 * and line breaks shift when a web font swaps in — both change after the font loads.
 */
function autoInit(): void {
	const run = () => {
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => init()).catch(() => init())
		} else {
			init()
		}
		window.addEventListener('resize', onResize)
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true })
	} else {
		run()
	}
}

autoInit()

// Public browser API — assigned to window.OpticalMargin via the IIFE global name.
export { init, refit, destroy }
