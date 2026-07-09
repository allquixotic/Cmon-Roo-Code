const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF87A_SIGNATURE = "GIF87a"
const GIF89A_SIGNATURE = "GIF89a"
const RIFF_SIGNATURE = "RIFF"
const WEBP_SIGNATURE = "WEBP"
const BMP_SIGNATURE = "BM"
const ICO_SIGNATURE = [0x00, 0x00, 0x01, 0x00]
const TIFF_LE_SIGNATURE = [0x49, 0x49, 0x2a, 0x00]
const TIFF_BE_SIGNATURE = [0x4d, 0x4d, 0x00, 0x2a]
const ISO_BMFF_FILE_TYPE_BOX = "ftyp"
const AVIF_BRANDS = new Set(["avif", "avis"])

function hasBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
	if (bytes.length < offset + signature.length) {
		return false
	}

	return signature.every((value, index) => bytes[offset + index] === value)
}

function hasAscii(bytes: Uint8Array, signature: string, offset = 0): boolean {
	if (bytes.length < offset + signature.length) {
		return false
	}

	for (let i = 0; i < signature.length; i++) {
		if (bytes[offset + i] !== signature.charCodeAt(i)) {
			return false
		}
	}

	return true
}

function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
	if (bytes.length < end) {
		return ""
	}

	return String.fromCharCode(...bytes.slice(start, end))
}

function looksLikeSvg(bytes: Uint8Array): boolean {
	const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 512)).trimStart()
	return (
		sample.startsWith("<svg") ||
		sample.startsWith("<!DOCTYPE svg") ||
		(sample.startsWith("<?xml") && sample.includes("<svg"))
	)
}

export function detectImageMimeType(bytes: Uint8Array): string | undefined {
	if (hasBytes(bytes, PNG_SIGNATURE)) {
		return "image/png"
	}

	if (hasBytes(bytes, JPEG_SIGNATURE)) {
		return "image/jpeg"
	}

	if (hasAscii(bytes, GIF87A_SIGNATURE) || hasAscii(bytes, GIF89A_SIGNATURE)) {
		return "image/gif"
	}

	if (hasAscii(bytes, RIFF_SIGNATURE) && hasAscii(bytes, WEBP_SIGNATURE, 8)) {
		return "image/webp"
	}

	if (hasAscii(bytes, BMP_SIGNATURE)) {
		return "image/bmp"
	}

	if (hasBytes(bytes, ICO_SIGNATURE)) {
		return "image/x-icon"
	}

	if (hasBytes(bytes, TIFF_LE_SIGNATURE) || hasBytes(bytes, TIFF_BE_SIGNATURE)) {
		return "image/tiff"
	}

	if (hasAscii(bytes, ISO_BMFF_FILE_TYPE_BOX, 4) && AVIF_BRANDS.has(asciiSlice(bytes, 8, 12))) {
		return "image/avif"
	}

	if (looksLikeSvg(bytes)) {
		return "image/svg+xml"
	}

	return undefined
}

export function detectBase64ImageMimeType(data: string): string | undefined {
	try {
		return detectImageMimeType(Buffer.from(data, "base64"))
	} catch {
		return undefined
	}
}
