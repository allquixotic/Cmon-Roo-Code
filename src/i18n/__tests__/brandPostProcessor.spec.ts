import { describe, it, expect, beforeEach } from "vitest"

import i18next, { setMasqueradeMode, applyBrandMasquerade } from "../setup"

describe("extension-host brand masquerade", () => {
	beforeEach(() => {
		setMasqueradeMode(false)
		i18next.addResourceBundle(
			"en",
			"brandTest",
			{
				auth: "Sign in to CRC Cloud to continue",
				storage: "Default path: D:\\CRCStorage",
			},
			true,
			true,
		)
	})

	it("pure transform leaves input unchanged when flag is off", () => {
		expect(applyBrandMasquerade("Welcome to CRC!", false)).toBe("Welcome to CRC!")
	})

	it("pure transform swaps standalone CRC tokens", () => {
		expect(applyBrandMasquerade("Welcome to CRC!", true)).toBe("Welcome to Roo Code!")
	})

	it("i18next output is branded when masquerade is on", () => {
		setMasqueradeMode(true)
		expect(i18next.t("brandTest:auth")).toBe("Sign in to Roo Code Cloud to continue")
	})

	it("i18next output preserves embedded CRC occurrences", () => {
		setMasqueradeMode(true)
		expect(i18next.t("brandTest:storage")).toBe("Default path: D:\\CRCStorage")
	})

	it("toggling off restores the original translation", () => {
		setMasqueradeMode(true)
		setMasqueradeMode(false)
		expect(i18next.t("brandTest:auth")).toBe("Sign in to CRC Cloud to continue")
	})
})
