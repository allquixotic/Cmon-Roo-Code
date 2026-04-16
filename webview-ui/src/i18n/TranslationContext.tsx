import React, { createContext, useContext, ReactNode, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import i18next, { loadTranslations, setMasqueradeMode } from "./setup"
import { useExtensionState } from "@/context/ExtensionStateContext"

// Create context for translations
export const TranslationContext = createContext<{
	t: (key: string, options?: Record<string, any>) => string
	i18n: typeof i18next
}>({
	t: (key: string) => key,
	i18n: i18next,
})

// Translation provider component
export const TranslationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	// Initialize with default configuration
	const { i18n } = useTranslation()
	// Get the extension state directly - it already contains all state properties
	const extensionState = useExtensionState()

	// Load translations once when the component mounts
	useEffect(() => {
		try {
			loadTranslations()
		} catch (error) {
			console.error("Failed to load translations:", error)
		}
	}, [])

	useEffect(() => {
		i18n.changeLanguage(extensionState.language)
	}, [i18n, extensionState.language])

	// Keep the i18next brand post-processor in sync with the "Masquerade as Roo Code"
	// setting. We re-emit `languageChanged` so that every consumer of
	// `useTranslation` / `<Trans>` re-renders with the updated post-processor output.
	const masqueradeAsRooCode = extensionState.masqueradeAsRooCode ?? false
	useEffect(() => {
		setMasqueradeMode(masqueradeAsRooCode)
		try {
			;(i18n as unknown as { emit?: (event: string, ...args: any[]) => void }).emit?.(
				"languageChanged",
				i18n.language,
			)
		} catch {
			// non-fatal: some i18next builds may not expose `emit`
		}
		if (typeof document !== "undefined") {
			document.title = masqueradeAsRooCode ? "Roo Code" : "CRC"
		}
	}, [masqueradeAsRooCode, i18n])

	// Memoize the translation function to prevent unnecessary re-renders
	const translate = useCallback(
		(key: string, options?: Record<string, any>) => {
			return i18n.t(key, options)
		},
		[i18n],
	)

	return (
		<TranslationContext.Provider
			value={{
				t: translate,
				i18n,
			}}>
			{children}
		</TranslationContext.Provider>
	)
}

// Custom hook for easy translations
export const useAppTranslation = () => useContext(TranslationContext)

export default TranslationProvider
