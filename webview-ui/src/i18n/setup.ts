import i18next from "i18next"
import { initReactI18next } from "react-i18next"

/**
 * "Masquerade as Roo Code" runtime flag.
 *
 * When enabled, the `brand` post-processor replaces any standalone "CRC" token
 * in a translated string with "Roo Code". The flag is module-local so that the
 * post-processor itself remains a pure string transformer; the value is kept in
 * sync with the global setting by `TranslationContext`, which calls
 * `setMasqueradeMode(...)` whenever the user toggles the checkbox.
 */
let masqueradeMode = false

export function setMasqueradeMode(enabled: boolean): void {
	masqueradeMode = enabled
}

export function isMasqueradeMode(): boolean {
	return masqueradeMode
}

/**
 * Pure transformer used by both the i18next post-processor and any
 * non-translation code paths (e.g. labels pulled from `constants.ts`).
 */
export function applyBrandMasquerade(value: string, enabled: boolean = masqueradeMode): string {
	if (!enabled || typeof value !== "string" || value.length === 0) {
		return value
	}
	// Replace the standalone "CRC" token only. `\b` keeps embedded occurrences
	// (e.g. "CRCStorage" in example paths) untouched and leaves other words alone.
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

// Dynamically load locale files
const localeFiles = import.meta.glob("./locales/**/*.json", { eager: true })

// Process all locale files
Object.entries(localeFiles).forEach(([path, module]) => {
	// Extract language and namespace from path
	// Example path: './locales/en/common.json' -> language: 'en', namespace: 'common'
	const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json/)

	if (match) {
		const [, language, namespace] = match

		// Initialize language object if it doesn't exist
		if (!translations[language]) {
			translations[language] = {}
		}

		// Add namespace resources to language
		translations[language][namespace] = (module as any).default || module
	}
})

console.log("Dynamically loaded translations:", Object.keys(translations))

// Initialize i18next for React
// This will be initialized with the VSCode language in TranslationProvider
i18next.use(initReactI18next).init({
	lng: "en", // Default language (will be overridden)
	fallbackLng: "en",
	debug: false,
	interpolation: {
		escapeValue: false, // React already escapes by default
	},
	postProcess: ["brand"],
})

export function loadTranslations() {
	Object.entries(translations).forEach(([lang, namespaces]) => {
		try {
			Object.entries(namespaces).forEach(([namespace, resources]) => {
				i18next.addResourceBundle(lang, namespace, resources, true, true)
			})
		} catch (error) {
			console.warn(`Could not load ${lang} translations:`, error)
		}
	})
}

export default i18next
