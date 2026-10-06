// optical-margin/src/react/useOpticalMargin.ts — React hook
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { applyOpticalMargin, getCleanHTML } from '../core/adjust'
import type { OpticalMarginOptions } from '../core/types'

/**
 * React hook that applies the optical-margin effect to a ref'd element.
 * Automatically re-runs on resize (width changes only) and after fonts load.
 *
 * @param options - Optical margin options. All properties are optional (defaults apply).
 */
export function useOpticalMargin(options: OpticalMarginOptions = {}, contentKey?: string) {
	// contentKey: pass a value that changes when the element's content changes (OpticalMarginText
	// derives one from its children). The library rewrites the element's DOM, so new content needs a
	// fresh element and a fresh snapshot rather than React patching nodes that are no longer there.
	const ref = useRef<HTMLElement>(null)
	const originalHTMLRef = useRef<string | null>(null)
	/** The element originalHTMLRef was read from; a new element is read afresh. */
	const sourceElRef = useRef<HTMLElement | null>(null)
	const optionsRef = useRef(options)
	optionsRef.current = options

	const { hangStart, hangEnd, threshold, maxHangRatio } = options
	// A JSON key, so an inline hangFractions object doesn't re-run the effect on every render.
	const fractionsKey = options.hangFractions ? JSON.stringify(options.hangFractions) : ''

	const run = useCallback(() => {
		const el = ref.current
		if (!el) return
		if (originalHTMLRef.current === null || sourceElRef.current !== el) {
			originalHTMLRef.current = getCleanHTML(el)
			sourceElRef.current = el
		}
		applyOpticalMargin(el, originalHTMLRef.current, optionsRef.current)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hangStart, hangEnd, threshold, maxHangRatio, fractionsKey, contentKey])

	useLayoutEffect(() => {
		run()

		const el = ref.current
		if (!el) return

		// Guard: skip ResizeObserver in environments that don't support it (old WebViews)
		if (typeof ResizeObserver === 'undefined') return

		let lastWidth = 0
		let rafId = 0
		const ro = new ResizeObserver((entries) => {
			// Guard against polyfills that may emit empty entry arrays
			if (!entries.length) return
			const w = Math.round(entries[0].contentRect.width)
			if (w === lastWidth) return
			lastWidth = w
			cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(run)
		})
		ro.observe(el)
		return () => {
			ro.disconnect()
			cancelAnimationFrame(rafId)
		}
	}, [run])

	// Rerun after all fonts finish loading — measurements taken before font-swap
	// produce wrong results (Canvas glyph metrics use the fallback font).
	// An unmounted flag prevents calling run() on a detached element.
	useEffect(() => {
		let unmounted = false
		document.fonts?.ready?.then(() => {
			if (!unmounted) run()
		}).catch(() => {})
		return () => { unmounted = true }
	}, [run])

	return ref
}
