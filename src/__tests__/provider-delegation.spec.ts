// npx vitest run __tests__/provider-delegation.spec.ts

import { describe, it, expect, vi } from "vitest"
import type { HistoryItem } from "@roo-code/types"
import { RooCodeEventName } from "@roo-code/types"
import { ClineProvider } from "../core/webview/ClineProvider"

const parentHistoryItem: HistoryItem = {
	id: "parent-1",
	task: "Parent",
	tokensIn: 0,
	tokensOut: 0,
	totalCost: 0,
	childIds: [],
} as unknown as HistoryItem

const parentApiConfiguration = { apiProvider: "openrouter", apiModelId: "parent-model" } as any

/** Minimal taskHistoryStore stub whose atomicReadAndUpdate calls the updater with the parent item. */
function makeStoreStub(
	overrides: Partial<{ atomicReadAndUpdate: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }> = {},
) {
	return {
		atomicReadAndUpdate: vi.fn(async (_taskId: string, updater: (h: HistoryItem) => HistoryItem) => {
			updater(parentHistoryItem)
			return []
		}),
		get: vi.fn().mockReturnValue(undefined),
		...overrides,
	}
}

/**
 * Parent task double with the methods/fields delegateParentAndOpenChild reads from
 * `parent`. Without flushPendingToolResultsToHistory the method hits its
 * non-fatal flush-error branch and never reaches the happy delegation path.
 * apiConfiguration/taskApiConfigName are the task-scoped fallback the child
 * inherits when no mode-bound profile resolves.
 */
const makeParentTask = () =>
	({
		taskId: "parent-1",
		emit: vi.fn(),
		flushPendingToolResultsToHistory: vi.fn().mockResolvedValue(true),
		retrySaveApiConversationHistory: vi.fn(),
		apiConfiguration: parentApiConfiguration,
		taskApiConfigName: "parent-config",
	}) as any

const makeChildTask = (start: ReturnType<typeof vi.fn> = vi.fn()) => ({
	taskId: "child-1",
	start,
	setTaskApiConfigName: vi.fn(),
})

/** Task-scoped providerSettingsManager stub; by default no mode-bound profile resolves. */
const makeProviderSettingsManager = (
	overrides: Partial<{
		getModeConfigId: ReturnType<typeof vi.fn>
		listConfig: ReturnType<typeof vi.fn>
		getProfile: ReturnType<typeof vi.fn>
	}> = {},
) => ({
	getModeConfigId: vi.fn().mockResolvedValue(undefined),
	listConfig: vi.fn().mockResolvedValue([]),
	getProfile: vi.fn(),
	...overrides,
})

/** Provider double with everything delegateParentAndOpenChild touches. */
function makeProvider(overrides: Record<string, unknown> = {}) {
	const parentTask = (overrides.parentTask as any) ?? makeParentTask()
	const base = {
		emit: vi.fn(),
		getCurrentTask: vi.fn(() => parentTask),
		getTaskById: vi.fn((id: string) => (id === "parent-1" ? parentTask : undefined)),
		isTaskVisible: vi.fn().mockReturnValue(true),
		removeClineFromStack: vi.fn().mockResolvedValue(undefined),
		createTask: vi.fn().mockResolvedValue(makeChildTask()),
		handleModeSwitch: vi.fn().mockResolvedValue(undefined),
		postStateToWebviewWithoutTaskHistory: vi.fn().mockResolvedValue(undefined),
		scheduleActiveConversationsStateToWebview: vi.fn(),
		context: { workspaceState: { get: vi.fn().mockReturnValue(false) } },
		providerSettingsManager: makeProviderSettingsManager(),
		log: vi.fn(),
		isViewLaunched: false,
		recentTasksCache: undefined,
		taskHistoryStore: makeStoreStub(),
	}
	delete (overrides as any).parentTask
	return { provider: { ...base, ...overrides } as unknown as ClineProvider, parentTask }
}

const invoke = (provider: ClineProvider, mode = "code") =>
	(ClineProvider.prototype as any).delegateParentAndOpenChild.call(provider, {
		parentTaskId: "parent-1",
		message: "Do something",
		initialTodos: [],
		mode,
	})

describe("ClineProvider.delegateParentAndOpenChild()", () => {
	it("persists parent delegation metadata via atomicReadAndUpdate and emits TaskDelegated", async () => {
		const childStart = vi.fn()
		const childTask = makeChildTask(childStart)
		const createTask = vi.fn().mockResolvedValue(childTask)
		const taskHistoryStore = makeStoreStub()
		const { provider, parentTask } = makeProvider({ createTask, taskHistoryStore })

		const child = await invoke(provider)

		expect(child.taskId).toBe("child-1")

		// Invariant: the invoking parent (by taskId, not the visible task) is closed
		// before child creation, with broadcast suppressed so the transient fallback
		// selection cannot sync an unrelated conversation's settings into global state.
		const removeClineFromStack = (provider as any).removeClineFromStack
		expect(removeClineFromStack).toHaveBeenCalledTimes(1)
		expect(removeClineFromStack).toHaveBeenCalledWith({
			taskId: "parent-1",
			skipDelegationRepair: true,
			broadcast: false,
		})

		// Child task created task-scoped: startTask false, active status, focus follows
		// the parent's visibility, taskMode and apiConfiguration passed directly.
		expect(createTask).toHaveBeenCalledWith("Do something", undefined, parentTask, {
			initialTodos: [],
			initialStatus: "active",
			startTask: false,
			focus: true,
			taskMode: "code",
			apiConfiguration: parentApiConfiguration,
		})

		// The mode-bound name is applied task-scoped on the child, not via global switch.
		expect(childTask.setTaskApiConfigName).toHaveBeenCalledTimes(1)
		expect(childTask.setTaskApiConfigName).toHaveBeenCalledWith("parent-config")

		// Global mode switching must NOT happen: it would race concurrent delegations.
		expect((provider as any).handleModeSwitch).not.toHaveBeenCalled()

		// Delegation metadata written via atomicReadAndUpdate with correct taskId
		expect(taskHistoryStore.atomicReadAndUpdate).toHaveBeenCalledTimes(1)
		const [calledTaskId, updater] = taskHistoryStore.atomicReadAndUpdate.mock.calls[0]
		expect(calledTaskId).toBe("parent-1")

		// The updater must produce the correct delegation fields
		const result = updater(parentHistoryItem)
		expect(result).toMatchObject({
			id: "parent-1",
			status: "delegated",
			delegatedToId: "child-1",
			awaitingChildId: "child-1",
			childIds: expect.arrayContaining(["child-1"]),
		})

		// child.start() called AFTER parent metadata is persisted
		expect(childStart).toHaveBeenCalledTimes(1)

		// Parent was visible: full webview state settle, not the background schedule.
		expect((provider as any).postStateToWebviewWithoutTaskHistory).toHaveBeenCalledTimes(1)
		expect((provider as any).scheduleActiveConversationsStateToWebview).not.toHaveBeenCalled()

		// Provider-level event
		expect((provider as any).emit).toHaveBeenCalledWith(RooCodeEventName.TaskDelegated, "parent-1", "child-1")
	})

	it("resolves the child's mode-bound profile task-scoped and applies it to the child only", async () => {
		const childTask = makeChildTask()
		const createTask = vi.fn().mockResolvedValue(childTask)
		const providerSettingsManager = makeProviderSettingsManager({
			getModeConfigId: vi.fn().mockResolvedValue("cfg-arch"),
			listConfig: vi.fn().mockResolvedValue([
				{ id: "cfg-other", name: "other-profile" },
				{ id: "cfg-arch", name: "architect-profile" },
			]),
			getProfile: vi.fn().mockResolvedValue({
				id: "cfg-arch",
				name: "architect-profile",
				apiProvider: "anthropic",
				apiModelId: "architect-model",
			}),
		})
		const { provider } = makeProvider({ createTask, providerSettingsManager })

		await invoke(provider, "architect")

		expect(providerSettingsManager.getModeConfigId).toHaveBeenCalledWith("architect")
		expect(providerSettingsManager.getProfile).toHaveBeenCalledWith({ name: "architect-profile" })

		// The resolved profile (id/name stripped) is passed task-scoped to createTask.
		expect(createTask).toHaveBeenCalledWith(
			"Do something",
			undefined,
			expect.anything(),
			expect.objectContaining({
				taskMode: "architect",
				apiConfiguration: { apiProvider: "anthropic", apiModelId: "architect-model" },
			}),
		)
		expect(childTask.setTaskApiConfigName).toHaveBeenCalledWith("architect-profile")

		// Never routed through the global mode/profile switch.
		expect((provider as any).handleModeSwitch).not.toHaveBeenCalled()
	})

	it("falls back to the parent's config when the resolved profile has no apiProvider", async () => {
		const childTask = makeChildTask()
		const createTask = vi.fn().mockResolvedValue(childTask)
		const providerSettingsManager = makeProviderSettingsManager({
			getModeConfigId: vi.fn().mockResolvedValue("cfg-empty"),
			listConfig: vi.fn().mockResolvedValue([{ id: "cfg-empty", name: "empty-profile" }]),
			getProfile: vi.fn().mockResolvedValue({ id: "cfg-empty", name: "empty-profile" }),
		})
		const { provider } = makeProvider({ createTask, providerSettingsManager })

		await invoke(provider)

		expect(createTask).toHaveBeenCalledWith(
			"Do something",
			undefined,
			expect.anything(),
			expect.objectContaining({ apiConfiguration: parentApiConfiguration }),
		)
		expect(childTask.setTaskApiConfigName).toHaveBeenCalledWith("parent-config")
	})

	it("skips mode-bound profile resolution entirely when lockApiConfigAcrossModes is set", async () => {
		const childTask = makeChildTask()
		const createTask = vi.fn().mockResolvedValue(childTask)
		const providerSettingsManager = makeProviderSettingsManager({
			getModeConfigId: vi.fn().mockResolvedValue("cfg-arch"),
		})
		const workspaceStateGet = vi.fn((key: string, defaultValue?: unknown) =>
			key === "lockApiConfigAcrossModes" ? true : defaultValue,
		)
		const { provider } = makeProvider({
			createTask,
			providerSettingsManager,
			context: { workspaceState: { get: workspaceStateGet } },
		})

		await invoke(provider)

		expect(workspaceStateGet).toHaveBeenCalledWith("lockApiConfigAcrossModes", false)
		expect(providerSettingsManager.getModeConfigId).not.toHaveBeenCalled()
		expect(providerSettingsManager.listConfig).not.toHaveBeenCalled()
		expect(providerSettingsManager.getProfile).not.toHaveBeenCalled()
		expect(createTask).toHaveBeenCalledWith(
			"Do something",
			undefined,
			expect.anything(),
			expect.objectContaining({ apiConfiguration: parentApiConfiguration }),
		)
		expect(childTask.setTaskApiConfigName).toHaveBeenCalledWith("parent-config")
	})

	it("does not focus the child and schedules a background state sync when the parent was not visible", async () => {
		const childTask = makeChildTask()
		const createTask = vi.fn().mockResolvedValue(childTask)
		const { provider } = makeProvider({
			createTask,
			isTaskVisible: vi.fn().mockReturnValue(false),
		})

		await invoke(provider)

		expect((provider as any).isTaskVisible).toHaveBeenCalledWith("parent-1")
		expect(createTask).toHaveBeenCalledWith(
			"Do something",
			undefined,
			expect.anything(),
			expect.objectContaining({ focus: false }),
		)
		expect((provider as any).scheduleActiveConversationsStateToWebview).toHaveBeenCalledTimes(1)
		expect((provider as any).postStateToWebviewWithoutTaskHistory).not.toHaveBeenCalled()
	})

	it("posts taskHistoryItemUpdated to the webview when isViewLaunched is true", async () => {
		const updatedParent = { ...parentHistoryItem, status: "delegated" } as HistoryItem
		const postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		const taskHistoryStore = makeStoreStub({
			get: vi.fn().mockReturnValue(updatedParent),
		})
		const { provider } = makeProvider({
			postMessageToWebview,
			isViewLaunched: true,
			taskHistoryStore,
		})

		await invoke(provider)

		expect(postMessageToWebview).toHaveBeenCalledWith({
			type: "taskHistoryItemUpdated",
			taskHistoryItem: updatedParent,
		})
	})

	it("skips postMessageToWebview when isViewLaunched is true but store returns undefined", async () => {
		const postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		const taskHistoryStore = makeStoreStub({
			get: vi.fn().mockReturnValue(undefined),
		})
		const { provider } = makeProvider({
			postMessageToWebview,
			isViewLaunched: true,
			taskHistoryStore,
		})

		await invoke(provider)

		expect(postMessageToWebview).not.toHaveBeenCalled()
	})

	it("uses the invoking parent id when the current visible task differs", async () => {
		const parentTask = makeParentTask()
		const visibleTask = { taskId: "visible-other", emit: vi.fn() } as any
		const childStart = vi.fn()
		const childTask = makeChildTask(childStart)
		const createTask = vi.fn().mockResolvedValue(childTask)
		const taskHistoryStore = makeStoreStub()
		const { provider } = makeProvider({
			parentTask,
			getCurrentTask: vi.fn(() => visibleTask),
			getTaskById: vi.fn((id: string) =>
				id === "parent-1" ? parentTask : id === "visible-other" ? visibleTask : undefined,
			),
			isTaskVisible: vi.fn((id: string) => id === "visible-other"),
			createTask,
			taskHistoryStore,
		})

		const child = await invoke(provider)

		expect(child.taskId).toBe("child-1")
		// The invoking parent is closed even though another conversation is visible.
		expect((provider as any).removeClineFromStack).toHaveBeenCalledWith({
			taskId: "parent-1",
			skipDelegationRepair: true,
			broadcast: false,
		})
		// A background parent's delegation must not steal the webview focus.
		expect(createTask).toHaveBeenCalledWith("Do something", undefined, parentTask, {
			initialTodos: [],
			initialStatus: "active",
			startTask: false,
			focus: false,
			taskMode: "code",
			apiConfiguration: parentApiConfiguration,
		})
		expect(taskHistoryStore.atomicReadAndUpdate).toHaveBeenCalledTimes(1)
		expect(taskHistoryStore.atomicReadAndUpdate.mock.calls[0][0]).toBe("parent-1")
		expect((provider as any).handleModeSwitch).not.toHaveBeenCalled()
		expect(childStart).toHaveBeenCalledTimes(1)
		expect((provider as any).scheduleActiveConversationsStateToWebview).toHaveBeenCalledTimes(1)
		expect((provider as any).postStateToWebviewWithoutTaskHistory).not.toHaveBeenCalled()
	})

	it("calls child.start() only after atomicReadAndUpdate completes (no race condition)", async () => {
		const callOrder: string[] = []

		const childStart = vi.fn(() => callOrder.push("child.start"))
		const childTask = makeChildTask(childStart)
		const createTask = vi.fn(async () => {
			callOrder.push("createTask")
			return childTask
		})
		const taskHistoryStore = makeStoreStub({
			atomicReadAndUpdate: vi.fn(async (_taskId: string, _updater: (h: HistoryItem) => HistoryItem) => {
				callOrder.push("atomicReadAndUpdate")
				return []
			}),
		})
		const { provider } = makeProvider({ createTask, taskHistoryStore })

		await invoke(provider)

		// createTask → atomicReadAndUpdate → child.start: lock must release before start
		expect(callOrder).toEqual(["createTask", "atomicReadAndUpdate", "child.start"])
	})

	it("rolls back the paused child and restores the parent when atomicReadAndUpdate fails", async () => {
		const persistError = new Error("parent metadata persist failed")
		const childStart = vi.fn()
		const childTask = makeChildTask(childStart)
		const removeClineFromStack = vi.fn().mockResolvedValue(undefined)
		const deleteTaskWithId = vi.fn().mockResolvedValue(undefined)
		const createTaskWithHistoryItem = vi.fn().mockResolvedValue(undefined)
		const getTaskWithId = vi.fn().mockResolvedValue({ historyItem: parentHistoryItem })
		const createTask = vi.fn().mockResolvedValue(childTask)

		const taskHistoryStore = makeStoreStub({
			atomicReadAndUpdate: vi.fn().mockRejectedValue(persistError),
		})

		// getCurrentTask deliberately returns undefined for the whole run: the rollback
		// must close the paused child by taskId UNCONDITIONALLY, without consulting the
		// current visible selection (the child may never have been the visible task).
		const { provider } = makeProvider({
			getCurrentTask: vi.fn().mockReturnValue(undefined),
			removeClineFromStack,
			createTask,
			getTaskWithId,
			deleteTaskWithId,
			createTaskWithHistoryItem,
			taskHistoryStore,
		})

		await expect(invoke(provider)).rejects.toThrow(persistError)

		expect(childStart).not.toHaveBeenCalled()
		// First disposal closes the invoking parent before child creation.
		expect(removeClineFromStack).toHaveBeenNthCalledWith(1, {
			taskId: "parent-1",
			skipDelegationRepair: true,
			broadcast: false,
		})
		// Rollback closes the paused child by its own taskId, broadcast suppressed.
		expect(removeClineFromStack).toHaveBeenNthCalledWith(2, {
			taskId: "child-1",
			skipDelegationRepair: true,
			broadcast: false,
		})
		expect(deleteTaskWithId).toHaveBeenCalledWith("child-1", false)
		// Parent is restored; refocus only if the delegating conversation was visible.
		expect(createTaskWithHistoryItem).toHaveBeenCalledWith(parentHistoryItem, { focus: true })
		// The failure path must not settle webview state as if delegation succeeded.
		expect((provider as any).postStateToWebviewWithoutTaskHistory).not.toHaveBeenCalled()
		expect((provider as any).scheduleActiveConversationsStateToWebview).not.toHaveBeenCalled()
	})

	it("does not steal focus when a background delegation's rollback restores the parent", async () => {
		const persistError = new Error("persist failed")
		const childTask = makeChildTask()
		const createTaskWithHistoryItem = vi.fn().mockResolvedValue(undefined)
		const taskHistoryStore = makeStoreStub({
			atomicReadAndUpdate: vi.fn().mockRejectedValue(persistError),
		})
		const { provider } = makeProvider({
			isTaskVisible: vi.fn().mockReturnValue(false),
			createTask: vi.fn().mockResolvedValue(childTask),
			getTaskWithId: vi.fn().mockResolvedValue({ historyItem: parentHistoryItem }),
			deleteTaskWithId: vi.fn().mockResolvedValue(undefined),
			createTaskWithHistoryItem,
			taskHistoryStore,
		})

		await expect(invoke(provider)).rejects.toThrow(persistError)

		expect(createTaskWithHistoryItem).toHaveBeenCalledWith(parentHistoryItem, { focus: false })
	})
})
