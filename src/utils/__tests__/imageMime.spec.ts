import { describe, expect, it } from "vitest"

import { detectBase64ImageMimeType, detectImageMimeType } from "../imageMime"

describe("imageMime", () => {
	it("detects JPEG bytes even when the caller expected PNG", () => {
		const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

		expect(detectImageMimeType(bytes)).toBe("image/jpeg")
		expect(detectBase64ImageMimeType(Buffer.from(bytes).toString("base64"))).toBe("image/jpeg")
	})

	it("detects PNG bytes", () => {
		const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

		expect(detectImageMimeType(bytes)).toBe("image/png")
	})

	it("returns undefined for unknown bytes", () => {
		expect(detectImageMimeType(Buffer.from("not an image"))).toBeUndefined()
	})
})
