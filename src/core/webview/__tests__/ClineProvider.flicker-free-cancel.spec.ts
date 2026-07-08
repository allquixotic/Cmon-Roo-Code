import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as vscode from "vscode"

import { ClineProvider } from "../ClineProvider"
import { Task } from "../../task/Task"
import { ContextProxy } from "../../config/ContextProxy"
import type { ProviderSettings, HistoryItem } from "@roo-code/types"

// Mock dependencies
vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	return {
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			})),
			workspaceFolders: [],
			onDidChangeConfiguration: vi.fn(() => mockDisposable),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(function () {
			return {
				event: vi.fn(),
				fire: vi.fn(),
			}
		}),
		Disposable: {
			from: vi.fn(),
		},
		window: {
			showErrorMessage: vi.fn(),
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			onDidChangeActiveTextEditor: vi.fn(() => mockDisposable),
		},
		Uri: {
			file: vi.fn().mockReturnValue({ toString: () => "file://test" }),
		},
	}
})

vi.mock("../../task/Task", () => ({
	Task: vi.fn().mockImplementation(function () {
		return {
			taskId: "mock-task-id",
			instanceId: "mock-instance-id",
			abortTask: vi.fn().mockResolvedValue(undefined),
			emit: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
		}
	}),
}))
vi.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue({
			registerClient: vi.fn(),
			unregisterClient: vi.fn(),
		}),
		unregisterProvider: vi.fn(),
	},
}))
vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn().mockImplementation(function () {
		return {
			initializeFilePaths: vi.fn(),
			dispose: vi.fn(),
		}
	}),
}))
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			setProvider: vi.fn(),
			captureTaskCreated: vi.fn(),
		},
	},
}))

// Mock CloudService
vi.mock("@roo-code/cloud", () => ({
	CloudService: {
		hasInstance: vi.fn().mockReturnValue(false),
		instance: {
			isAuthenticated: vi.fn().mockReturnValue(false),
		},
	},
	getRooCodeApiUrl: vi.fn().mockReturnValue("https://api.roo-code.com"),
}))

vi.mock("../../../shared/embeddingModels", () => ({
	EMBEDDING_MODEL_PROFILES: [],
}))

vi.mock("../../../shared/modes", () => ({
	modes: [{ slug: "code", name: "Code Mode", roleDefinition: "You are a code assistant", groups: ["read", "edit"] }],
	getModeBySlug: vi.fn().mockReturnValue({
		slug: "code",
		name: "Code Mode",
		roleDefinition: "You are a code assistant",
		groups: ["read", "edit"],
	}),
	getGroupName: vi.fn().mockReturnValue("General Tools"),
	defaultModeSlug: "code",
}))

vi.mock("p-wait-for", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue(""),
	readdir: vi.fn().mockResolvedValue([]),
	unlink: vi.fn().mockResolvedValue(undefined),
	rmdir: vi.fn().mockResolvedValue(undefined),
	access: vi.fn().mockResolvedValue(undefined),
	rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("axios", () => ({
	default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }), post: vi.fn() },
	get: vi.fn().mockResolvedValue({ data: { data: [] } }),
	post: vi.fn(),
}))

vi.mock("delay", () => {
	const delayFn = (_ms: number) => Promise.resolve()
	delayFn.createDelay = () => delayFn
	delayFn.reject = () => Promise.reject(new Error("Delay rejected"))
	delayFn.range = () => Promise.resolve()
	return { default: delayFn }
})

vi.mock("../../../utils/storage", () => ({
	getSettingsDirectoryPath: vi.fn().mockResolvedValue("/test/settings/path"),
	getTaskDirectoryPath: vi.fn().mockResolvedValue("/test/task/path"),
	getGlobalStoragePath: vi.fn().mockResolvedValue("/test/storage/path"),
	getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
}))

vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../utils/tts", () => ({
	setTtsEnabled: vi.fn(),
	setTtsSpeed: vi.fn(),
}))

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({ id: "claude-3-sonnet" }),
	}),
}))

vi.mock("../../prompts/system", () => ({
	SYSTEM_PROMPT: vi.fn().mockImplementation(async () => "mocked system prompt"),
	codeMode: "code",
}))

vi.mock("../../prompts/sections/custom-instructions")

vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({}),
	flushModels: vi.fn(),
	getModelsFromCache: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn().mockResolvedValue("file content"),
}))

vi.mock("../diff/strategies/multi-search-replace", () => ({
	MultiSearchReplaceDiffStrategy: vi.fn().mockImplementation(function () {
		return { getName: () => "test-strategy", applyDiff: vi.fn() }
	}),
}))

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
	CallToolResultSchema: {},
	ListResourcesResultSchema: {},
	ListResourceTemplatesResultSchema: {},
	ListToolsResultSchema: {},
	ReadResourceResultSchema: {},
	ErrorCode: { InvalidRequest: "InvalidRequest", MethodNotFound: "MethodNotFound", InternalError: "InternalError" },
	McpError: class McpError extends Error {
		code: string
		constructor(code: string, message: string) {
			super(message)
			this.code = code
			this.name = "McpError"
		}
	},
}))

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn().mockImplementation(function () {
		return {
			connect: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
			listTools: vi.fn().mockResolvedValue({ tools: [] }),
			callTool: vi.fn().mockResolvedValue({ content: [] }),
		}
	}),
}))

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
	StdioClientTransport: vi.fn().mockImplementation(function () {
		return { connect: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
	}),
}))

vi.mock("../../../services/skills/SkillsManager", () => ({
	SkillsManager: vi.fn().mockImplementation(function () {
		return {
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn().mockResolvedValue(undefined),
		}
	}),
}))

vi.mock("../../task-persistence", async (importOriginal) => {
	const mod = await importOriginal<typeof import("../../task-persistence")>()
	// ClineProvider now attaches to a process-wide shared store via the static
	// TaskHistoryStore.getOrCreate registry and releases it (refcounted) on dispose.
	const makeStore = () => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		initialized: Promise.resolve(),
		get: vi.fn().mockReturnValue(undefined),
		getAll: vi.fn().mockReturnValue([]),
		upsert: vi.fn().mockResolvedValue([]),
		delete: vi.fn().mockResolvedValue(undefined),
		deleteMany: vi.fn().mockResolvedValue(undefined),
		migrateFromGlobalState: vi.fn().mockResolvedValue(undefined),
		release: vi.fn(),
	})
	return {
		...mod,
		TaskHistoryStore: {
			getOrCreate: vi.fn(() => makeStore()),
			__resetInstancesForTests: vi.fn(),
		},
		readApiMessages: vi.fn().mockResolvedValue([]),
		saveApiMessages: vi.fn().mockResolvedValue(undefined),
		saveTaskMessages: vi.fn().mockResolvedValue(undefined),
	}
})

describe("ClineProvider flicker-free cancel", () => {
	let provider: ClineProvider
	let mockContext: any
	let mockOutputChannel: any
	let mockTask1: any
	let mockTask2: any
	let consoleLogSpy: ReturnType<typeof vi.spyOn>
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	const mockApiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiKey: "test-key",
	} as ProviderSettings

	beforeAll(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterAll(() => {
		consoleLogSpy.mockRestore()
		consoleErrorSpy.mockRestore()
	})

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock extension context
		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			globalStorageUri: { fsPath: "/test/storage" },
			secrets: {
				get: vi.fn().mockResolvedValue(undefined),
				store: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			extensionUri: { fsPath: "/test/extension" },
		}

		// Setup mock output channel
		mockOutputChannel = {
			appendLine: vi.fn(),
			dispose: vi.fn(),
		}

		// Setup mock context proxy
		const mockContextProxy = {
			getValues: vi.fn().mockReturnValue({}),
			getValue: vi.fn().mockReturnValue(undefined),
			setValue: vi.fn().mockResolvedValue(undefined),
			getProviderSettings: vi.fn().mockReturnValue(mockApiConfig),
			extensionUri: mockContext.extensionUri,
			globalStorageUri: mockContext.globalStorageUri,
		}

		// Create provider instance
		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", mockContextProxy as any)

		// Mock provider methods
		provider.getState = vi.fn().mockResolvedValue({
			apiConfiguration: mockApiConfig,
			mode: "code",
		})

		provider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		provider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
		provider.postStateToWebviewWithoutClineMessages = vi.fn().mockResolvedValue(undefined)
		// Mock private method using any cast
		;(provider as any).updateGlobalState = vi.fn().mockResolvedValue(undefined)
		provider.activateProviderProfile = vi.fn().mockResolvedValue(undefined)
		provider.performPreparationTasks = vi.fn().mockResolvedValue(undefined)
		provider.getTaskWithId = vi.fn().mockImplementation((id) =>
			Promise.resolve({
				historyItem: {
					id,
					number: 1,
					ts: Date.now(),
					task: "test task",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.001,
					workspace: "/test/workspace",
				},
			}),
		)

		// Setup mock tasks
		mockTask1 = {
			taskId: "task-1",
			instanceId: "instance-1",
			emit: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			cancelCurrentRequest: vi.fn(),
			cancelAutoApprovalTimeout: vi.fn(),
			supersedePendingAsk: vi.fn(),
			pendingUnpersistedSteerMessages: [],
			messageQueueService: { messages: [] },
			terminalProcess: { abort: vi.fn() },
			rootTask: undefined,
			parentTask: undefined,
			abandoned: false,
			abort: false,
			dispose: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
		}

		mockTask2 = {
			taskId: "task-1", // Same ID for rehydration scenario
			instanceId: "instance-2", // Different instance
			emit: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
			pendingUnpersistedSteerMessages: [],
			messageQueueService: { messages: [], restoreMessages: vi.fn() },
			setDeferQueuedMessageDrainUntilResume: vi.fn(),
		}

		// Mock Task constructor
		vi.mocked(Task).mockImplementation(function () {
			return mockTask2 as any
		})
	})

	afterEach(async () => {
		// dispose() drains the stack via removeClineFromStack(), which several
		// tests stub to a no-op; clear the stack of test doubles first so the
		// drain loop terminates.
		;(provider as any).clineStack = []
		await provider.dispose()
	})

	it("should reuse the current task instance when reopening the same taskId without replacement", async () => {
		// Setup: Add a task to the stack first
		;(provider as any).clineStack = [mockTask1]

		// Mock event listeners for cleanup
		;(provider as any).taskEventListeners = new WeakMap()
		const mockCleanupFunctions = [vi.fn(), vi.fn()]
		;(provider as any).taskEventListeners.set(mockTask1, mockCleanupFunctions)

		// Spy on removeClineFromStack to verify it's NOT called
		const removeClineFromStackSpy = vi.spyOn(provider, "removeClineFromStack")

		// Create history item with same taskId as current task
		const historyItem: HistoryItem = {
			id: "task-1", // Same as mockTask1.taskId
			number: 1,
			task: "test task",
			ts: Date.now(),
			tokensIn: 100,
			tokensOut: 200,
			totalCost: 0.001,
			workspace: "/test/workspace",
		}

		// Act: Reopen the same task ID without forcing replacement
		const task = await provider.createTaskWithHistoryItem(historyItem)

		// Assert: removeClineFromStack should NOT be called
		expect(removeClineFromStackSpy).not.toHaveBeenCalled()

		// Verify the existing task instance was reused
		expect(task).toBe(mockTask1)
		expect((provider as any).clineStack).toHaveLength(1)
		expect((provider as any).clineStack[0]).toBe(mockTask1)

		// No replacement means no cleanup or fresh Task construction
		expect(mockCleanupFunctions[0]).not.toHaveBeenCalled()
		expect(mockCleanupFunctions[1]).not.toHaveBeenCalled()
		expect(Task).not.toHaveBeenCalled()

		// Verify the existing task received focus
		expect(mockTask1.emit).toHaveBeenCalledWith("taskFocused")
	})

	it("should append a different task without removing the existing stack", async () => {
		// Setup: Add a task to the stack first
		;(provider as any).clineStack = [mockTask1]

		// Spy on removeClineFromStack to verify it is NOT called
		const removeClineFromStackSpy = vi.spyOn(provider, "removeClineFromStack").mockResolvedValue(undefined)
		mockTask2.taskId = "task-2"

		// Create history item with different taskId
		const historyItem: HistoryItem = {
			id: "task-2", // Different from mockTask1.taskId
			number: 2,
			task: "different task",
			ts: Date.now(),
			tokensIn: 150,
			tokensOut: 250,
			totalCost: 0.002,
			workspace: "/test/workspace",
		}

		// Act: Create task with different history item
		const task = await provider.createTaskWithHistoryItem(historyItem)

		// Assert: multi-conversation restore keeps both tasks alive
		expect(removeClineFromStackSpy).not.toHaveBeenCalled()
		expect(task).toBe(mockTask2)
		expect((provider as any).clineStack).toHaveLength(2)
		expect((provider as any).clineStack[0]).toBe(mockTask1)
		expect((provider as any).clineStack[1]).toBe(mockTask2)
	})

	it("should handle empty stack gracefully during task creation", async () => {
		// Setup: Empty stack
		;(provider as any).clineStack = []

		// Spy on removeClineFromStack
		const removeClineFromStackSpy = vi.spyOn(provider, "removeClineFromStack").mockImplementation(async () => {
			;(provider as any).clineStack.pop()
		})

		// Create history item
		const historyItem: HistoryItem = {
			id: "task-1",
			number: 1,
			task: "test task",
			ts: Date.now(),
			tokensIn: 100,
			tokensOut: 200,
			totalCost: 0.001,
			workspace: "/test/workspace",
		}

		// Act: Should create a fresh task without trying to remove anything
		const task = await provider.createTaskWithHistoryItem(historyItem)

		// Assert: removeClineFromStack should not be called
		expect(removeClineFromStackSpy).not.toHaveBeenCalled()
		expect(task).toBe(mockTask2)
		expect((provider as any).clineStack).toHaveLength(1)
		expect((provider as any).clineStack[0]).toBe(mockTask2)
	})

	it("should replace the matching task in-place when replacement is explicitly requested", async () => {
		// Setup: Stack with multiple tasks
		const mockParentTask = {
			taskId: "parent-task",
			instanceId: "parent-instance",
			emit: vi.fn(),
		}

		;(provider as any).clineStack = [mockParentTask, mockTask1]
		;(provider as any).taskEventListeners = new WeakMap()
		const cleanup = vi.fn()
		;(provider as any).taskEventListeners.set(mockTask1, [cleanup])

		// Act: Rehydrate the current (top) task with explicit replacement
		const historyItem: HistoryItem = {
			id: "task-1",
			number: 1,
			task: "test task",
			ts: Date.now(),
			tokensIn: 100,
			tokensOut: 200,
			totalCost: 0.001,
			workspace: "/test/workspace",
		}

		const removeClineFromStackSpy = vi.spyOn(provider, "removeClineFromStack").mockResolvedValue(undefined)
		await provider.createTaskWithHistoryItem(historyItem, { replaceExistingTask: true })

		// Assert: Stack should maintain parent task and replace current task
		expect(removeClineFromStackSpy).not.toHaveBeenCalled()
		expect((provider as any).clineStack).toHaveLength(2)
		expect((provider as any).clineStack[0]).toBe(mockParentTask)
		expect((provider as any).clineStack[1]).toBe(mockTask2)
		expect(mockTask1.abortTask).toHaveBeenCalledWith(true)
		expect(cleanup).toHaveBeenCalled()
	})

	it("hard-stops the current task and restores queued messages on the replacement task", async () => {
		const queuedMessage = {
			id: "queued-1",
			text: "follow-up while streaming",
			images: ["image-1.png"],
			timestamp: 123,
		}
		const replacementTask = {
			messageQueueService: {
				messages: [],
				restoreMessages: vi.fn(),
			},
			setDeferQueuedMessageDrainUntilResume: vi.fn(),
		}

		mockTask1.messageQueueService = { messages: [queuedMessage] }
		mockTask1.rootTask = { taskId: "root-task" }
		mockTask1.parentTask = { taskId: "parent-task" }
		;(provider as any).clineStack = [mockTask1]
		;(provider as any).visibleTaskId = "task-1"

		const createTaskWithHistoryItemSpy = vi
			.spyOn(provider, "createTaskWithHistoryItem")
			.mockResolvedValue(replacementTask as any)
		const removeClineFromStackSpy = vi.spyOn(provider, "removeClineFromStack").mockResolvedValue(undefined)

		await provider.cancelTask()

		expect(mockTask1.abortReason).toBe("user_cancelled")
		expect(mockTask1.abort).toBe(true)
		expect(mockTask1.cancelCurrentRequest).toHaveBeenCalledTimes(1)
		expect(mockTask1.cancelAutoApprovalTimeout).toHaveBeenCalledTimes(1)
		expect(mockTask1.supersedePendingAsk).toHaveBeenCalledTimes(1)
		expect(mockTask1.terminalProcess.abort).toHaveBeenCalledTimes(1)
		expect(mockTask1.abortTask).toHaveBeenCalledWith(true)
		expect(createTaskWithHistoryItemSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "task-1",
				rootTask: mockTask1.rootTask,
				parentTask: mockTask1.parentTask,
			}),
			{ replaceExistingTask: true, focus: true },
		)
		expect(replacementTask.messageQueueService.restoreMessages).toHaveBeenCalledWith([
			{
				id: "queued-1",
				text: "follow-up while streaming",
				images: ["image-1.png"],
				timestamp: 123,
			},
		])
		expect(replacementTask.setDeferQueuedMessageDrainUntilResume).toHaveBeenCalledWith(true)
		expect(removeClineFromStackSpy).not.toHaveBeenCalled()
	})

	it("hard-stops the requested task without cancelling the visible task", async () => {
		const visibleTask = {
			taskId: "task-2",
			instanceId: "instance-2",
			emit: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			cancelCurrentRequest: vi.fn(),
			cancelAutoApprovalTimeout: vi.fn(),
			supersedePendingAsk: vi.fn(),
			pendingUnpersistedSteerMessages: [],
			messageQueueService: { messages: [] },
			terminalProcess: { abort: vi.fn() },
			rootTask: undefined,
			parentTask: undefined,
			abandoned: false,
			abort: false,
			on: vi.fn(),
			off: vi.fn(),
		}
		const replacementTask = {
			messageQueueService: {
				messages: [],
				restoreMessages: vi.fn(),
			},
			setDeferQueuedMessageDrainUntilResume: vi.fn(),
		}

		;(provider as any).clineStack = [mockTask1, visibleTask]
		;(provider as any).visibleTaskId = "task-2"

		const createTaskWithHistoryItemSpy = vi
			.spyOn(provider, "createTaskWithHistoryItem")
			.mockResolvedValue(replacementTask as any)

		await provider.cancelTask("task-1")

		expect(mockTask1.abortReason).toBe("user_cancelled")
		expect(mockTask1.cancelCurrentRequest).toHaveBeenCalledTimes(1)
		expect(mockTask1.cancelAutoApprovalTimeout).toHaveBeenCalledTimes(1)
		expect(mockTask1.supersedePendingAsk).toHaveBeenCalledTimes(1)
		expect(mockTask1.abortTask).toHaveBeenCalledWith(true)
		expect(visibleTask.cancelCurrentRequest).not.toHaveBeenCalled()
		expect(visibleTask.cancelAutoApprovalTimeout).not.toHaveBeenCalled()
		expect(visibleTask.supersedePendingAsk).not.toHaveBeenCalled()
		expect(visibleTask.abortTask).not.toHaveBeenCalled()
		expect(createTaskWithHistoryItemSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), {
			replaceExistingTask: true,
			focus: false,
		})
	})

	it("marks a cancelled delegated child as interrupted and keeps parent delegated (preserving resume path)", async () => {
		const mockRootTask = { taskId: "root-1" }
		const mockParentTask = { taskId: "parent-1" }
		const childHistory: HistoryItem = {
			id: "child-1",
			number: 2,
			task: "child task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			parentTaskId: "parent-1",
			rootTaskId: "root-1",
			status: "active",
		}
		const parentHistory: HistoryItem = {
			id: "parent-1",
			number: 1,
			task: "parent task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			status: "delegated",
			awaitingChildId: "child-1",
			delegatedToId: "child-1",
		}

		Object.assign(mockTask1, {
			taskId: "child-1",
			instanceId: "instance-child",
			rootTask: mockRootTask,
			parentTask: mockParentTask,
			parentTaskId: "parent-1",
			cancelCurrentRequest: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			abandoned: false,
			isStreaming: false,
			didFinishAbortingStream: true,
			isWaitingForFirstChunk: false,
		})
		;(provider as any).clineStack = [mockTask1]
		provider.getTaskWithId = vi.fn().mockImplementation((id) => {
			if (id === "child-1") {
				return Promise.resolve({ historyItem: childHistory })
			}
			if (id === "parent-1") {
				return Promise.resolve({ historyItem: parentHistory })
			}
			throw new Error(`unexpected task lookup: ${id}`)
		}) as any

		const updateTaskHistorySpy = vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])
		const createTaskWithHistoryItemSpy = vi
			.spyOn(provider, "createTaskWithHistoryItem")
			.mockResolvedValue(undefined as any)

		await provider.cancelTask()

		// Child is marked interrupted, not detached
		expect(updateTaskHistorySpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "child-1",
				status: "interrupted",
			}),
		)
		// Parent is NOT transitioned to active — it stays delegated
		expect(updateTaskHistorySpy).not.toHaveBeenCalledWith(expect.objectContaining({ id: "parent-1" }))
		// Rehydrated child keeps its parent link so it can resume and report back.
		// The rehydrate is a flicker-free in-place replacement; the child was not
		// visible so it must not steal focus from the visible conversation.
		expect(createTaskWithHistoryItemSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "child-1",
				parentTaskId: "parent-1",
				rootTaskId: "root-1",
			}),
			{ replaceExistingTask: true, focus: false },
		)
		// Successful interrupted write clears any stale fail-closed guard entry.
		expect((provider as any).cancelledDelegationChildIds.has("child-1")).toBe(false)
	})

	it("detaches runtime parent links when delegated parent detach fails", async () => {
		const mockRootTask = { taskId: "root-1" }
		const mockParentTask = { taskId: "parent-1" }
		const childHistory: HistoryItem = {
			id: "child-1",
			number: 2,
			task: "child task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			parentTaskId: "parent-1",
			rootTaskId: "root-1",
		}

		Object.assign(mockTask1, {
			taskId: "child-1",
			instanceId: "instance-child",
			rootTask: mockRootTask,
			parentTask: mockParentTask,
			parentTaskId: "parent-1",
			cancelCurrentRequest: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			abandoned: false,
			isStreaming: false,
			didFinishAbortingStream: true,
			isWaitingForFirstChunk: false,
		})
		;(provider as any).clineStack = [mockTask1]
		provider.getTaskWithId = vi.fn().mockImplementation((id) => {
			if (id === "child-1") {
				return Promise.resolve({ historyItem: childHistory })
			}
			if (id === "parent-1") {
				return Promise.reject(new Error("parent lookup failed"))
			}
			throw new Error(`unexpected task lookup: ${id}`)
		}) as any

		const updateTaskHistorySpy = vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])
		const createTaskWithHistoryItemSpy = vi
			.spyOn(provider, "createTaskWithHistoryItem")
			.mockResolvedValue(undefined as any)

		await provider.cancelTask()

		expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
			expect.stringContaining("[cancelTask] Failed to mark child interrupted for child-1: parent lookup failed"),
		)
		// The severing write must NOT retry a status transition: it preserves the
		// child's existing persisted status inside the store lock.
		expect(updateTaskHistorySpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "child-1",
				parentTaskId: undefined,
				rootTaskId: undefined,
			}),
			{ preserveExistingStatus: true },
		)
		expect(createTaskWithHistoryItemSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "child-1",
				parentTaskId: undefined,
				rootTaskId: undefined,
				parentTask: undefined,
				rootTask: undefined,
			}),
			{ replaceExistingTask: true, focus: false },
		)
		expect((provider as any).cancelledDelegationChildIds.has("child-1")).toBe(true)
	})

	it("does not rehydrate a cancelled child when standalone persistence also fails", async () => {
		const childHistory: HistoryItem = {
			id: "child-1",
			number: 2,
			task: "child task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			parentTaskId: "parent-1",
			rootTaskId: "root-1",
		}

		Object.assign(mockTask1, {
			taskId: "child-1",
			instanceId: "instance-child",
			parentTaskId: "parent-1",
			cancelCurrentRequest: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			abandoned: false,
			isStreaming: false,
			didFinishAbortingStream: true,
			isWaitingForFirstChunk: false,
		})
		;(provider as any).clineStack = [mockTask1]
		provider.getTaskWithId = vi.fn().mockImplementation((id) => {
			if (id === "child-1") {
				return Promise.resolve({ historyItem: childHistory })
			}
			if (id === "parent-1") {
				return Promise.reject(new Error("parent lookup failed"))
			}
			throw new Error(`unexpected task lookup: ${id}`)
		}) as any

		vi.spyOn(provider, "updateTaskHistory").mockRejectedValue(new Error("standalone persist failed"))
		const createTaskWithHistoryItemSpy = vi
			.spyOn(provider, "createTaskWithHistoryItem")
			.mockResolvedValue(undefined as any)

		await expect(provider.cancelTask()).rejects.toThrow("standalone persist failed")
		expect(createTaskWithHistoryItemSpy).not.toHaveBeenCalled()
		// The fail-closed reopen guard is only poisoned AFTER the severing write
		// lands; a transient persistence failure must not permanently block this
		// child's completion handoff for the rest of the session.
		expect((provider as any).cancelledDelegationChildIds.has("child-1")).toBe(false)
	})

	it("leaves a cancelled child's status intact when the child is itself delegated", async () => {
		// "delegated" → "interrupted" is not a valid transition, and the
		// grandchild's completion handoff needs the delegated status intact.
		const childHistory: HistoryItem = {
			id: "child-1",
			number: 2,
			task: "child task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			parentTaskId: "parent-1",
			rootTaskId: "root-1",
			status: "delegated",
			awaitingChildId: "grandchild-1",
			delegatedToId: "grandchild-1",
		}
		const parentHistory: HistoryItem = {
			id: "parent-1",
			number: 1,
			task: "parent task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			status: "delegated",
			awaitingChildId: "child-1",
			delegatedToId: "child-1",
		}

		Object.assign(mockTask1, {
			taskId: "child-1",
			instanceId: "instance-child",
			rootTask: { taskId: "root-1" },
			parentTask: { taskId: "parent-1" },
			parentTaskId: "parent-1",
			cancelCurrentRequest: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			abandoned: false,
			isStreaming: false,
			didFinishAbortingStream: true,
			isWaitingForFirstChunk: false,
		})
		;(provider as any).clineStack = [mockTask1]
		provider.getTaskWithId = vi.fn().mockImplementation((id) => {
			if (id === "child-1") return Promise.resolve({ historyItem: childHistory })
			if (id === "parent-1") return Promise.resolve({ historyItem: parentHistory })
			throw new Error(`unexpected task lookup: ${id}`)
		}) as any

		const updateTaskHistorySpy = vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])
		const createTaskWithHistoryItemSpy = vi
			.spyOn(provider, "createTaskWithHistoryItem")
			.mockResolvedValue(undefined as any)

		// Simulate a stale fail-closed entry from a prior failed cancel attempt;
		// cancelling a delegated child must clear it so the grandchild's
		// completion handoff is not blocked.
		;(provider as any).cancelledDelegationChildIds.add("child-1")

		await provider.cancelTask()

		// No history writes at all: neither the child (its "delegated" status is
		// left intact) nor the parent (it stays delegated awaiting the child).
		expect(updateTaskHistorySpy).not.toHaveBeenCalled()

		// Stale fail-closed guard entry is cleared.
		expect((provider as any).cancelledDelegationChildIds.has("child-1")).toBe(false)

		// Rehydrated child retains parent link AND its delegated status.
		expect(createTaskWithHistoryItemSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "child-1",
				parentTaskId: "parent-1",
				rootTaskId: "root-1",
				status: "delegated",
				awaitingChildId: "grandchild-1",
			}),
			{ replaceExistingTask: true, focus: false },
		)
	})

	it("removeClineFromStack does not repair parent when child is interrupted", async () => {
		const parentHistory: HistoryItem = {
			id: "parent-1",
			number: 1,
			task: "parent task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			status: "delegated",
			awaitingChildId: "child-1",
			delegatedToId: "child-1",
		}

		const childTask = {
			taskId: "child-1",
			instanceId: "inst-child",
			parentTaskId: "parent-1",
			emit: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
		}
		;(provider as any).clineStack = [childTask]
		;(provider as any).taskEventListeners = new Map()
		// Seed the in-memory store so taskHistoryStore.get("child-1") returns interrupted
		vi.spyOn((provider as any).taskHistoryStore, "get").mockImplementation((id: unknown) =>
			id === "child-1" ? { status: "interrupted" } : undefined,
		)

		provider.getTaskWithId = vi.fn().mockImplementation((id) => {
			if (id === "parent-1") return Promise.resolve({ historyItem: parentHistory })
			throw new Error(`unexpected task lookup: ${id}`)
		}) as any

		const updateTaskHistorySpy = vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])

		await (provider as any).removeClineFromStack()

		// Parent must NOT be transitioned to active — it stays delegated
		expect(updateTaskHistorySpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: "parent-1", status: "active" }),
		)
	})

	// Regression test for the race where a user clicks Stop on a freshly-delegated
	// child and immediately navigates back to the parent (showTaskWithId), before
	// cancelTask()'s own persistence of childHistory.status = "interrupted" has
	// landed. Both cancelTask() and removeClineFromStack() serialize their parent
	// writes through runDelegationTransition(parentTaskId, ...), but removeClineFromStack
	// only skips its repair when taskHistoryStore.get(childTaskId)?.status === "interrupted".
	// If removeClineFromStack's transition wins the race and runs while the store still
	// reports "active" (the write from cancelTask() hasn't landed yet), it incorrectly
	// repairs the parent to "active" and clears awaitingChildId, permanently severing
	// the delegation link before the child ever gets a chance to report back.
	it("removeClineFromStack does not repair parent when a cancellation for the child is in flight", async () => {
		const parentHistory: HistoryItem = {
			id: "parent-1",
			number: 1,
			task: "parent task",
			ts: Date.now(),
			tokensIn: 10,
			tokensOut: 20,
			totalCost: 0.001,
			workspace: "/test/workspace",
			status: "delegated",
			awaitingChildId: "child-1",
			delegatedToId: "child-1",
		}

		const childTask = {
			taskId: "child-1",
			instanceId: "inst-child",
			parentTaskId: "parent-1",
			emit: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
		}
		;(provider as any).clineStack = [childTask]
		;(provider as any).taskEventListeners = new Map()

		// The store still reports "active" — cancelTask()'s write to "interrupted"
		// has not landed yet. This is the pre-write window of the race.
		vi.spyOn((provider as any).taskHistoryStore, "get").mockImplementation((id: unknown) =>
			id === "child-1" ? { status: "active" } : undefined,
		)

		provider.getTaskWithId = vi.fn().mockImplementation((id) => {
			if (id === "parent-1") return Promise.resolve({ historyItem: parentHistory })
			throw new Error(`unexpected task lookup: ${id}`)
		}) as any

		const updateTaskHistorySpy = vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])

		// Simulate cancelTask() having already synchronously marked this child as
		// "being cancelled" before its own await chain reaches the history write.
		;(provider as any).cancellingDelegationChildIds.add("child-1")

		await (provider as any).removeClineFromStack()

		// Parent must NOT be transitioned to active while the child's cancellation
		// is still in flight — repairing here would clear awaitingChildId and
		// permanently sever the delegation link before "interrupted" is persisted.
		expect(updateTaskHistorySpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: "parent-1", status: "active" }),
		)
	})

	afterAll(() => {
		vi.restoreAllMocks()
	})
})
