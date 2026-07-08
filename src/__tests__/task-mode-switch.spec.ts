// npx vitest run __tests__/task-mode-switch.spec.ts

import { describe, it, expect, vi } from "vitest"
import type { HistoryItem } from "@roo-code/types"
import { RooCodeEventName } from "@roo-code/types"
import { Task } from "../core/task/Task"

const taskHistoryItem: HistoryItem = {
	id: "task-1",
	task: "Background work",
	tokensIn: 0,
	tokensOut: 0,
	totalCost: 0,
} as unknown as HistoryItem

/** Task-scoped providerSettingsManager stub; by default no mode-bound profile resolves. */
const makeProviderSettingsManager = (
	overrides: Partial<{
		getModeConfigId: ReturnType<typeof vi.fn>
		listConfig: ReturnType<typeof vi.fn>
		getProfile: ReturnType<typeof vi.fn>
		setModeConfig: ReturnType<typeof vi.fn>
	}> = {},
) => ({
	getModeConfigId: vi.fn().mockResolvedValue(undefined),
	listConfig: vi.fn().mockResolvedValue([]),
	getProfile: vi.fn(),
	setModeConfig: vi.fn(),
	...overrides,
})

/** Provider double with everything switchTaskMode touches. */
function makeProvider(overrides: Record<string, unknown> = {}) {
	return {
		isTaskVisible: vi.fn().mockReturnValue(false),
		handleModeSwitch: vi.fn().mockResolvedValue(undefined),
		updateTaskHistory: vi.fn().mockResolvedValue(undefined),
		taskHistoryStore: { get: vi.fn().mockReturnValue(taskHistoryItem) },
		context: { workspaceState: { get: vi.fn().mockReturnValue(false) } },
		providerSettingsManager: makeProviderSettingsManager(),
		log: vi.fn(),
		...overrides,
	}
}

/**
 * Task double with the methods/fields switchTaskMode reads from `this`.
 * The real prototype method is invoked with this double, mirroring the
 * provider-double pattern in provider-delegation.spec.ts.
 */
function makeTask(provider: unknown) {
	return {
		taskId: "task-1",
		providerRef: { deref: vi.fn(() => provider) },
		setTaskMode: vi.fn(),
		emit: vi.fn(),
		updateApiConfiguration: vi.fn(),
		setTaskApiConfigName: vi.fn(),
		postTaskStateToWebview: vi.fn().mockResolvedValue(undefined),
	}
}

const invoke = (task: unknown, mode = "architect") => (Task.prototype as any).switchTaskMode.call(task, mode)

describe("Task.switchTaskMode()", () => {
	it("routes a VISIBLE task through the global handleModeSwitch after task-scoped persistence", async () => {
		const provider = makeProvider({ isTaskVisible: vi.fn().mockReturnValue(true) })
		const task = makeTask(provider)

		await invoke(task)

		expect(task.setTaskMode).toHaveBeenCalledWith("architect")
		// History persisted without broadcast before the global switch.
		expect(provider.updateTaskHistory).toHaveBeenCalledWith(
			{ ...taskHistoryItem, mode: "architect" },
			{ broadcast: false },
		)
		expect(provider.handleModeSwitch).toHaveBeenCalledWith("architect")

		// The visible path delegates profile handling to the global handler:
		// no direct task-scoped profile resolution or API handler mutation.
		expect(provider.providerSettingsManager.getModeConfigId).not.toHaveBeenCalled()
		expect(task.updateApiConfiguration).not.toHaveBeenCalled()
		expect(task.setTaskApiConfigName).not.toHaveBeenCalled()
	})

	it("never calls the global handleModeSwitch for a BACKGROUND task", async () => {
		const provider = makeProvider()
		const task = makeTask(provider)

		await invoke(task)

		expect(provider.handleModeSwitch).not.toHaveBeenCalled()
		expect(task.setTaskMode).toHaveBeenCalledWith("architect")
		expect(provider.updateTaskHistory).toHaveBeenCalledWith(
			{ ...taskHistoryItem, mode: "architect" },
			{ broadcast: false },
		)
		// The per-task event still fires for API observers (the global path
		// emits it inside handleModeSwitch).
		expect(task.emit).toHaveBeenCalledWith(RooCodeEventName.TaskModeSwitched, "task-1", "architect")
		expect(task.postTaskStateToWebview).toHaveBeenCalledTimes(1)
	})

	it("resolves the mode-bound profile task-scoped for a background task and applies it to the task only", async () => {
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
		const provider = makeProvider({ providerSettingsManager })
		const task = makeTask(provider)

		await invoke(task)

		expect(providerSettingsManager.getModeConfigId).toHaveBeenCalledWith("architect")
		expect(providerSettingsManager.getProfile).toHaveBeenCalledWith({ name: "architect-profile" })

		// The resolved profile (id/name stripped) is applied to THIS task's API handler.
		expect(task.updateApiConfiguration).toHaveBeenCalledWith({
			apiProvider: "anthropic",
			apiModelId: "architect-model",
		})
		expect(task.setTaskApiConfigName).toHaveBeenCalledWith("architect-profile")

		// Profile name persisted to this task's history without broadcast.
		expect(provider.updateTaskHistory).toHaveBeenCalledWith(
			{ ...taskHistoryItem, apiConfigName: "architect-profile" },
			{ broadcast: false },
		)

		// Never routed through the global mode/profile switch.
		expect(provider.handleModeSwitch).not.toHaveBeenCalled()
	})

	it("keeps the current config when the resolved profile has no apiProvider", async () => {
		const providerSettingsManager = makeProviderSettingsManager({
			getModeConfigId: vi.fn().mockResolvedValue("cfg-empty"),
			listConfig: vi.fn().mockResolvedValue([{ id: "cfg-empty", name: "empty-profile" }]),
			getProfile: vi.fn().mockResolvedValue({ id: "cfg-empty", name: "empty-profile" }),
		})
		const provider = makeProvider({ providerSettingsManager })
		const task = makeTask(provider)

		await invoke(task)

		expect(task.updateApiConfiguration).not.toHaveBeenCalled()
		expect(task.setTaskApiConfigName).not.toHaveBeenCalled()
		// Mode itself still switches.
		expect(task.setTaskMode).toHaveBeenCalledWith("architect")
		expect(task.postTaskStateToWebview).toHaveBeenCalledTimes(1)
	})

	it("does not write a mode→config binding when the mode has no saved config (background)", async () => {
		const provider = makeProvider()
		const task = makeTask(provider)

		await invoke(task)

		// handleModeSwitch's else-branch would call setModeConfig; a background
		// conversation must not mutate that user-level setting.
		expect(provider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		expect(task.updateApiConfiguration).not.toHaveBeenCalled()
		expect(task.setTaskApiConfigName).not.toHaveBeenCalled()
	})

	it("skips mode-bound profile resolution entirely when lockApiConfigAcrossModes is set", async () => {
		const providerSettingsManager = makeProviderSettingsManager({
			getModeConfigId: vi.fn().mockResolvedValue("cfg-arch"),
		})
		const workspaceStateGet = vi.fn((key: string, defaultValue?: unknown) =>
			key === "lockApiConfigAcrossModes" ? true : defaultValue,
		)
		const provider = makeProvider({
			providerSettingsManager,
			context: { workspaceState: { get: workspaceStateGet } },
		})
		const task = makeTask(provider)

		await invoke(task)

		expect(workspaceStateGet).toHaveBeenCalledWith("lockApiConfigAcrossModes", false)
		expect(providerSettingsManager.getModeConfigId).not.toHaveBeenCalled()
		expect(providerSettingsManager.listConfig).not.toHaveBeenCalled()
		expect(providerSettingsManager.getProfile).not.toHaveBeenCalled()
		expect(task.updateApiConfiguration).not.toHaveBeenCalled()
		// Mode itself still switches.
		expect(task.setTaskMode).toHaveBeenCalledWith("architect")
	})

	it("treats a failed profile resolution as non-fatal: mode switches, state still posts", async () => {
		const resolutionError = new Error("settings store unavailable")
		const providerSettingsManager = makeProviderSettingsManager({
			getModeConfigId: vi.fn().mockRejectedValue(resolutionError),
		})
		const provider = makeProvider({ providerSettingsManager })
		const task = makeTask(provider)

		await expect(invoke(task)).resolves.toBeUndefined()

		expect(task.setTaskMode).toHaveBeenCalledWith("architect")
		expect(task.updateApiConfiguration).not.toHaveBeenCalled()
		expect(provider.log).toHaveBeenCalledWith(expect.stringContaining("Task-scoped profile resolution failed"))
		expect(task.postTaskStateToWebview).toHaveBeenCalledTimes(1)
	})

	it("is a no-op when the provider reference is gone", async () => {
		const task = makeTask(undefined)

		await invoke(task)

		expect(task.setTaskMode).not.toHaveBeenCalled()
		expect(task.emit).not.toHaveBeenCalled()
		expect(task.postTaskStateToWebview).not.toHaveBeenCalled()
	})
})
