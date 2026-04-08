import { HTMLAttributes, useMemo } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { ExtensionStateContextType } from "@/context/ExtensionStateContext"

interface UISettingsProps extends HTMLAttributes<HTMLDivElement> {
	reasoningBlockCollapsed: boolean
	enterBehavior: "send" | "newline"
	defaultRenderContext?: "sidebar" | "editor"
	setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType>
}

export const UISettings = ({
	reasoningBlockCollapsed,
	enterBehavior,
	defaultRenderContext = "editor",
	setCachedStateField,
	...props
}: UISettingsProps) => {
	const { t } = useAppTranslation()

	// Detect platform for dynamic modifier key display
	const primaryMod = useMemo(() => {
		const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
		return isMac ? "⌘" : "Ctrl"
	}, [])

	const handleReasoningBlockCollapsedChange = (value: boolean) => {
		setCachedStateField("reasoningBlockCollapsed", value)
	}

	const handleEnterBehaviorChange = (requireCtrlEnter: boolean) => {
		const newBehavior = requireCtrlEnter ? "newline" : "send"
		setCachedStateField("enterBehavior", newBehavior)
	}

	const handleDefaultRenderContextChange = (value: "sidebar" | "editor") => {
		setCachedStateField("defaultRenderContext", value)
	}

	return (
		<div {...props}>
			<SectionHeader>{t("settings:sections.ui")}</SectionHeader>

			<Section>
				<div className="space-y-6">
					{/* Collapse Thinking Messages Setting */}
					<SearchableSetting
						settingId="ui-collapse-thinking"
						section="ui"
						label={t("settings:ui.collapseThinking.label")}>
						<div className="flex flex-col gap-1">
							<VSCodeCheckbox
								checked={reasoningBlockCollapsed}
								onChange={(e: any) => handleReasoningBlockCollapsedChange(e.target.checked)}
								data-testid="collapse-thinking-checkbox">
								<span className="font-medium">{t("settings:ui.collapseThinking.label")}</span>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
								{t("settings:ui.collapseThinking.description")}
							</div>
						</div>
					</SearchableSetting>

					{/* Enter Key Behavior Setting */}
					<SearchableSetting
						settingId="ui-enter-behavior"
						section="ui"
						label={t("settings:ui.requireCtrlEnterToSend.label", { primaryMod })}>
						<div className="flex flex-col gap-1">
							<VSCodeCheckbox
								checked={enterBehavior === "newline"}
								onChange={(e: any) => handleEnterBehaviorChange(e.target.checked)}
								data-testid="enter-behavior-checkbox">
								<span className="font-medium">
									{t("settings:ui.requireCtrlEnterToSend.label", { primaryMod })}
								</span>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
								{t("settings:ui.requireCtrlEnterToSend.description", { primaryMod })}
							</div>
						</div>
					</SearchableSetting>

					<SearchableSetting
						settingId="ui-default-render-context"
						section="ui"
						label={t("settings:ui.defaultRenderContext.label")}>
						<label className="block font-medium mb-2">{t("settings:ui.defaultRenderContext.label")}</label>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => handleDefaultRenderContextChange("sidebar")}
								data-testid="render-context-sidebar-button"
								className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
									defaultRenderContext === "sidebar"
										? "border-vscode-focusBorder bg-vscode-button-background text-vscode-button-foreground"
										: "border-vscode-input-border bg-transparent text-vscode-foreground"
								}`}>
								{t("settings:ui.defaultRenderContext.options.sidebar")}
							</button>
							<button
								type="button"
								onClick={() => handleDefaultRenderContextChange("editor")}
								data-testid="render-context-editor-button"
								className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
									defaultRenderContext === "editor"
										? "border-vscode-focusBorder bg-vscode-button-background text-vscode-button-foreground"
										: "border-vscode-input-border bg-transparent text-vscode-foreground"
								}`}>
								{t("settings:ui.defaultRenderContext.options.editor")}
							</button>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:ui.defaultRenderContext.description")}
						</div>
					</SearchableSetting>
				</div>
			</Section>
		</div>
	)
}
