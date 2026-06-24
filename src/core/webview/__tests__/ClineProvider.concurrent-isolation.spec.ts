// npx vitest run core/webview/__tests__/ClineProvider.concurrent-isolation.spec.ts
//
// Regression guard for the per-conversation mode / API-config leak.
//
// handleModeSwitch() and activateProviderProfile() operate on getCurrentTask(),
// which resolves to the VISIBLE conversation. With several conversations running
// concurrently, switching the foreground conversation's mode or provider profile
// must NOT mutate a background (non-visible) task's in-memory snapshot
// (_taskMode / _taskApiConfigName) or rebuild its API handler
// (updateApiConfiguration). If it did, a background request loop would silently
// start using another conversation's mode/model.
//
// The sibling sticky-mode / sticky-profile specs assert *persisted* isolation
// across tasks; this spec asserts *in-memory* isolation during a single switch.

import * as vscode from "vscode"
import { ClineProvider } from "../ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"

vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	WebviewView: vi.fn(),
	Uri: { joinPath: vi.fn(), file: vi.fn() },
	CodeActionKind: {
		QuickFix: { value: "quickfix" },
		RefactorRewrite: { value: "refactor.rewrite" },
	},
	commands: { executeCommand: vi.fn().mockResolvedValue(undefined) },
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue([]), update: vi.fn() }),
		onDidChangeConfiguration: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	env: { uriScheme: "vscode", language: "en", appName: "Visual Studio Code" },
	ExtensionMode: { Production: 1, Development: 2, Test: 3 },
	version: "1.85.0",
}))

vi.mock("../../task/Task", () => ({
	Task: vi.fn().mockImplementation((options) => ({
		taskId: options.taskId || "test-task-id",
		apiConfiguration: options.apiConfiguration,
		_taskMode: options.historyItem?.mode ?? "code",
		emit: vi.fn(),
		saveClineMessages: vi.fn(),
		clineMessages: [],
		apiConversationHistory: [],
		updateApiConfiguration: vi.fn(),
		setTaskApiConfigName: vi.fn(),
	})),
}))

vi.mock("../../prompts/sections/custom-instructions")
vi.mock("../../../utils/safeWriteJson")

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({ id: "claude-3-sonnet" }),
	}),
}))

vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn().mockImplementation(function () {
		return { initializeFilePaths: vi.fn(), dispose: vi.fn() }
	}),
}))

vi.mock("../../diff/strategies/multi-search-replace", () => ({
	MultiSearchReplaceDiffStrategy: vi.fn().mockImplementation(function () {
		return { getName: () => "test-strategy", applyDiff: vi.fn() }
	}),
}))

vi.mock("@roo-code/cloud", () => ({
	CloudService: {
		hasInstance: vi.fn().mockReturnValue(true),
		get instance() {
			return { isAuthenticated: vi.fn().mockReturnValue(false) }
		},
	},
	getRooCodeApiUrl: vi.fn().mockReturnValue("https://app.roocode.com"),
}))

vi.mock("../../../shared/modes", () => ({
	modes: [
		{ slug: "code", name: "Code Mode", roleDefinition: "code", groups: ["read", "edit"] },
		{ slug: "architect", name: "Architect Mode", roleDefinition: "architect", groups: ["read", "edit"] },
	],
	getModeBySlug: vi.fn().mockReturnValue({ slug: "code", name: "Code Mode", roleDefinition: "code", groups: [] }),
	defaultModeSlug: "code",
}))

vi.mock("../../prompts/system", () => ({
	SYSTEM_PROMPT: vi.fn().mockResolvedValue("mocked system prompt"),
	codeMode: "code",
}))

vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({}),
	flushModels: vi.fn(),
	getModelsFromCache: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn().mockResolvedValue("Mock file content"),
}))

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
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

vi.mock("../../../utils/storage", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../utils/storage")>()
	return {
		...actual,
		getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
		getSettingsDirectoryPath: vi.fn().mockResolvedValue("/test/settings/path"),
		getTaskDirectoryPath: vi.fn().mockResolvedValue("/test/task/path"),
	}
})

type MockTask = {
	taskId: string
	_taskMode: string
	_taskApiConfigName: string
	apiConfiguration: any
	emit: ReturnType<typeof vi.fn>
	saveClineMessages: ReturnType<typeof vi.fn>
	clineMessages: never[]
	apiConversationHistory: never[]
	updateApiConfiguration: ReturnType<typeof vi.fn>
	setTaskApiConfigName: ReturnType<typeof vi.fn>
}

function makeMockTask(taskId: string, mode: string, apiConfigName: string, apiConfiguration: any): MockTask {
	return {
		taskId,
		_taskMode: mode,
		_taskApiConfigName: apiConfigName,
		apiConfiguration,
		emit: vi.fn(),
		saveClineMessages: vi.fn(),
		clineMessages: [],
		apiConversationHistory: [],
		updateApiConfiguration: vi.fn(),
		setTaskApiConfigName: vi.fn().mockImplementation(function (this: any, name: string) {
			this._taskApiConfigName = name
		}),
	}
}

describe("ClineProvider - concurrent conversation isolation", () => {
	let provider: ClineProvider
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockWebviewView: vscode.WebviewView

	beforeEach(async () => {
		vi.clearAllMocks()

		const globalState: Record<string, string | undefined> = {
			mode: "code",
			currentApiConfigName: "default-profile",
		}
		const secrets: Record<string, string | undefined> = {}

		mockContext = {
			extensionPath: "/test/path",
			extensionUri: { fsPath: "/test/path" } as vscode.Uri,
			globalState: {
				get: vi.fn().mockImplementation((key: string) => globalState[key]),
				update: vi.fn().mockImplementation((key: string, value: string | undefined) => {
					globalState[key] = value
					return Promise.resolve()
				}),
				keys: vi.fn().mockImplementation(() => Object.keys(globalState)),
			},
			secrets: {
				get: vi.fn().mockImplementation((key: string) => secrets[key]),
				store: vi.fn().mockImplementation((key: string, value: string | undefined) => {
					secrets[key] = value
					return Promise.resolve()
				}),
				delete: vi.fn().mockImplementation((key: string) => {
					delete secrets[key]
					return Promise.resolve()
				}),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			subscriptions: [],
			extension: { packageJSON: { version: "1.0.0" } },
			globalStorageUri: { fsPath: "/test/storage/path" },
		} as unknown as vscode.ExtensionContext

		mockOutputChannel = {
			appendLine: vi.fn(),
			clear: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.OutputChannel

		mockWebviewView = {
			webview: {
				postMessage: vi.fn(),
				html: "",
				options: {},
				onDidReceiveMessage: vi.fn(),
				asWebviewUri: vi.fn(),
				cspSource: "vscode-webview://test-csp-source",
			},
			visible: true,
			onDidDispose: vi.fn().mockImplementation((callback) => {
				callback()
				return { dispose: vi.fn() }
			}),
			onDidChangeVisibility: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
		} as unknown as vscode.WebviewView

		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", new ContextProxy(mockContext))
		await new Promise((resolve) => setTimeout(resolve, 10))
		await provider.resolveWebviewView(mockWebviewView)

		provider.getMcpHub = vi.fn().mockReturnValue({
			listTools: vi.fn().mockResolvedValue([]),
			callTool: vi.fn().mockResolvedValue({ content: [] }),
			listResources: vi.fn().mockResolvedValue([]),
			readResource: vi.fn().mockResolvedValue({ contents: [] }),
			getAllServers: vi.fn().mockReturnValue([]),
		})
	})

	it("handleModeSwitch on the visible task leaves a background task's mode untouched", async () => {
		const background = makeMockTask("bg-task", "code", "profile-a", { apiProvider: "anthropic" })
		const visible = makeMockTask("fg-task", "code", "profile-b", { apiProvider: "openai" })

		await provider.addClineToStack(background as any)
		await provider.addClineToStack(visible as any)

		vi.spyOn(provider as any, "getGlobalState").mockReturnValue([
			{ id: "bg-task", ts: Date.now(), task: "bg", number: 1, tokensIn: 0, tokensOut: 0, totalCost: 0 },
			{ id: "fg-task", ts: Date.now(), task: "fg", number: 2, tokensIn: 0, tokensOut: 0, totalCost: 0 },
		])
		vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])

		// The foreground/visible conversation is the one being switched.
		vi.spyOn(provider, "getCurrentTask").mockReturnValue(visible as any)

		await provider.handleModeSwitch("architect")

		// Visible task updated...
		expect(visible._taskMode).toBe("architect")
		expect(visible.emit).toHaveBeenCalledWith("taskModeSwitched", "fg-task", "architect")

		// ...background task NOT touched.
		expect(background._taskMode).toBe("code")
		expect(background.emit).not.toHaveBeenCalledWith("taskModeSwitched", "bg-task", "architect")
		expect(background.updateApiConfiguration).not.toHaveBeenCalled()
	})

	it("activateProviderProfile on the visible task does not rebuild a background task's API handler", async () => {
		const background = makeMockTask("bg-task", "code", "profile-a", { apiProvider: "anthropic" })
		const visible = makeMockTask("fg-task", "code", "profile-b", { apiProvider: "openai" })

		await provider.addClineToStack(background as any)
		await provider.addClineToStack(visible as any)

		await provider.taskHistoryStore.upsert({
			id: "fg-task",
			ts: Date.now(),
			task: "fg",
			number: 2,
			tokensIn: 0,
			tokensOut: 0,
			totalCost: 0,
		} as any)

		vi.spyOn(provider, "updateTaskHistory").mockResolvedValue([])
		vi.spyOn(provider, "getCurrentTask").mockReturnValue(visible as any)

		vi.spyOn(provider.providerSettingsManager, "activateProfile").mockResolvedValue({
			name: "profile-c",
			id: "profile-c-id",
			apiProvider: "anthropic",
		} as any)
		vi.spyOn(provider.providerSettingsManager, "listConfig").mockResolvedValue([
			{ name: "profile-c", id: "profile-c-id", apiProvider: "anthropic" },
		] as any)

		await provider.activateProviderProfile({ name: "profile-c" })

		// Visible task got the new handler + sticky profile name.
		expect(visible.updateApiConfiguration).toHaveBeenCalled()
		expect(visible.setTaskApiConfigName).toHaveBeenCalledWith("profile-c")

		// Background task untouched: no handler rebuild, no sticky-name change.
		expect(background.updateApiConfiguration).not.toHaveBeenCalled()
		expect(background.setTaskApiConfigName).not.toHaveBeenCalled()
		expect(background._taskApiConfigName).toBe("profile-a")
	})
})
