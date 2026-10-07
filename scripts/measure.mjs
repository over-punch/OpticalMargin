// Measures what the README claims about optical-margin, in headless Chromium against the built bundle (dist/core.js).
// Prints: how far marks hang at line starts and ends (4 fonts x 6 widths, justified), and behaviour checks
// (copy text, hyphenation, soft hyphens, wrapped links, RTL, alignment, resize, hidden elements, timing).
//
// Run:  npm run build && npm run measure        (PORT=5968 npm run measure to pick the port)
import { serve, loadChromium, PORT } from "./harness.mjs"

/** Fonts measured: the repo's Merriweather plus three system fonts (skipped with a note if the machine lacks one). */
const FONTS = ['"Merriweather"', '"Georgia"', '"Helvetica Neue"', '"Times New Roman"']
/** Column widths measured, in px. */
const WIDTHS = [280, 360, 440, 520, 640, 760]

/** Formats a number to two decimals. */
const f2 = (n) => n.toFixed(2)

const server = await serve()
const chromium = await loadChromium()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
page.on("pageerror", (e) => { console.error("Page error:", e); process.exitCode = 1 })
await page.goto(`http://localhost:${PORT}/scripts/measure.html`, { waitUntil: "networkidle" })
await page.waitForFunction(() => document.documentElement.dataset.ready === "1", { timeout: 15000 })

const total = { starts: [], ends: [], lines: 0, overflow: 0, stray: 0, lineCountChanged: 0 }
console.log(`Chromium ${browser.version()} — justified text, 18px, 2 paragraphs, widths ${WIDTHS.join("/")} px`)
for (const font of FONTS) {
	const available = await page.evaluate((fam) => document.fonts.check(`18px ${fam}`), font)
	if (!available) { console.log(`${font}: not available on this machine, skipped`); continue }
	const per = { starts: [], ends: [] }
	for (const width of WIDTHS) {
		const r = await page.evaluate(([fam, w]) => window.measure.sweep(fam, w), [font, width])
		per.starts.push(...r.starts); per.ends.push(...r.ends)
		total.lines += r.lines; total.overflow += r.overflow; total.stray += r.stray; total.lineCountChanged += r.lineCountChanged
	}
	total.starts.push(...per.starts); total.ends.push(...per.ends)
	console.log(`${font}: line starts ${per.starts.filter((s) => s.hung).length}/${per.starts.length} hung, line ends ${per.ends.filter((s) => s.hung).length}/${per.ends.length} hung`)
}

/** Summarises one edge: how many hung, and the range of hang as a share of the mark's width. */
function summary(label, list) {
	const hung = list.filter((s) => s.hung), flush = list.filter((s) => !s.hung)
	const ratios = hung.map((s) => s.ratio)
	const wouldMove = flush.filter((s) => s.movesIfHung).length
	console.log(`${label}: ${list.length} lines, ${hung.length} hung by ${f2(Math.min(...ratios))}–${f2(Math.max(...ratios))} of the mark's width, ${flush.length} left flush (hanging it would move a line break: ${wouldMove}; could have hung: ${flush.length - wouldMove})`)
}
summary("Lines starting with a mark", total.starts)
summary("Lines ending with a mark", total.ends)
console.log(`Lines measured: ${total.lines}; letters past an edge: ${total.overflow}; hangs on a word that is not at its edge: ${total.stray}; paragraphs whose line count changed: ${total.lineCountChanged} of ${FONTS.length * WIDTHS.length * 2}`)

console.log("Checks:", JSON.stringify(await page.evaluate(() => window.measure.checks()), null, "\t"))
console.log("Timing, one paragraph:", JSON.stringify(await page.evaluate(() => window.measure.timing())))
console.log("Timing, the paragraph 10 times over in one element:", JSON.stringify(await page.evaluate(() => window.measure.timing(7, 10))))

await browser.close()
server.close()
