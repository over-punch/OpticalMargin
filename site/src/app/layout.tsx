import type { Metadata } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import SiteHeader from "../components/SiteHeader"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
	title: "Optical Margin — Font-metric hanging punctuation, cross-browser",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description: "Font-metric hanging punctuation for every browser. Measures each punctuation mark in the rendered font and hangs it into the margin — not a lookup table. Works with any font.",
	keywords: ["optical margin", "hanging punctuation", "typography", "TypeScript", "npm", "cross browser"],
	openGraph: {
		title: "Optical Margin — Font-metric hanging punctuation, cross-browser",
		description: "Hanging punctuation that actually works — measured from font data, not guessed from lookup tables.",
		url: "https://opticalmargin.com",
		siteName: "Optical Margin",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Optical Margin — hanging punctuation for every browser",
		description: "Measures each punctuation mark in the rendered font and applies optical hanging margins — works with any font, no lookup tables.",
		site: "@liiift_studio",
		creator: "@liiift_studio",
	},
	metadataBase: new URL("https://opticalmargin.com"),
	alternates: { canonical: "https://opticalmargin.com" },
}

/** JSON-LD structured data for SoftwareApplication rich result eligibility */
const jsonLd = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	"name": "Optical Margin",
	"operatingSystem": "Any (browser-based)",
	"applicationCategory": "DeveloperApplication",
	"description": "Font-metric hanging punctuation for every browser. Measures each punctuation mark in the rendered font and hangs it into the margin — works with any font.",
	"url": "https://opticalmargin.com",
	"offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`h-full antialiased ${inter.variable}`}>
			<head>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				/>
			</head>
			<body className="min-h-full flex flex-col">
				<SiteHeader current="opticalMargin" githubUrl="https://github.com/over-punch/OpticalMargin" />{children}</body>
		</html>
	)
}
