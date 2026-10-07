// Reproducible README visual capture for optical-margin.
// Serves the repo root over HTTP (so /dist/core.js and the font load with a real origin), opens
// scripts/capture.html in headless Chromium, waits for the effect to apply, and screenshots each scene's
// card at 2x with transparent corners. Output: assets/<scene>.png
//
// Run:  npm run build && npm run capture        (PORT=5968 npm run capture to pick the port)
// Requires Playwright Chromium:  npx playwright install chromium
import { join } from "node:path"
import { serve, loadChromium, PORT, ROOT } from "./harness.mjs"

/** One image per scene: the element to screenshot and the file it is written to. */
const SCENES = [
	{ selector: "#hero", file: "hero-before-after.png" },
	{ selector: "#resize", file: "resize-follows-lines.png" },
]

const server = await serve()
const chromium = await loadChromium()
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1100, height: 900 } })
await page.goto(`http://localhost:${PORT}/scripts/capture.html`, { waitUntil: "networkidle" })
await page.waitForFunction(() => document.documentElement.dataset.ready === "1", { timeout: 15000 })
await page.waitForTimeout(150)

// SEARCH=1 prints, for a range of hero widths, whether both panels break lines alike and what hangs (used to pick the width in capture.html).
if (process.env.SEARCH) {
	for (let width = 640; width <= 860; width += 10) {
		const r = await page.evaluate((w) => window.build(w), width)
		console.log(width, r.sameBreaks ? "same breaks" : "DIFFERENT", `${r.lines.length} lines`, "start:", r.hero.start.join(" "), "| end:", r.hero.end.join(" "))
	}
} else {
	const info = await page.evaluate(() => window.build())
	console.log(`Hero: ${info.lines.length} lines, same line breaks in both panels: ${info.sameBreaks}; hung at line starts: ${info.hero.start.join(" ")}; at line ends: ${info.hero.end.join(" ")}`)
	info.resize.forEach((r, i) => console.log(`Resize column ${i + 1}: hung at line starts: ${r.start.join(" ")}; at line ends: ${r.end.join(" ")}`))
	for (const scene of SCENES) {
		// transparent page background, so the rounded card corners are not boxed in white
		await page.locator(scene.selector).screenshot({ path: join(ROOT, "assets", scene.file), omitBackground: true })
		console.log(`Wrote assets/${scene.file}`)
	}
}

await browser.close()
server.close()
