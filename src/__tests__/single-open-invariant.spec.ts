// npx vitest run __tests__/single-open-invariant.spec.ts

import { beforeEach, describe, expect, it, vi } from "vitest"

import { ClineProvider } from "../core/webview/ClineProvider"
import { API } from "../extension/api"
import * as ProfileValidatorMod from "../shared/ProfileValidator"
import { defaultModeSlug } from "../shared/modes"

vi.mock("../core/task/Task", () => {
	class TaskStub {
		public taskId: string
		public instanceId = "inst"
		public parentTask?: any
		public parentTaskId?: string
		public rootTask?: any
		public rootTaskId?: string
		public apiConfiguration: any
		public metadata: any
		public clineMessages: any[] = []
		public apiConversationHistory: any[] = []
		public todoList: any[] = []
		public taskStatus = "running"
		public queuedMessages: any[] = []
		public messageQueueService = { messages: [] as any[] }
		private _taskApiConfigName?: string

		constructor(opts: any) {
			this.taskId = opts.historyItem?.id ?? `task-${Math.random().toString(36).slice(2, 8)}`
			this.parentTask = opts.parentTask
			this.parentTaskId = opts.historyItem?.parentTaskId ?? opts.parentTask?.taskId
			this.rootTask = opts.rootTask
			this.rootTaskId = opts.historyItem?.rootTaskId ?? opts.rootTask?.taskId
			this.apiConfiguration = opts.apiConfiguration ?? { apiProvider: "anthropic" }
			this.metadata = { task: opts.historyItem?.task ?? opts.task }
			this._taskApiConfigName = opts.historyItem?.apiConfigName
			opts.onCreated?.(this)
		}

		start() {}
		on() {}
		off() {}
		emit() {}
		getTaskMode() {
			return Promise.resolve(defaultModeSlug)
		}
		getTaskApiConfigName() {
			return Promise.resolve(this._taskApiConfigName ?? "default")
		}
		setTaskApiConfigName(name: string | undefined) {
			this._taskApiConfigName = name
		}
	}

	return { Task: TaskStub }
})

describe("Multi-conversation provider behavior", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it("createTask keeps existing live tasks instead of closing them", async () => {
		vi.spyOn(ProfileValidatorMod.ProfileValidator, "isProfileAllowed").mockReturnValue(true)

		const removeClineFromStack = vi.fn().mockResolvedValue(undefined)
		const addClineToStack = vi.fn().mockResolvedValue(undefined)

		const provider = {
			clineStack: [{ taskId: "existing-1" }],
			taskHistoryStore: { getAll: vi.fn().mockReturnValue([{ id: "existing-1" }]) },
			setValues: vi.fn(),
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: { apiProvider: "anthropic", consecutiveMistakeLimit: 0 },
				organizationAllowList: "*",
				enableCheckpoints: true,
				checkpointTimeout: 60,
				experiments: {},
				cloudUserInfo: null,
			}),
			removeClineFromStack,
			addClineToStack,
			setProviderProfile: vi.fn(),
			log: vi.fn(),
			getStateToPostToWebview: vi.fn(),
			providerSettingsManager: { getModeConfigId: vi.fn(), listConfig: vi.fn() },
			customModesManager: { getCustomModes: vi.fn().mockResolvedValue([]) },
			taskCreationCallback: vi.fn(),
			contextProxy: {
				extensionUri: {},
				setValue: vi.fn(),
				getValue: vi.fn(),
				setProviderSettings: vi.fn(),
				getProviderSettings: vi.fn(() => ({})),
			},
		} as unknown as ClineProvider

		await (ClineProvider.prototype as any).createTask.call(provider, "New task")

		expect(removeClineFromStack).not.toHaveBeenCalled()
		expect(addClineToStack).toHaveBeenCalledTimes(1)
	})

	it("Subtask create: keeps existing task open when parentTask is provided", async () => {
		vi.spyOn(ProfileValidatorMod.ProfileValidator, "isProfileAllowed").mockReturnValue(true)

		const removeClineFromStack = vi.fn().mockResolvedValue(undefined)
		const addClineToStack = vi.fn().mockResolvedValue(undefined)
		const parentTask = { taskId: "parent-1" }

		const provider = {
			clineStack: [parentTask],
			taskHistoryStore: { getAll: vi.fn().mockReturnValue([{ id: "parent-1" }]) },
			setValues: vi.fn(),
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: { apiProvider: "anthropic", consecutiveMistakeLimit: 0 },
				organizationAllowList: "*",
				enableCheckpoints: true,
				checkpointTimeout: 60,
				experiments: {},
				cloudUserInfo: null,
			}),
			removeClineFromStack,
			addClineToStack,
			setProviderProfile: vi.fn(),
			log: vi.fn(),
			getStateToPostToWebview: vi.fn(),
			providerSettingsManager: { getModeConfigId: vi.fn(), listConfig: vi.fn() },
			customModesManager: { getCustomModes: vi.fn().mockResolvedValue([]) },
			taskCreationCallback: vi.fn(),
			contextProxy: {
				extensionUri: {},
				setValue: vi.fn(),
				getValue: vi.fn(),
				setProviderSettings: vi.fn(),
				getProviderSettings: vi.fn(() => ({})),
			},
		} as unknown as ClineProvider

		await (ClineProvider.prototype as any).createTask.call(provider, "Subtask", undefined, parentTask as any)

		expect(removeClineFromStack).not.toHaveBeenCalled()
		expect(addClineToStack).toHaveBeenCalledTimes(1)
	})

	it("createTaskWithHistoryItem reuses an already-live task instead of duplicating it", async () => {
		const existingTask = { taskId: "hist-1" }
		const addClineToStack = vi.fn().mockResolvedValue(undefined)
		const selectTask = vi.fn().mockResolvedValue(undefined)

		const provider = {
			getTaskById: vi.fn().mockReturnValue(existingTask),
			addClineToStack,
			selectTask,
			log: vi.fn(),
		} as unknown as ClineProvider

		const historyItem = {
			id: "hist-1",
			number: 1,
			ts: Date.now(),
			task: "Task",
			tokensIn: 0,
			tokensOut: 0,
			totalCost: 0,
			workspace: "/tmp",
		}

		const task = await (ClineProvider.prototype as any).createTaskWithHistoryItem.call(provider, historyItem)

		expect(task).toBe(existingTask)
		expect(selectTask).toHaveBeenCalledWith("hist-1")
		expect(addClineToStack).not.toHaveBeenCalled()
	})

	it("API StartNewTask clears the visible selection before creating a new task", async () => {
		const clearTask = vi.fn().mockResolvedValue(undefined)
		const createTask = vi.fn().mockResolvedValue({ taskId: "ipc-1" })
		const provider = {
			context: {} as any,
			clearTask,
			postStateToWebview: vi.fn(),
			postMessageToWebview: vi.fn(),
			createTask,
			getValues: vi.fn(() => ({})),
			providerSettingsManager: { saveConfig: vi.fn() },
			on: vi.fn(() => provider),
		} as unknown as ClineProvider

		const output = { appendLine: vi.fn() } as any
		const api = new API(output, provider, undefined, false)

		const taskId = await api.startNewTask({
			configuration: {},
			text: "hello",
			images: undefined,
			newTab: false,
		})

		expect(taskId).toBe("ipc-1")
		expect(clearTask).toHaveBeenCalledTimes(1)
		expect(createTask).toHaveBeenCalled()
	})
})
