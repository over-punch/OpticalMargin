"use client"

// Interactive demo for optical-margin — toggles hang at start/end, threshold, maxHangRatio, cursor/gyro, and compare
import { useState, useEffect, useDeferredValue, useCallback } from "react"
import { useMediaQuery, useClientValue } from "@/lib/clientValue"
import { OpticalMarginText } from "@liiift-studio/opticalmargin"

const SAMPLE = `"The best typography," wrote Jan Tschichold, "is invisible — it disappears into the reading." That is the paradox of the craft: the more perfectly it is executed, the less it is noticed. Every margin matters. Every spacing decision carries weight. "A quotation mark at the start of a line should hang," Bringhurst insists, "so that the letter, not the punctuation, holds the optical edge." The same applies to commas, dashes, periods — any mark smaller than a full letter. Hung correctly, the margin reads as a clean vertical. Left flush, it creates a slight indent that the eye registers as misalignment, even when the reader cannot name what bothers them. "It is a small thing," one might say — but in typography, every small thing is the thing.`

// Hoisted to module scope — stable reference, no per-render allocation
const SAMPLE_STYLE: React.CSSProperties = {
	fontFamily: "var(--font-merriweather), serif",
	fontSize: "1.125rem",
	lineHeight: "1.8",
	fontVariationSettings: '"wght" 300, "opsz" 18, "wdth" 100',
}

/** Before/after toggle — small icon anchored to bottom-right of the text area */
function BeforeAfterToggle({ active, onClick, overlayId }: { active: boolean; onClick: () => void; overlayId: string }) {
	return (
		<button
			onClick={onClick}
			aria-label={active ? 'Hide before/after comparison' : 'Show before/after comparison'}
			aria-pressed={active}
			aria-controls={overlayId}
			title={active ? 'Hide comparison' : 'Compare without effect'}
			style={{
				position: 'absolute', bottom: 0, right: 0,
				width: 32, height: 32, borderRadius: '50%',
				border: '1px solid currentColor',
				opacity: active ? 0.8 : 0.25,
				background: 'transparent',
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				cursor: 'pointer', transition: 'opacity 0.15s ease',
			}}
		>
			<svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
				<rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1"/>
				<line x1="7" y1="0.5" x2="7" y2="9.5" stroke="currentColor" strokeWidth="1"/>
				<rect x="8" y="1.5" width="5" height="7" fill="currentColor"/>
			</svg>
		</button>
	)
}

/** Cursor arrow icon */
function CursorIcon() {
	return (
		<svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" aria-hidden="true">
			<path d="M0 0L0 11L3 8L5 13L6.8 12.3L4.8 7.3L8.5 7.3Z" />
		</svg>
	)
}

/** Gyroscope icon — circle with rotation arrow */
function GyroIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
			<circle cx="7" cy="7" r="5.5" />
			<circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
			<path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" strokeWidth="1.4" />
			<path d="M11.5 5.5 L12.5 7 L13.8 6" strokeWidth="1.2" />
		</svg>
	)
}

/** Snap a value to the nearest 0.25 step within [0, 3] */
function snapThreshold(v: number): number {
	return Math.round(Math.max(0, Math.min(3, v)) * 4) / 4
}

/** Demo component with live controls for hangStart, hangEnd, threshold, maxHangRatio, cursor/gyro, and compare */
export default function Demo() {
	const [hangStart, setHangStart] = useState(true)
	const [hangEnd, setHangEnd] = useState(true)
	const [threshold, setThreshold] = useState(0.5)
	const [maxHangRatio, setMaxHangRatio] = useState(0.9)
	const [beforeAfter, setComparing] = useState(false)
	const [fontsReady, setFontsReady] = useState(false)
	const [gyroPermissionDenied, setGyroPermissionDenied] = useState(false)

	// Interaction modes — mutually exclusive
	const [cursorMode, setCursorMode] = useState(false)
	const [gyroMode, setGyroMode] = useState(false)

	// Gyro-driven threshold — kept separate so slider value props stay frozen during gyro mode,
	// which prevents mobile browsers from scrolling to the input on each orientation update
	const [gyroThreshold, setGyroThreshold] = useState(0.5)

	// Detected capabilities — read during render via useSyncExternalStore, so there is no
	// post-mount setState cascade. False during SSR/hydration, then the real value.
	const showCursor = useMediaQuery('(hover: hover)')
	const isTouch = useMediaQuery('(hover: none)')
	const hasOrientation = useClientValue(() => 'DeviceOrientationEvent' in window, false)
	const showGyro = isTouch && hasOrientation

	useEffect(() => {
		document.fonts.ready.then(() => setFontsReady(true))
	}, [])

	// Cursor mode — X position controls threshold (0–3, snapped to 0.25 steps)
	useEffect(() => {
		if (!cursorMode) return
		const handleMove = (e: MouseEvent) => {
			setThreshold(snapThreshold((e.clientX / window.innerWidth) * 3))
		}
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setCursorMode(false)
		}
		window.addEventListener('mousemove', handleMove)
		window.addEventListener('keydown', handleKey)
		return () => {
			window.removeEventListener('mousemove', handleMove)
			window.removeEventListener('keydown', handleKey)
		}
	}, [cursorMode])

	// Gyro mode — gamma (left/right tilt) controls gyroThreshold (0–3, snapped to 0.25 steps).
	// rAF throttle limits re-renders to one per frame.
	useEffect(() => {
		if (!gyroMode) return
		let rafId: number | null = null
		const handleOrientation = (e: DeviceOrientationEvent) => {
			if (rafId !== null) return
			rafId = requestAnimationFrame(() => {
				rafId = null
				if (e.gamma !== null) {
					// gamma: -90 (tilt left) to 90 (tilt right) → threshold 0–3
					setGyroThreshold(snapThreshold(((e.gamma + 90) / 180) * 3))
				}
			})
		}
		window.addEventListener('deviceorientation', handleOrientation)
		return () => {
			window.removeEventListener('deviceorientation', handleOrientation)
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [gyroMode])

	// Toggle cursor mode — turns off gyro if active
	const toggleCursor = useCallback(() => {
		setGyroMode(false)
		setCursorMode(v => !v)
	}, [])

	// Toggle gyro mode — requests iOS permission if needed, turns off cursor if active
	const toggleGyro = useCallback(async () => {
		if (gyroMode) {
			setGyroMode(false)
			return
		}
		setCursorMode(false)
		setGyroPermissionDenied(false)
		const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
			requestPermission?: () => Promise<PermissionState>
		}
		if (typeof DOE.requestPermission === 'function') {
			try {
				const permission = await DOE.requestPermission()
				if (permission === 'granted') {
					setGyroMode(true)
				} else {
					setGyroPermissionDenied(true)
				}
			} catch {
				setGyroPermissionDenied(true)
			}
		} else {
			setGyroMode(true)
		}
	}, [gyroMode])

	// Effective threshold: gyro-driven when gyroMode is active, slider-driven otherwise
	const effectiveThreshold = gyroMode ? gyroThreshold : threshold

	const dStart = useDeferredValue(hangStart)
	const dEnd = useDeferredValue(hangEnd)
	const dThreshold = useDeferredValue(effectiveThreshold)
	const dMaxHangRatio = useDeferredValue(maxHangRatio)

	const activeMode = cursorMode || gyroMode

	// Stable IDs for aria-controls associations
	const overlayId = "om-before-after-overlay"
	const thresholdReadbackId = "om-threshold-value"
	const maxHangReadbackId = "om-maxhang-value"

	return (
		<div className="w-full min-w-0">
			<div className="flex flex-wrap items-center gap-3 mb-8 min-w-0">
				<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Hang</span>
				<button
					onClick={() => setHangStart(v => !v)}
					aria-pressed={hangStart}
					title={hangStart ? 'Disable hanging at the start margin — opening quotes will align flush with the text edge' : 'Enable hanging at the start margin — opening quotes protrude left so letters hold the optical edge'}
					className="text-xs px-3 py-1 rounded-full border transition-opacity"
					style={{ borderColor: 'currentColor', opacity: hangStart ? 1 : 0.5, background: hangStart ? 'var(--btn-bg)' : 'transparent' }}
				>
					Start (opening quotes)
				</button>
				<button
					onClick={() => setHangEnd(v => !v)}
					aria-pressed={hangEnd}
					title={hangEnd ? 'Disable hanging at the end margin — closing quotes and commas will align flush with the text edge' : 'Enable hanging at the end margin — closing quotes, commas, and periods protrude right so letters hold the optical edge'}
					className="text-xs px-3 py-1 rounded-full border transition-opacity"
					style={{ borderColor: 'currentColor', opacity: hangEnd ? 1 : 0.5, background: hangEnd ? 'var(--btn-bg)' : 'transparent' }}
				>
					End (closing quotes, commas)
				</button>

				{/* Prominent compare button — labeled, same style as hang toggles */}
				<button
					onClick={() => setComparing(v => !v)}
					aria-pressed={beforeAfter}
					aria-controls={overlayId}
					title={beforeAfter ? 'Hide the unprocessed text overlay' : 'Overlay the original flush text to compare it against the optically-aligned version'}
					className="text-xs px-3 py-1 rounded-full border transition-opacity"
					style={{ borderColor: 'currentColor', opacity: beforeAfter ? 1 : 0.5, background: beforeAfter ? 'var(--btn-bg)' : 'transparent' }}
				>
					{beforeAfter ? 'Hide compare' : 'Compare'}
				</button>

				<div className="flex flex-col gap-1 ml-4 min-w-32">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted" id="om-threshold-label">Threshold (px)</span>
					<input
						type="range"
						min={0}
						max={3}
						step={0.25}
						value={threshold}
						disabled={cursorMode}
						aria-label="Threshold (px)"
						aria-labelledby="om-threshold-label"
						aria-valuetext={`${effectiveThreshold} px`}
						aria-describedby={thresholdReadbackId}
						title="Minimum computed hang value in px. Characters whose hang falls below this are left flush. Lower values hang more characters; higher values hang fewer."
						onChange={e => setThreshold(Number(e.target.value))}
						onTouchStart={e => e.stopPropagation()}
						style={{ touchAction: 'pan-y', opacity: cursorMode ? 0.35 : 1 }}
					/>
					<span id={thresholdReadbackId} className="tabular-nums text-xs text-muted text-right" aria-live="polite">{effectiveThreshold}</span>
				</div>
				<div className="flex flex-col gap-1 ml-4 min-w-32">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted" id="om-maxhang-label">Max Hang Ratio</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={maxHangRatio}
						aria-label="Max Hang Ratio"
						aria-labelledby="om-maxhang-label"
						aria-valuetext={maxHangRatio.toFixed(2)}
						aria-describedby={maxHangReadbackId}
						title="Maximum fraction of a glyph's width that may protrude beyond the margin. 1.0 allows a full hang; 0.5 caps the overhang at half the glyph width, keeping very wide marks partially in-column."
						onChange={e => setMaxHangRatio(Number(e.target.value))}
						onTouchStart={e => e.stopPropagation()}
						style={{ touchAction: 'pan-y' }}
					/>
					<span id={maxHangReadbackId} className="tabular-nums text-xs text-muted text-right" aria-live="polite">{maxHangRatio.toFixed(2)}</span>
				</div>

				{/* Cursor mode — desktop/hover-capable devices only */}
				{showCursor && (
					<button
						onClick={toggleCursor}
						aria-pressed={cursorMode}
						title="Move your cursor left/right to adjust threshold"
						className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all"
						style={{
							borderColor: 'currentColor',
							opacity: cursorMode ? 1 : 0.5,
							background: cursorMode ? 'var(--btn-bg)' : 'transparent',
						}}
					>
						<CursorIcon />
						<span>{cursorMode ? 'Esc to exit' : 'Cursor'}</span>
					</button>
				)}

				{/* Gyro mode — touch devices with DeviceOrientationEvent */}
				{showGyro && (
					<button
						onClick={toggleGyro}
						aria-pressed={gyroMode}
						title={gyroPermissionDenied ? 'Motion permission denied — reload the page to try again' : 'Tilt your device left/right to adjust threshold'}
						className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all"
						style={{
							borderColor: 'currentColor',
							opacity: gyroMode ? 1 : 0.5,
							background: gyroMode ? 'var(--btn-bg)' : 'transparent',
						}}
					>
						<GyroIcon />
						<span>{gyroMode ? 'Tilt active' : gyroPermissionDenied ? 'Permission denied' : 'Tilt'}</span>
					</button>
				)}
			</div>

			<div className="relative pb-8">
				<OpticalMarginText
					key={String(fontsReady)}
					hangStart={dStart}
					hangEnd={dEnd}
					threshold={dThreshold}
					maxHangRatio={dMaxHangRatio}
					style={{ ...SAMPLE_STYLE, opacity: fontsReady ? 1 : 0, transition: 'opacity 0.2s ease' }}
				>
					{SAMPLE}
				</OpticalMarginText>
				<p
					id={overlayId}
					aria-hidden="true"
					style={{ ...SAMPLE_STYLE, position: 'absolute', top: 0, left: 0, width: '100%', margin: 0, opacity: beforeAfter ? 0.45 : 0, pointerEvents: 'none', transition: 'opacity 0.3s ease' }}
				>
					{SAMPLE}
				</p>
				<BeforeAfterToggle active={beforeAfter} onClick={() => setComparing(v => !v)} overlayId={overlayId} />
			</div>

			<p className="text-xs text-muted italic mt-8" style={{ lineHeight: "1.8" }} aria-live="polite">
				{activeMode
					? cursorMode
						? 'Move cursor left/right to adjust threshold. Press Esc to exit.'
						: 'Tilt left/right to adjust threshold.'
					: hangStart && hangEnd
						? 'Punctuation hangs at both margins.'
						: hangStart
							? 'Punctuation hangs at the start margin only.'
							: hangEnd
								? 'Punctuation hangs at the end margin only.'
								: 'Optical margin disabled — punctuation is flush.'
				}
			</p>
		</div>
	)
}
