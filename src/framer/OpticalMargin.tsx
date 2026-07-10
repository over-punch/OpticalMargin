// opticalMargin/src/framer/OpticalMargin.tsx — Framer code component wrapping the opticalMargin core.
//
// Distribution: paste this file into Framer (Insert → Code → New Component), or host it as an
// ES module and add it by URL. It imports the framework-agnostic core straight from the CDN, so
// it needs no build step — the core functions take a DOM element, not React, so there is no
// React version/externalisation issue.
//
// The rendering logic mirrors the already-proven `useOpticalMargin` hook (applyOpticalMargin in an
// effect against a getCleanHTML snapshot). optical-margin is an APPLY-ONCE tool — it hangs
// punctuation into the margins in a single measure-and-write pass, with no rAF animation loop.
// Because its output depends on the container's rendered width (line boundaries are detected from
// layout), a ResizeObserver re-applies when the box is resized. The only Framer-specific additions
// are the property controls and layout annotations.
import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"
// Pin to a published version so shared instances stay stable. Bump when the core changes.
// The core is framework-agnostic (operates on a DOM element), so no React externalisation is needed.
import { applyOpticalMargin, getCleanHTML } from "https://esm.sh/@liiift-studio/opticalmargin@1.0.18"

/** Props surfaced to the Framer UI via addPropertyControls, plus base text styling.
 *  Option fields are declared explicitly so the component needs no type import over HTTP. */
interface OpticalMarginFramerProps {
	/** The text to align (punctuation at line starts/ends is hung into the margin). */
	text: string
	/** CSS font-family — a serif with generous punctuation side-bearings shows the effect best. */
	fontFamily: string
	/** Font size in px. */
	fontSize: number
	/** Text colour. */
	color: string
	/** Horizontal text alignment. */
	textAlign: "left" | "center" | "right"
	/** Hang opening punctuation (quotes, brackets) at line starts. */
	hangStart: boolean
	/** Hang closing punctuation and sentence-end marks at line ends. */
	hangEnd: boolean
	/** Minimum hang amount in px before a margin adjustment is applied. */
	threshold: number
	/** Max proportion (0–1) of a character's advance width allowed to hang. */
	maxHangRatio: number
}

/**
 * Font-metric hanging punctuation (optical margin alignment), as a Framer code component.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function OpticalMargin(props: Partial<OpticalMarginFramerProps>) {
	const {
		text = "“Typography is the craft of endowing human language with a durable visual form,” wrote Robert Bringhurst — and the margin is where that form breathes.",
		fontFamily = "Fraunces",
		fontSize = 40,
		color = "#111111",
		textAlign = "left",
		hangStart = true,
		hangEnd = true,
		threshold = 0.5,
		maxHangRatio = 0.9,
	} = props

	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = ref.current
		if (!el) return

		const options = { hangStart, hangEnd, threshold, maxHangRatio }
		// Snapshot the clean, un-hung HTML once so every re-apply starts from the same source.
		const original = getCleanHTML(el)

		// Apply-once: measure glyph bounds and write margin adjustments. No animation loop.
		applyOpticalMargin(el, original, options)

		// Output depends on rendered width — re-apply when the container is resized so line
		// boundaries (and therefore which characters hang) stay correct.
		let observer: ResizeObserver | undefined
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => {
				applyOpticalMargin(el, original, options)
			})
			observer.observe(el)
		}

		return () => {
			observer?.disconnect()
			el.innerHTML = original
		}
	}, [text, fontFamily, fontSize, textAlign, hangStart, hangEnd, threshold, maxHangRatio])

	return (
		<div
			ref={ref}
			style={{
				fontFamily,
				fontSize,
				color,
				textAlign,
				lineHeight: 1.35,
				width: "100%",
			}}
		>
			{text}
		</div>
	)
}

// Map every meaningful OpticalMarginOptions field to a Framer control.
// Omitted: `hangFractions` (a Record<string, number> of per-character overrides) — a free-form
// keyed map has no single native ControlType, so it is left at its editorial defaults.
addPropertyControls(OpticalMargin, {
	text: {
		type: ControlType.String,
		title: "Text",
		defaultValue:
			"“Typography is the craft of endowing human language with a durable visual form,” wrote Robert Bringhurst — and the margin is where that form breathes.",
		displayTextArea: true,
	},
	fontFamily: {
		type: ControlType.String,
		title: "Font",
		defaultValue: "Fraunces",
		description: "A serif with generous punctuation side-bearings shows hanging best.",
	},
	fontSize: { type: ControlType.Number, title: "Size", defaultValue: 40, min: 8, max: 400, unit: "px" },
	color: { type: ControlType.Color, title: "Colour", defaultValue: "#111111" },
	textAlign: {
		type: ControlType.Enum,
		title: "Align",
		options: ["left", "center", "right"],
		optionTitles: ["Left", "Center", "Right"],
		defaultValue: "left",
		displaySegmentedControl: true,
	},
	hangStart: { type: ControlType.Boolean, title: "Hang start", defaultValue: true, enabledTitle: "On", disabledTitle: "Off" },
	hangEnd: { type: ControlType.Boolean, title: "Hang end", defaultValue: true, enabledTitle: "On", disabledTitle: "Off" },
	threshold: {
		type: ControlType.Number,
		title: "Threshold",
		defaultValue: 0.5,
		min: 0,
		max: 5,
		step: 0.1,
		unit: "px",
		description: "Minimum hang before a margin is applied.",
	},
	maxHangRatio: {
		type: ControlType.Number,
		title: "Max hang",
		defaultValue: 0.9,
		min: 0,
		max: 1,
		step: 0.05,
		description: "Cap as a fraction of the character advance width.",
	},
})
