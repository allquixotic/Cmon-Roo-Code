// npx vitest run core/task/__tests__/Task.task-scoped-state-isolation.spec.ts
//
// Regression guard for per-conversation mode / API-config isolation.
//
// CRC runs multiple conversations concurrently. The window-global ContextProxy
// state (`mode`, `currentApiConfigName`, provider settings) always reflects the
// *visible* conversation. The danger is that a background (non-visible) running
// task could read that global state during its request/tool loop and silently
// pick up another conversation's mode or provider profile.
//
// These tests pin down the two invariants that prevent that leak:
//   1. `getTaskScopedState()` (the state read used by the request path —
//      attemptApiRequest, tool gating, backoff) returns the task's OWN
//      snapshot (mode, apiConfiguration, currentApiConfigName) even when the
//      provider's global getState() reports different values.
//   2. The provider-profile-change listener installed by each Task is a no-op
//      unless that task is the visible one, so activating a profile for the
//      foreground conversation does not rewrite a background task's handler.

import * as vscode from "vscode"

import type { ProviderSettings, HistoryItem } from "@roo-code/types"
import { RooCodeEventName } from "@roo-code/types"

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"

vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	const mockEventEmitter = { event: vi.fn(), fire: vi.fn() }
	const mockTextDocument = { uri: { fsPath: "/mock/workspace/path/file.ts" } }
	const mockTextEditor = { document: mockTextDocument }
	const mockTab = { input: { uri: { fsPath: "/mock/workspace/path/file.ts" } } }
	const mockTabGroup = { tabs: [mockTab] }

	return {
		TabInputTextDiff: vi.fn(),
		CodeActionKind: {
			QuickFix: { value: "quickfix" },
			RefactorRewrite: { value: "refactor.rewrite" },
		},
		window: {
			createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			visibleTextEditors: [mockTextEditor],
			tabGroups: {
				all: [mockTabGroup],
				close: vi.fn(),
				onDidChangeTabs: vi.fn(() => ({ dispose: vi.fn() })),
			},
			showErrorMessage: vi.fn(),
		},
		workspace: {
			getConfiguration: vi.fn(() => ({ get: (_k: string, d: any) => d })),
			workspaceFolders: [{ uri: { fsPath: "/mock/workspace/path" }, name: "mock-workspace", index: 0 }],
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				onDidChange: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			})),
			fs: { stat: vi.fn().mockResolvedValue({ type: 1 }) },
			onDidSaveTextDocument: vi.fn(() => mockDisposable),
		},
		env: { uriScheme: "vscode", language: "en" },
		EventEmitter: vi.fn().mockImplementation(function () {
			return mockEventEmitter
		}),
		Disposable: { from: vi.fn() },
		TabInputText: vi.fn(),
		version: "1.85.0",
	}
})

vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue(""),
}))

vi.mock("../../ignore/RooIgnoreController")

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
}))

vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

const CONFIG_A: ProviderSettings = {
	apiProvider: "anthropic",
	apiModelId: "claude-3-5-sonnet-20241022",
	apiKey: "key-a",
} as any

const CONFIG_B: ProviderSettings = {
	apiProvider: "openai",
	openAiApiKey: "key-b",
	openAiModelId: "gpt-4o",
} as any

// The provider's window-global state. Deliberately different from BOTH tasks'
// snapshots so any leak (a task reading this instead of its own snapshot) is
// immediately visible in the assertions.
const GLOBAL_STATE = {
	mode: "debug",
	currentApiConfigName: "global-profile",
	apiConfiguration: { apiProvider: "openrouter", openRouterApiKey: "global-key" } as ProviderSettings,
}

type Handlers = Record<string, ((...args: any[]) => void) | undefined>

function makeProvider(handlers: Handlers, opts?: { isTaskVisible?: () => boolean; getState?: () => any }) {
	return {
		context: { globalStorageUri: { fsPath: "/test/storage" } },
		getState: vi.fn().mockImplementation(() => Promise.resolve(opts?.getState?.() ?? { ...GLOBAL_STATE })),
		log: vi.fn(),
		on: vi.fn().mockImplementation((event: string, cb: (...args: any[]) => void) => {
			handlers[event] = cb
		}),
		off: vi.fn(),
		isTaskVisible: vi.fn().mockImplementation(() => opts?.isTaskVisible?.() ?? false),
		postStateToWebview: vi.fn().mockResolvedValue(undefined),
		postStateToWebviewWithoutTaskHistory: vi.fn().mockResolvedValue(undefined),
		updateTaskHistory: vi.fn().mockResolvedValue(undefined),
		postTaskStateToWebview: vi.fn().mockResolvedValue(undefined),
	} as unknown as ClineProvider
}

function historyItem(id: string, mode: string, apiConfigName: string): HistoryItem {
	return {
		id,
		number: 1,
		ts: Date.now(),
		task: `task ${id}`,
		tokensIn: 0,
		tokensOut: 0,
		cacheWrites: 0,
		cacheReads: 0,
		totalCost: 0,
		mode,
		apiConfigName,
	} as HistoryItem
}

describe("Task - per-conversation scoped-state isolation", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it("getTaskScopedState returns the task's own mode/apiConfiguration/apiConfigName, not the global state", async () => {
		const handlers: Handlers = {}
		const provider = makeProvider(handlers)

		const task = new Task({
			provider,
			apiConfiguration: CONFIG_A,
			historyItem: historyItem("task-a", "code", "profile-a"),
			startTask: false,
		})

		const scoped = await (task as any).getTaskScopedState()

		// Task-scoped — must win over GLOBAL_STATE.
		expect(scoped.mode).toBe("code")
		expect(scoped.currentApiConfigName).toBe("profile-a")
		expect(scoped.apiConfiguration).toBe(CONFIG_A)

		// Sanity: the global state really is different, so the assertions above
		// can only pass if the request path is reading task-scoped values.
		expect(GLOBAL_STATE.mode).not.toBe("code")
		expect(GLOBAL_STATE.currentApiConfigName).not.toBe("profile-a")
	})

	it("two concurrent tasks each report their own scoped state from one shared provider", async () => {
		const handlers: Handlers = {}
		const provider = makeProvider(handlers)

		const taskA = new Task({
			provider,
			apiConfiguration: CONFIG_A,
			historyItem: historyItem("task-a", "code", "profile-a"),
			startTask: false,
		})
		const taskB = new Task({
			provider,
			apiConfiguration: CONFIG_B,
			historyItem: historyItem("task-b", "architect", "profile-b"),
			startTask: false,
		})

		const [scopedA, scopedB] = await Promise.all([
			(taskA as any).getTaskScopedState(),
			(taskB as any).getTaskScopedState(),
		])

		expect(scopedA.mode).toBe("code")
		expect(scopedA.currentApiConfigName).toBe("profile-a")
		expect(scopedA.apiConfiguration).toBe(CONFIG_A)

		expect(scopedB.mode).toBe("architect")
		expect(scopedB.currentApiConfigName).toBe("profile-b")
		expect(scopedB.apiConfiguration).toBe(CONFIG_B)
	})

	it("a background task's scoped state is unaffected when the global (visible) state changes", async () => {
		const handlers: Handlers = {}
		// Mutable global so we can simulate the user switching mode/profile on the
		// foreground conversation while this task runs in the background.
		const mutableGlobal = { ...GLOBAL_STATE }
		const provider = makeProvider(handlers, { getState: () => ({ ...mutableGlobal }) })

		const background = new Task({
			provider,
			apiConfiguration: CONFIG_A,
			historyItem: historyItem("bg", "code", "profile-a"),
			startTask: false,
		})

		const before = await (background as any).getTaskScopedState()
		expect(before.mode).toBe("code")
		expect(before.currentApiConfigName).toBe("profile-a")
		expect(before.apiConfiguration).toBe(CONFIG_A)

		// Foreground conversation switches mode + profile -> global state moves.
		mutableGlobal.mode = "ask"
		mutableGlobal.currentApiConfigName = "some-other-profile"
		mutableGlobal.apiConfiguration = { apiProvider: "bedrock" } as ProviderSettings

		const after = await (background as any).getTaskScopedState()
		expect(after.mode).toBe("code")
		expect(after.currentApiConfigName).toBe("profile-a")
		expect(after.apiConfiguration).toBe(CONFIG_A)
	})

	describe("provider-profile-change listener gating", () => {
		it("ignores ProviderProfileChanged events when the task is NOT visible", async () => {
			const handlers: Handlers = {}
			const provider = makeProvider(handlers, {
				isTaskVisible: () => false,
				getState: () => ({ ...GLOBAL_STATE }),
			})

			const task = new Task({
				provider,
				apiConfiguration: CONFIG_A,
				historyItem: historyItem("bg", "code", "profile-a"),
				startTask: false,
			})

			const updateSpy = vi.spyOn(task, "updateApiConfiguration")
			const setNameSpy = vi.spyOn(task, "setTaskApiConfigName")

			const listener = handlers[RooCodeEventName.ProviderProfileChanged]
			expect(listener).toBeTypeOf("function")

			await listener!({ name: "global-profile", provider: "openrouter" })

			expect(updateSpy).not.toHaveBeenCalled()
			expect(setNameSpy).not.toHaveBeenCalled()
			// Background task keeps its own handler/config.
			expect(task.apiConfiguration).toBe(CONFIG_A)
		})

		it("applies ProviderProfileChanged events when the task IS visible", async () => {
			const handlers: Handlers = {}
			const newConfig = { apiProvider: "openai", openAiApiKey: "switched", openAiModelId: "gpt-4o" }
			const provider = makeProvider(handlers, {
				isTaskVisible: () => true,
				getState: () => ({
					mode: "code",
					currentApiConfigName: "switched-profile",
					apiConfiguration: newConfig,
				}),
			})

			const task = new Task({
				provider,
				apiConfiguration: CONFIG_A,
				historyItem: historyItem("fg", "code", "profile-a"),
				startTask: false,
			})

			const updateSpy = vi.spyOn(task, "updateApiConfiguration")
			const setNameSpy = vi.spyOn(task, "setTaskApiConfigName")

			const listener = handlers[RooCodeEventName.ProviderProfileChanged]
			expect(listener).toBeTypeOf("function")

			await listener!({ name: "switched-profile", provider: "openai" })

			expect(updateSpy).toHaveBeenCalledWith(newConfig)
			expect(setNameSpy).toHaveBeenCalledWith("switched-profile")
			expect(task.apiConfiguration).toBe(newConfig)
		})
	})
})
