import { useMemo } from "react"

import { useExtensionState } from "@src/context/ExtensionStateContext"

/**
 * Pure transformer that swaps the standalone "CRC" token for "Roo Code" when
 * the `masqueradeAsRooCode` setting is enabled.
 *
 * Uses a word-boundary anchor (`\b`) so that embedded occurrences such as
 * `CRCStorage` or `OCRCatalog` remain untouched.
 */
export function applyBrandMasquerade(value: string, masquerade: boolean): string {
	if (!masquerade || typeof value !== "string" || value.length === 0) {
		return value
	}
	return value.replace(/\bCRC\b/g, "Roo Code")
}

/**
 * React hook that returns a branded version of the supplied label.
 *
 * Use it for labels that live outside the i18n pipeline (for example,
 * static provider labels in `constants.ts`) so they still respect the
 * "Masquerade as Roo Code" setting.
 */
export function useBrandedLabel(label: string | undefined): string | undefined {
	const { masqueradeAsRooCode } = useExtensionState()
	return useMemo(
		() => (typeof label === "string" ? applyBrandMasquerade(label, !!masqueradeAsRooCode) : label),
		[label, masqueradeAsRooCode],
	)
}
