import * as vscode from "vscode"
import delay from "delay"

import type { CommandId } from "@roo-code/types"

import { Package } from "../shared/package"
import { getCommand } from "../utils/commands"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ContextProxy } from "../core/config/ContextProxy"
import { focusPanel } from "../utils/focusPanel"
import { getDefaultRenderContext } from "../utils/renderContext"
import { handleNewTask } from "./handleTask"
import { CodeIndexManager } from "../services/code-index/manager"
import { importSettingsWithFeedback } from "../core/config/importExport"
import { MdmService } from "../services/mdm/MdmService"
import { t } from "../i18n"

/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible CRC instances.")
		return undefined
	}
	return visibleProvider
}

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Returns the title string that should be used for the editor-tab webview
 * panel, honoring the "Masquerade as Roo Code" setting.
 */
function getTabPanelTitle(contextProxy: ContextProxy): string {
	const masquerade = contextProxy.getValue("masqueradeAsRooCode") ?? false
	return masquerade ? "Roo Code" : "CRC"
}

/**
 * Returns the `WebviewPanel.iconPath` that should be used for the editor-tab
 * webview panel, honoring the "Masquerade as Roo Code" setting.
 */
function getTabPanelIconPath(
	extensionUri: vscode.Uri,
	contextProxy: ContextProxy,
): { light: vscode.Uri; dark: vscode.Uri } {
	const masquerade = contextProxy.getValue("masqueradeAsRooCode") ?? false
	const lightIcon = masquerade ? "panel-light-roo.svg" : "panel-light.svg"
	const darkIcon = masquerade ? "panel-dark-roo.svg" : "panel-dark.svg"
	return {
		light: vscode.Uri.joinPath(extensionUri, "assets", "icons", lightIcon),
		dark: vscode.Uri.joinPath(extensionUri, "assets", "icons", darkIcon),
	}
}

/**
 * Refresh the editor-tab panel title + icon to match the current value of the
 * "Masquerade as Roo Code" setting. Safe to call any number of times and a
 * no-op when no tab panel is currently open.
 */
export function refreshTabPanelBrandAssets(extensionUri: vscode.Uri, contextProxy: ContextProxy): void {
	if (!tabPanel) {
		return
	}
	try {
		tabPanel.title = getTabPanelTitle(contextProxy)
		tabPanel.iconPath = getTabPanelIconPath(extensionUri, contextProxy)
	} catch {
		// Panel may have just been disposed; ignore.
	}
}

/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
 */
export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

/**
 * Set panel references
 */
export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context } = options

	for (const [id, callback] of Object.entries(getCommandsMap(options))) {
		const command = getCommand(id as CommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions): Record<CommandId, any> => ({
	activationCompleted: () => {},
	cloudButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		void visibleProvider
			.postMessageToWebview({ type: "action", action: "cloudButtonClicked" })
			.catch((error) => outputChannel.appendLine(`[cloudButtonClicked] postMessageToWebview failed: ${error}`))
	},
	plusButtonClicked: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		await visibleProvider.clearTask()
		await visibleProvider.refreshWorkspace()
		await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		// Send focusInput action immediately after chatButtonClicked
		// This ensures the focus happens after the view has switched
		await visibleProvider.postMessageToWebview({ type: "action", action: "focusInput" })
	},
	popoutButtonClicked: () => {
		return openClineInNewTab({ context, outputChannel })
	},
	openInNewTab: () => openClineInNewTab({ context, outputChannel }),
	settingsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		void visibleProvider
			.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
			.catch((error) => outputChannel.appendLine(`[settingsButtonClicked] postMessageToWebview failed: ${error}`))
		// Also explicitly post the visibility message to trigger scroll reliably
		void visibleProvider
			.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
			.catch((error) => outputChannel.appendLine(`[settingsButtonClicked] postMessageToWebview failed: ${error}`))
	},
	historyButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		void visibleProvider
			.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
			.catch((error) => outputChannel.appendLine(`[historyButtonClicked] postMessageToWebview failed: ${error}`))
	},
	marketplaceButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return
		void visibleProvider
			.postMessageToWebview({ type: "action", action: "marketplaceButtonClicked" })
			.catch((error) =>
				outputChannel.appendLine(`[marketplaceButtonClicked] postMessageToWebview failed: ${error}`),
			)
	},
	newTask: handleNewTask,
	setCustomStoragePath: async () => {
		const { promptForCustomStoragePath } = await import("../utils/storage")
		await promptForCustomStoragePath()
	},
	importSettings: async (filePath?: string) => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}

		await importSettingsWithFeedback(
			{
				providerSettingsManager: visibleProvider.providerSettingsManager,
				contextProxy: visibleProvider.contextProxy,
				customModesManager: visibleProvider.customModesManager,
				provider: visibleProvider,
			},
			filePath,
		)
	},
	focusInput: async () => {
		try {
			await focusPanel(tabPanel, sidebarPanel, getDefaultRenderContext(provider.contextProxy))

			const visibleProvider = ClineProvider.getVisibleInstance()

			if (visibleProvider) {
				void visibleProvider
					.postMessageToWebview({ type: "action", action: "focusInput" })
					.catch((error) => outputChannel.appendLine(`[focusInput] postMessageToWebview failed: ${error}`))
			}
		} catch (error) {
			outputChannel.appendLine(`Error focusing input: ${error}`)
		}
	},
	focusPanel: async () => {
		try {
			await focusPanel(tabPanel, sidebarPanel, getDefaultRenderContext(provider.contextProxy))
		} catch (error) {
			outputChannel.appendLine(`Error focusing panel: ${error}`)
		}
	},
	acceptInput: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		void visibleProvider
			.postMessageToWebview({ type: "acceptInput" })
			.catch((error) => outputChannel.appendLine(`[acceptInput] postMessageToWebview failed: ${error}`))
	},
	toggleAutoApprove: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		try {
			await visibleProvider.postMessageToWebview({
				type: "action",
				action: "toggleAutoApprove",
			})
		} catch (error) {
			outputChannel.appendLine(`[toggleAutoApprove] postMessageToWebview failed: ${error}`)
		}
	},
})

export const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const contextProxy = await ContextProxy.getInstance(context)
	const codeIndexManager = CodeIndexManager.getInstance(context)

	// Get the existing MDM service instance to ensure consistent policy enforcement
	let mdmService: MdmService | undefined
	try {
		mdmService = MdmService.getInstance()
	} catch (error) {
		// MDM service not initialized, which is fine - extension can work without it
		mdmService = undefined
	}

	const tabProvider = new ClineProvider(context, outputChannel, "editor", contextProxy, mdmService)
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(
		ClineProvider.tabPanelId,
		getTabPanelTitle(contextProxy),
		targetCol,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [context.extensionUri],
		},
	)

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	newPanel.iconPath = getTabPanelIconPath(context.extensionUri, contextProxy)

	await tabProvider.resolveWebviewView(newPanel)

	// Add listener for visibility changes to notify webview
	newPanel.onDidChangeViewState(
		(e) => {
			const panel = e.webviewPanel
			if (panel.visible) {
				panel.webview.postMessage({ type: "action", action: "didBecomeVisible" }) // Use the same message type as in SettingsView.tsx
			}
		},
		null, // First null is for `thisArgs`
		context.subscriptions, // Register listener for disposal
	)

	// Handle panel closing events.
	newPanel.onDidDispose(
		() => {
			setPanel(undefined, "tab")
		},
		null,
		context.subscriptions, // Also register dispose listener
	)

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	return tabProvider
}
