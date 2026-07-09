import path from "path"
import * as fs from "fs/promises"
import * as os from "os"

import { afterEach, describe, expect, it } from "vitest"

import { readImageAsDataUrlWithBuffer } from "../imageHelpers"

describe("imageHelpers", () => {
	let tempDir: string | undefined

	afterEach(async () => {
		if (tempDir) {
			await fs.rm(tempDir, { recursive: true, force: true })
			tempDir = undefined
		}
	})

	it("labels image data URLs using detected bytes before the file extension", async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zoo-image-helper-"))
		const mislabeledPngPath = path.join(tempDir, "ssm-screenshot.png")
		const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
		await fs.writeFile(mislabeledPngPath, jpegBytes)

		const result = await readImageAsDataUrlWithBuffer(mislabeledPngPath)

		expect(result.dataUrl).toBe(`data:image/jpeg;base64,${jpegBytes.toString("base64")}`)
		expect(result.buffer).toEqual(jpegBytes)
	})
})
