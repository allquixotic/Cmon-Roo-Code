import { HTMLAttributes, useCallback, useEffect, useState } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Trans } from "react-i18next"
import { Download, Upload, TriangleAlert, Bug, Lightbulb, Shield, MessageCircle, MessagesSquare } from "lucide-react"
import { VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import type { ExtensionMessage } from "@roo-code/types"

import { Package } from "@roo/package"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { Button, Input } from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { SetCachedStateField } from "./types"

type AboutProps = HTMLAttributes<HTMLDivElement> & {
	autoImportSettingsOnStartup?: boolean
	setCachedStateField?: SetCachedStateField<"autoImportSettingsOnStartup">
	debug?: boolean
	setDebug?: (debug: boolean) => void
}
const AUTO_IMPORT_SETTINGS_PATH_SETTING = `${Package.name}.autoImportSettingsPath`

export const About = ({
	autoImportSettingsOnStartup = false,
	setCachedStateField,
	debug,
	setDebug,
	className,
	...props
}: AboutProps) => {
	const { t } = useAppTranslation()
	const [autoImportSettingsPath, setAutoImportSettingsPath] = useState("")

	const handleMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		if (message.type === "vsCodeSetting" && message.setting === AUTO_IMPORT_SETTINGS_PATH_SETTING) {
			setAutoImportSettingsPath(typeof message.value === "string" ? message.value : "")
		}
	}, [])

	useEffect(() => {
		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [handleMessage])

	useEffect(() => {
		vscode.postMessage({ type: "getVSCodeSetting", setting: AUTO_IMPORT_SETTINGS_PATH_SETTING })
	}, [])

	const hasAutoImportSettingsPath = autoImportSettingsPath.trim().length > 0

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>{t("settings:sections.about")}</SectionHeader>

			<Section>
				<p>
					{Package.sha
						? `Version: ${Package.version} (${Package.sha.slice(0, 8)})`
						: `Version: ${Package.version}`}
				</p>
			</Section>

			<Section className="space-y-0">
				<h3>{t("settings:about.contactAndCommunity")}</h3>
				<div className="flex flex-col gap-3">
					<div className="flex items-start gap-2">
						<Bug className="size-4 text-vscode-descriptionForeground shrink-0" />
						<span>
							{t("settings:about.bugReport.label")}{" "}
							<VSCodeLink href="https://github.com/RooCodeInc/Roo-Code/issues/new?template=bug_report.yml">
								{t("settings:about.bugReport.link")}
							</VSCodeLink>
						</span>
					</div>
					<div className="flex items-start gap-2">
						<Lightbulb className="size-4 text-vscode-descriptionForeground shrink-0" />
						<span>
							{t("settings:about.featureRequest.label")}{" "}
							<VSCodeLink href="https://github.com/RooCodeInc/Roo-Code/issues/new?template=feature_request.yml">
								{t("settings:about.featureRequest.link")}
							</VSCodeLink>
						</span>
					</div>
					<div className="flex items-start gap-2">
						<Shield className="size-4 text-vscode-descriptionForeground shrink-0" />
						<span>
							{t("settings:about.securityIssue.label")}{" "}
							<VSCodeLink href="https://github.com/RooCodeInc/Roo-Code/security/policy">
								{t("settings:about.securityIssue.link")}
							</VSCodeLink>
						</span>
					</div>
					<div className="flex items-start gap-2">
						<MessageCircle className="size-4 text-vscode-descriptionForeground shrink-0" />
						<span>
							{t("settings:about.contact.label")}{" "}
							<VSCodeLink href="mailto:support@roocode.com">support@roocode.com</VSCodeLink>
						</span>
					</div>
					<div className="flex items-start gap-2">
						<MessagesSquare className="size-4 text-vscode-descriptionForeground shrink-0" />
						<span>
							<Trans
								i18nKey="settings:about.community"
								components={{
									communityLink: (
										<VSCodeLink href="https://github.com/RooCodeInc/Roo-Code/discussions" />
									),
								}}
							/>
						</span>
					</div>
					{setDebug && (
						<SearchableSetting
							settingId="about-debug-mode"
							section="about"
							label={t("settings:about.debugMode.label")}
							className="mt-4 pt-4 border-t border-vscode-settings-headerBorder">
							<VSCodeCheckbox
								checked={debug ?? false}
								onChange={(e: any) => {
									const checked = e.target.checked === true
									setDebug(checked)
								}}>
								{t("settings:about.debugMode.label")}
							</VSCodeCheckbox>
							<p className="text-vscode-descriptionForeground text-sm mt-0">
								{t("settings:about.debugMode.description")}
							</p>
						</SearchableSetting>
					)}
				</div>
			</Section>

			<Section className="space-y-0">
				<h3>{t("settings:about.autoImport.title")}</h3>
				<div className="flex flex-col gap-3">
					<SearchableSetting
						settingId="about-auto-import-startup"
						section="about"
						label={t("settings:about.autoImport.startupLabel")}>
						<VSCodeCheckbox
							checked={autoImportSettingsOnStartup}
							onChange={(e: any) =>
								setCachedStateField?.("autoImportSettingsOnStartup", e.target.checked)
							}
							data-testid="auto-import-startup-checkbox">
							{t("settings:about.autoImport.startupLabel")}
						</VSCodeCheckbox>
						<p className="text-vscode-descriptionForeground text-sm mt-0">
							{t("settings:about.autoImport.startupDescription")}
						</p>
					</SearchableSetting>

					<SearchableSetting
						settingId="about-auto-import-path"
						section="about"
						label={t("settings:about.autoImport.pathLabel")}>
						<label className="block font-medium mb-1">{t("settings:about.autoImport.pathLabel")}</label>
						<Input
							value={
								hasAutoImportSettingsPath
									? autoImportSettingsPath
									: t("settings:about.autoImport.pathNotConfigured")
							}
							readOnly
							data-testid="auto-import-path-input"
						/>
						<p className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:about.autoImport.pathDescription")}
						</p>
					</SearchableSetting>

					<SearchableSetting
						settingId="about-auto-import-now"
						section="about"
						label={t("settings:about.autoImport.importNow")}>
						<Button
							onClick={() =>
								hasAutoImportSettingsPath &&
								vscode.postMessage({ type: "importSettings", text: autoImportSettingsPath })
							}
							disabled={!hasAutoImportSettingsPath}
							data-testid="auto-import-now-button">
							<Download className="p-0.5" />
							{t("settings:about.autoImport.importNow")}
						</Button>
						<p className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:about.autoImport.importNowDescription")}
						</p>
					</SearchableSetting>
				</div>
			</Section>

			<Section className="space-y-0">
				<SearchableSetting
					settingId="about-manage-settings"
					section="about"
					label={t("settings:about.manageSettings")}>
					<h3>{t("settings:about.manageSettings")}</h3>
					<div className="flex flex-wrap items-center gap-2">
						<Button onClick={() => vscode.postMessage({ type: "exportSettings" })} className="w-28">
							<Upload className="p-0.5" />
							{t("settings:footer.settings.export")}
						</Button>
						<Button onClick={() => vscode.postMessage({ type: "importSettings" })} className="w-28">
							<Download className="p-0.5" />
							{t("settings:footer.settings.import")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => vscode.postMessage({ type: "resetState" })}
							className="w-28">
							<TriangleAlert className="p-0.5" />
							{t("settings:footer.settings.reset")}
						</Button>
					</div>
				</SearchableSetting>
			</Section>
		</div>
	)
}
