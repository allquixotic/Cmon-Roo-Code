import { describe, it, expect, beforeEach } from "vitest"

import i18next, { setMasqueradeMode, applyBrandMasquerade, isMasqueradeMode } from "../setup"

describe("applyBrandMasquerade", () => {
	it("returns the input unchanged when masquerade is off", () => {
		expect(applyBrandMasquerade("Welcome to CRC!", false)).toBe("Welcome to CRC!")
	})

	it("swaps a standalone CRC token for Roo Code when on", () => {
		expect(applyBrandMasquerade("Welcome to CRC!", true)).toBe("Welcome to Roo Code!")
	})

	it("replaces every occurrence", () => {
		expect(applyBrandMasquerade("CRC Cloud and CRC Router", true)).toBe("Roo Code Cloud and Roo Code Router")
	})

	it("does not touch embedded occurrences like CRCStorage", () => {
		expect(applyBrandMasquerade("D:\\\\CRCStorage", true)).toBe("D:\\\\CRCStorage")
	})

	it("ignores non-string values", () => {
		// @ts-expect-error intentionally passing a non-string
		expect(applyBrandMasquerade(undefined, true)).toBe(undefined)
	})
})

describe("i18next brand post-processor", () => {
	beforeEach(() => {
		setMasqueradeMode(false)
		i18next.addResourceBundle(
			"en",
			"brandTest",
			{
				welcome: "Welcome to CRC!",
				cloud: "Sign in to CRC Cloud",
				path: "Example path: D:\\CRCStorage",
			},
			true,
			true,
		)
	})

	it("leaves translations untouched when masquerade is off", () => {
		expect(i18next.t("brandTest:welcome")).toBe("Welcome to CRC!")
		expect(i18next.t("brandTest:cloud")).toBe("Sign in to CRC Cloud")
	})

	it("rewrites standalone CRC tokens when masquerade is on", () => {
		setMasqueradeMode(true)
		expect(isMasqueradeMode()).toBe(true)
		expect(i18next.t("brandTest:welcome")).toBe("Welcome to Roo Code!")
		expect(i18next.t("brandTest:cloud")).toBe("Sign in to Roo Code Cloud")
	})

	it("preserves embedded CRC occurrences even in masquerade", () => {
		setMasqueradeMode(true)
		expect(i18next.t("brandTest:path")).toBe("Example path: D:\\CRCStorage")
	})

	it("can be toggled back off", () => {
		setMasqueradeMode(true)
		setMasqueradeMode(false)
		expect(i18next.t("brandTest:welcome")).toBe("Welcome to CRC!")
	})
})
