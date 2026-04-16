import i18next from "i18next"

/**
 * Runtime flag for the "Masquerade as Roo Code" setting. The extension host
 * updates this flag whenever the setting is read from the context proxy so
 * that VS Code notifications / error messages emitted via `t(...)` reflect the
 * current branding without requiring a reload.
 */
let masqueradeMode = false

export function setMasqueradeMode(enabled: boolean): void {
	masqueradeMode = enabled
}

export function applyBrandMasquerade(value: string, enabled: boolean = masqueradeMode): string {
	if (!enabled || typeof value !== "string" || value.length === 0) {
		return value
	}
	return value.replace(/\bCRC\b/g, "Roo Code")
}

i18next.use({
	type: "postProcessor",
	name: "brand",
	process: (value: unknown) => {
		if (typeof value !== "string") {
			return value as any
		}
		return applyBrandMasquerade(value)
	},
} as any)

// Build translations object
const translations: Record<string, Record<string, any>> = {}

// Determine if running in test environment
const isTestEnv = process.env.NODE_ENV === "test"

// Load translations based on environment
if (!isTestEnv) {
	try {
		// Dynamic imports to avoid browser compatibility issues
		const fs = require("fs")
		const path = require("path")

		const localesDir = path.join(__dirname, "i18n", "locales")

		try {
			// Find all language directories
			const languageDirs = fs.readdirSync(localesDir, { withFileTypes: true })

			const languages = languageDirs
				.filter(
					(dirent: { isDirectory: () => boolean; name: string }) =>
						dirent.isDirectory() && !dirent.name.startsWith("."),
				)
				.map((dirent: { name: string }) => dirent.name)

			// Process each language
			languages.forEach((language: string) => {
				const langPath = path.join(localesDir, language)

				// Find all JSON files in the language directory
				const files = fs
					.readdirSync(langPath, { withFileTypes: true })
					.filter(
						(dirent: { isFile: () => boolean; name: string }) =>
							dirent.isFile() && dirent.name.endsWith(".json") && !dirent.name.startsWith("."),
					)
					.map((dirent: { name: string }) => dirent.name)

				// Initialize language in translations object
				if (!translations[language]) {
					translations[language] = {}
				}

				// Process each namespace file
				files.forEach((file: string) => {
					const namespace = path.basename(file, ".json")
					const filePath = path.join(langPath, file)

					try {
						// Read and parse the JSON file
						const content = fs.readFileSync(filePath, "utf8")
						translations[language][namespace] = JSON.parse(content)
					} catch (error) {
						console.error(`Error loading translation file ${filePath}:`, error)
					}
				})
			})

			console.log(`Loaded translations for languages: ${Object.keys(translations).join(", ")}`)
		} catch (dirError) {
			console.error(`Error processing directory ${localesDir}:`, dirError)
		}
	} catch (error) {
		console.error("Error loading translations:", error)
	}
}

// Initialize i18next with configuration
i18next.init({
	lng: "en",
	fallbackLng: "en",
	debug: false,
	resources: translations,
	interpolation: {
		escapeValue: false,
	},
	postProcess: ["brand"],
})

export default i18next
