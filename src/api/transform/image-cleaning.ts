import { ApiMessage } from "../../core/task-persistence/apiMessages"

import { ApiHandler } from "../index"
import { detectBase64ImageMimeType } from "../../utils/imageMime"

function normalizeImageBlockMimeType(block: any): any {
	if (block?.type !== "image" || block.source?.type !== "base64" || typeof block.source.data !== "string") {
		return block
	}

	const detectedMimeType = detectBase64ImageMimeType(block.source.data)
	if (!detectedMimeType || detectedMimeType === block.source.media_type) {
		return block
	}

	return {
		...block,
		source: {
			...block.source,
			media_type: detectedMimeType,
		},
	}
}

/* Removes image blocks from messages if they are not supported by the Api Handler */
export function maybeRemoveImageBlocks(messages: ApiMessage[], apiHandler: ApiHandler): ApiMessage[] {
	// Check model capability ONCE instead of for every message
	const supportsImages = apiHandler.getModel().info.supportsImages

	return messages.map((message) => {
		// Handle array content (could contain image blocks).
		let { content } = message
		if (Array.isArray(content)) {
			if (!supportsImages) {
				// Convert image blocks to text descriptions.
				content = content.map((block) => {
					if (block.type === "image") {
						// Convert image blocks to text descriptions.
						// Note: We can't access the actual image content/url due to API limitations,
						// but we can indicate that an image was present in the conversation.
						return {
							type: "text",
							text: "[Referenced image in conversation]",
						}
					}
					return block
				})
			} else {
				content = content.map(normalizeImageBlockMimeType)
			}
		}
		return { ...message, content }
	})
}
