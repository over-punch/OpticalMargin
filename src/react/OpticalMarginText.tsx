// optical-margin/src/react/OpticalMarginText.tsx — React component wrapper
import React, { Children, forwardRef, isValidElement, useCallback } from 'react'
import { useOpticalMargin } from './useOpticalMargin'
import type { OpticalMarginOptions } from '../core/types'

interface OpticalMarginTextProps extends OpticalMarginOptions, React.HTMLAttributes<HTMLElement> {
	children: React.ReactNode
	as?: React.ElementType
}

/**
 * A string that changes whenever the rendered content of `children` changes: text, element types,
 * keys and primitive props, walked recursively. Functions and objects are ignored.
 */
function childrenSignature(children: React.ReactNode): string {
	const parts: string[] = []
	const walk = (node: React.ReactNode) => {
		Children.forEach(node, (child) => {
			if (child === null || child === undefined || typeof child === 'boolean') return
			if (typeof child === 'string' || typeof child === 'number') { parts.push(String(child)); return }
			if (isValidElement(child)) {
				const type = typeof child.type === 'string' ? child.type : ((child.type as { displayName?: string; name?: string }).displayName ?? (child.type as { name?: string }).name ?? 'C')
				const props = child.props as Record<string, unknown>
				const attrs = Object.keys(props).filter((k) => k !== 'children' && ['string', 'number', 'boolean'].includes(typeof props[k])).sort().map((k) => `${k}=${String(props[k])}`)
				parts.push(`<${type}${child.key != null ? '#' + child.key : ''} ${attrs.join(' ')}>`)
				walk(props.children as React.ReactNode)
				parts.push(`</${type}>`)
			}
		})
	}
	walk(children)
	return parts.join('\u0000')
}

/**
 * Drop-in component that applies the optical-margin effect to its children.
 * Forwards the ref to the root DOM element while also wiring the internal hook ref.
 * Accepts all standard HTML attributes (aria-label, id, role, etc.) via spread.
 */
export const OpticalMarginText = forwardRef<HTMLElement, OpticalMarginTextProps>(
	function OpticalMarginText(
		{ children, as: Tag = 'p', hangStart, hangEnd, threshold, maxHangRatio, hangFractions, ...htmlProps },
		forwardedRef,
	) {
		const options: OpticalMarginOptions = { hangStart, hangEnd, threshold, maxHangRatio, hangFractions }
		// The library replaces the element's DOM, so React can't patch new children into it. When the
		// children's content changes, remount the element (key) and re-apply to the fresh content.
		const contentKey = childrenSignature(children)
		const innerRef = useOpticalMargin(options, contentKey)

		/** Callback ref that writes to both the hook's internal ref and the forwarded ref */
		const setRef = useCallback((node: HTMLElement | null) => {
			// useOpticalMargin returns a RefObject; we write .current directly here
			// because the ref is created by this hook and is not shared externally.
			;(innerRef as React.MutableRefObject<HTMLElement | null>).current = node
			if (typeof forwardedRef === 'function') {
				forwardedRef(node)
			} else if (forwardedRef) {
				;(forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node
			}
		}, [innerRef, forwardedRef])

		return (
			<Tag key={contentKey} ref={setRef} {...htmlProps}>
				{children}
			</Tag>
		)
	},
)

OpticalMarginText.displayName = 'OpticalMarginText'
