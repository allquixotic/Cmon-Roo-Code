/**
 * YouTube URL patterns and utilities.
 */

/** Regular expression to match YouTube URLs and extract video ID. */
const YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i

/**
 * Regular expression to extract timestamp from YouTube URLs.
 *
 * Supports:
 * - query params: `t=123`, `t=1h2m3s`, `start=123`, `t=1:23`, `t=1:02:03`
 * - fragment params: `#t=123` (less common but seen in some links)
 */
const TIMESTAMP_REGEX = /(?:[?&#](?:t|start)=)([0-9hms:]+)/i

/**
 * Extracts the video ID from a YouTube URL.
 *
 * @param url - The YouTube URL to parse
 * @returns The video ID or null if not found
 */
export function extractYouTubeVideoId(url: string): string | null {
	const match = url.match(YOUTUBE_URL_REGEX)
	return match?.[1] ?? null
}

/**
 * Parses a YouTube timestamp string to seconds.
 *
 * @param timestamp - The timestamp string
 * @returns The timestamp in seconds
 */
function parseTimestampToSeconds(timestamp: string): number {
	if (/^\d+$/.test(timestamp)) {
		return parseInt(timestamp, 10)
	}

	const colonMatch = timestamp.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
	if (colonMatch) {
		const a = parseInt(colonMatch[1] ?? "0", 10)
		const b = parseInt(colonMatch[2] ?? "0", 10)
		const c = colonMatch[3] ? parseInt(colonMatch[3], 10) : null

		if (c === null) return a * 60 + b
		return a * 3600 + b * 60 + c
	}

	let totalSeconds = 0
	const hours = timestamp.match(/(\d+)h/i)
	const minutes = timestamp.match(/(\d+)m/i)
	const seconds = timestamp.match(/(\d+)s/i)

	if (hours?.[1]) totalSeconds += parseInt(hours[1], 10) * 3600
	if (minutes?.[1]) totalSeconds += parseInt(minutes[1], 10) * 60
	if (seconds?.[1]) totalSeconds += parseInt(seconds[1], 10)

	return totalSeconds
}

/**
 * Extracts the start time (in seconds) from a YouTube URL.
 *
 * @param url - The YouTube URL to parse
 * @returns The start time in seconds or 0 if not found
 */
export function extractYouTubeTimestamp(url: string): number {
	const match = url.match(TIMESTAMP_REGEX)
	if (!match?.[1]) return 0
	return parseTimestampToSeconds(match[1])
}

/**
 * Checks if a URL is a YouTube URL.
 *
 * @param url - The URL to check
 * @returns True if the URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
	return YOUTUBE_URL_REGEX.test(url)
}
