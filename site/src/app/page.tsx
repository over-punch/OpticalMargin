import Demo from "@/components/Demo"
import Hero from "@/components/Hero"
import CodeBlock from "@/components/CodeBlock"
import { version } from "../../../package.json"
import { version as siteVersion } from "../../package.json"
import SiteFooter from "../components/SiteFooter"
import PortsSection from "../components/PortsSection"

export default function Home() {
	return (
		<main className="flex flex-col items-center px-6 py-20 gap-24">

			{/* Hero */}
			<Hero
				eyebrow="optical margin alignment"
				title={[{ text: "Hang it right." }, { text: "Every font.", italic: true, subtle: true }]}
				install="@overpunch/opticalmargin"
				github="https://github.com/over-punch/OpticalMargin"
				tech={["TypeScript", "Font-metric measurement", "Cross-browser"]}
			>
				<p className="text-base leading-relaxed max-w-lg">
					CSS <code className="text-xs font-mono">hanging-punctuation</code> is Safari-only and gives no control over how far a mark hangs. Optical Margin measures each punctuation character&rsquo;s width in the rendered font and hangs a set fraction of it into the margin. Works in every browser, with every font.
				</p>
			</Hero>

			{/* Demo */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-4">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Live demo — toggle the hangs, change the alignment, resize the column</h2>
				<div className="rounded-xl -mx-6 px-6 sm:-mx-8 sm:px-8 py-8" style={{ background: "var(--panel)", overflow: 'visible' }}>
					<Demo />
				</div>
			</section>

			{/* Explanation */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Why not CSS?</h2>
				<div className="prose-grid grid grid-cols-1 sm:grid-cols-2 gap-12 text-sm leading-relaxed">
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">hanging-punctuation is incomplete</p>
						<p>The CSS property is Safari-only. It doesn&rsquo;t let you control hang amount, threshold, or which characters hang: a fixed list of marks hangs by its whole width, in every font.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Font-metric measurement</p>
						<p>A mark that starts or ends a line is measured where it sits on the page, in the rendered font &mdash; size, variation settings and letter-spacing included. A set fraction of that width hangs into the margin: dashes fully, quotes and periods at 80%, commas at 60%. The fractions are adjustable per character.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">The text stays one flow</p>
						<p>Lines are never locked. Words that begin or end with a hangable mark are wrapped in place in a plain span, and the browser keeps breaking lines as usual &mdash; so hyphenation and <code className="text-xs font-mono">&amp;shy;</code> keep working, a link that wraps stays one link, and copy-paste gives the original text. Resize the column and the hangs move to the marks that now start or end a line.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Aligned edges only</p>
						<p>Opening marks hang at the start edge of left-aligned and justified text; closing marks hang at the end edge of right-aligned and justified text. A ragged edge has nothing to align, so it is left alone. A mark whose hang would pull its word up to the line above is left flush.</p>
					</div>
				</div>
			</section>

			{/* Usage */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex items-baseline gap-4">
					<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Usage</h2>
					<p className="text-xs text-muted tracking-wide">TypeScript + React · Vanilla JS</p>
				</div>
				<div className="flex flex-col gap-8 text-sm">
					<div className="flex flex-col gap-3">
						<p className="text-muted">Drop-in component</p>
						<CodeBlock code={`import { OpticalMarginText } from '@overpunch/opticalmargin'

<OpticalMarginText hangStart={true} hangEnd={true}>
  "Your paragraph text here..."
</OpticalMarginText>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Hook</p>
						<CodeBlock code={`import { useOpticalMargin } from '@overpunch/opticalmargin'

const ref = useOpticalMargin({ hangStart: true, hangEnd: true })
<p ref={ref}>{children}</p>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Vanilla JS</p>
						<CodeBlock code={`import { applyOpticalMargin, removeOpticalMargin, getCleanHTML } from '@overpunch/opticalmargin'

const el = document.querySelector('p')
const original = getCleanHTML(el)
applyOpticalMargin(el, original, { hangStart: true, hangEnd: true })

// Later — restore original:
removeOpticalMargin(el, original)`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Options</p>
						<table className="w-full text-xs">
							<caption className="sr-only">applyOpticalMargin API options</caption>
							<thead>
								<tr className="text-subtle text-left">
									<th className="pb-2 pr-6 font-normal">Option</th>
									<th className="pb-2 pr-6 font-normal">Default</th>
									<th className="pb-2 font-normal">Description</th>
								</tr>
							</thead>
							<tbody className="text-muted zebra">
								<tr className="hover:bg-foreground/5 transition-colors">
									<td className="py-2 pr-6 font-mono">hangStart</td>
									<td className="py-2 pr-6">true</td>
									<td className="py-2">Hang opening punctuation at line starts. Shows on start-aligned and justified text.</td>
								</tr>
								<tr className="hover:bg-foreground/5 transition-colors">
									<td className="py-2 pr-6 font-mono">hangEnd</td>
									<td className="py-2 pr-6">true</td>
									<td className="py-2">Hang closing punctuation and sentence-end marks at line ends. Shows on justified and end-aligned text.</td>
								</tr>
								<tr className="hover:bg-foreground/5 transition-colors">
									<td className="py-2 pr-6 font-mono">threshold</td>
									<td className="py-2 pr-6">0.5</td>
									<td className="py-2">Minimum computed hang value in px. Characters whose hang falls below this are left flush.</td>
								</tr>
								<tr className="hover:bg-foreground/5 transition-colors">
									<td className="py-2 pr-6 font-mono">maxHangRatio</td>
									<td className="py-2 pr-6">0.9</td>
									<td className="py-2">Max proportion of advance width to hang (0–1).</td>
								</tr>
								<tr className="hover:bg-foreground/5 transition-colors">
									<td className="py-2 pr-6 font-mono">hangFractions</td>
									<td className="py-2 pr-6">see desc.</td>
									<td className="py-2">Per-character hang fraction overrides (0–1). Built-in defaults: hyphens &amp; dashes 1.0; quotes, periods, !, ?, &hellip;, ), ] 0.8; (, [, commas, semicolons, colons 0.6. Pass your own map to override any character.</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<PortsSection
				npm="@overpunch/opticalmargin"
				bundle="opticalmargin"
				attr="data-opticalmargin" figma="partial"
				framerComponent="OpticalMargin"
				repo="over-punch/OpticalMargin"
			/>

			<SiteFooter current="opticalMargin" npmVersion={version} siteVersion={siteVersion} />

		</main>
	)
}
