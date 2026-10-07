// Shared helpers for the README harnesses (capture.mjs, measure.mjs): a static server over the repo root and a Playwright loader.
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

/** Repo root (the folder above scripts/). */
export const ROOT = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."))

/** Port the harness serves on; set PORT to avoid a clash when several repos capture at once. */
export const PORT = Number(process.env.PORT) || 4319

/** MIME types for the files the harness pages load. */
const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".json": "application/json; charset=utf-8",
}

/** Serves files from the repo root over HTTP (ES modules and fonts need an origin). Resolves with the server once it listens. */
export async function serve() {
	const server = createServer(async (req, res) => {
		try {
			const urlPath = decodeURIComponent((req.url || "/").split("?")[0])
			const filePath = normalize(join(ROOT, urlPath))
			if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return }
			const body = await readFile(filePath)
			res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" })
			res.end(body)
		} catch {
			res.writeHead(404).end("not found")
		}
	})
	await new Promise((resolve, reject) => { server.once("error", reject); server.listen(PORT, resolve) })
	return server
}

/** Loads Playwright's chromium: from this repo if installed, else from the type-tools parent checkout (sibling axisRhythm). */
export async function loadChromium() {
	try {
		return (await import("playwright")).chromium
	} catch {
		const require = createRequire(join(ROOT, "..", "axisRhythm", "package.json"))
		return require("playwright").chromium
	}
}
