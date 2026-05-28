import { z } from "zod"

import { type AuthService, type ClineMessage, type SettingsService, clineMessageSchema } from "@roo-code/types"

import { getRooCodeApiUrl } from "./config.js"
import type { RetryQueue } from "./retry-queue/index.js"

const TASK_MESSAGE_EVENT_TYPE = "Task Message" as const
const TASK_SYNC_EVENTS_PATH = "events"
const TASK_SYNC_BACKFILL_PATH = "events/backfill"

const taskSyncPayloadSchema = z.object({
	type: z.literal(TASK_MESSAGE_EVENT_TYPE),
	properties: z
		.object({
			taskId: z.string(),
			message: clineMessageSchema,
		})
		.passthrough(),
})

export class TaskSyncClient {
	private retryQueue: RetryQueue | null = null

	constructor(
		private authService: AuthService,
		private settingsService: SettingsService,
		retryQueue?: RetryQueue,
	) {
		this.retryQueue = retryQueue || null
	}

	private isTaskSyncEnabled(): boolean {
		return this.settingsService.isTaskSyncEnabled()
	}

	private async fetch(path: string, options: RequestInit, allowQueueing = true) {
		if (!this.authService.isAuthenticated()) {
			return
		}

		const token = this.authService.getSessionToken()

		if (!token) {
			console.error(`[TaskSyncClient#fetch] Unauthorized: No session token available.`)
			return
		}

		const url = `${getRooCodeApiUrl()}/api/${path}`
		const requestHeaders: Record<string, string> = {}
		if (options.headers instanceof Headers) {
			options.headers.forEach((value, key) => {
				requestHeaders[key] = value
			})
		} else if (Array.isArray(options.headers)) {
			Object.assign(requestHeaders, Object.fromEntries(options.headers))
		} else {
			Object.assign(requestHeaders, (options.headers as Record<string, string> | undefined) ?? {})
		}

		const fetchOptions: RequestInit = {
			...options,
			headers: {
				Authorization: `Bearer ${token}`,
				...requestHeaders,
			},
		}

		if (!(options.body instanceof FormData)) {
			const headers = fetchOptions.headers as Record<string, string>
			const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type")

			if (!hasContentType) {
				headers["Content-Type"] = "application/json"
			}
		}

		try {
			const response = await fetch(url, fetchOptions)

			if (!response.ok) {
				console.error(
					`[TaskSyncClient#fetch] ${options.method} ${path} -> ${response.status} ${response.statusText}`,
				)

				if (this.retryQueue && allowQueueing && (response.status >= 500 || response.status === 429)) {
					await this.retryQueue.enqueue(url, fetchOptions, "task-sync", path)
				}
			}

			return response
		} catch (error) {
			console.error(`[TaskSyncClient#fetch] Network error for ${options.method} ${path}: ${error}`)

			if (
				this.retryQueue &&
				allowQueueing &&
				error instanceof TypeError &&
				error.message.includes("fetch failed")
			) {
				await this.retryQueue.enqueue(url, fetchOptions, "task-sync", path)
			}

			throw error
		}
	}

	public async syncMessage(taskId: string, message: ClineMessage): Promise<void> {
		if (!this.isTaskSyncEnabled()) {
			return
		}

		const payload = {
			type: TASK_MESSAGE_EVENT_TYPE,
			properties: {
				taskId,
				message,
			},
		}

		const result = taskSyncPayloadSchema.safeParse(payload)

		if (!result.success) {
			console.error(`[TaskSyncClient#syncMessage] Invalid task sync payload: ${result.error.message}`)
			return
		}

		try {
			await this.fetch(TASK_SYNC_EVENTS_PATH, {
				method: "POST",
				body: JSON.stringify(result.data),
			})
		} catch (error) {
			console.error(`[TaskSyncClient#syncMessage] Error sending task message sync: ${error}`)
		}
	}

	public async backfillTaskMessages(messages: ClineMessage[], taskId: string): Promise<void> {
		if (!this.isTaskSyncEnabled()) {
			return
		}

		if (!this.authService.isAuthenticated()) {
			return
		}

		const token = this.authService.getSessionToken()

		if (!token) {
			console.error(`[TaskSyncClient#backfillTaskMessages] Unauthorized: No session token available.`)
			return
		}

		try {
			const formData = new FormData()
			formData.append("taskId", taskId)
			formData.append("properties", JSON.stringify({ taskId }))
			formData.append(
				"file",
				new File([JSON.stringify(messages)], "task.json", {
					type: "application/json",
				}),
			)

			const url = `${getRooCodeApiUrl()}/api/${TASK_SYNC_BACKFILL_PATH}`
			const fetchOptions: RequestInit = {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
				},
				body: formData,
			}

			try {
				const response = await fetch(url, fetchOptions)

				if (!response.ok) {
					console.error(
						`[TaskSyncClient#backfillTaskMessages] POST ${TASK_SYNC_BACKFILL_PATH} -> ${response.status} ${response.statusText}`,
					)
				}
			} catch (fetchError) {
				console.error(`[TaskSyncClient#backfillTaskMessages] Network error: ${fetchError}`)
				throw fetchError
			}
		} catch (error) {
			console.error(`[TaskSyncClient#backfillTaskMessages] Error uploading messages: ${error}`)
		}
	}
}
