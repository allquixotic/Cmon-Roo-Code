/**
 * Utility for building Roo Code documentation links.
 *
 * @param path - The path after the docs root (no leading slash)
 * @returns The full docs URL
 */
export function buildDocLink(path: string, _context?: string): string {
	// Remove any leading slash from path
	const cleanPath = path.replace(/^\//, "")
	const [basePath, hash] = cleanPath.split("#")
	const baseUrl = `https://docs.roocode.com/${basePath}`
	return hash ? `${baseUrl}#${hash}` : baseUrl
}
