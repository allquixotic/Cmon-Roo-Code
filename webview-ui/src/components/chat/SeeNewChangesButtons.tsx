import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

export const SeeNewChangesButtons = () => {
	const { t } = useTranslation()
	const { currentTaskId, currentTaskItem } = useExtensionState()
	const [restoringChanges, setRestoringChanges] = useState(false)

	// Attach the owning task's id: the visible task can change between the click
	// and the extension handling the message, and restore is destructive.
	const taskId = currentTaskId ?? currentTaskItem?.id

	const seeNewChangesCallback = useCallback(() => {
		vscode.postMessage({ type: "completionCheckpointDiff", taskId })
	}, [taskId])

	const restoreChangesCallback = useCallback(() => setRestoringChanges(true), [])

	const confirmRestoreChangesCallback = useCallback(() => {
		vscode.postMessage({ type: "completionCheckpointRestore", taskId })
	}, [taskId])

	const cancelRestoreChangesCallback = useCallback(() => setRestoringChanges(false), [])

	return (
		<div className="flex flex-row gap-2 w-full">
			{restoringChanges ? (
				<>
					<VSCodeButton className="w-full mt-2 bg-red-500 text-white" onClick={confirmRestoreChangesCallback}>
						{t("chat:checkpoint.menu.confirm")} {t("chat:restoreChanges.title")}
					</VSCodeButton>
					<VSCodeButton className="w-full mt-2" appearance="secondary" onClick={cancelRestoreChangesCallback}>
						{t("chat:checkpoint.menu.cancel")}
					</VSCodeButton>
				</>
			) : (
				<>
					<VSCodeButton
						className="w-full mt-2"
						appearance="secondary"
						title={t("chat:seeNewChanges.tooltip")}
						onClick={seeNewChangesCallback}>
						{t("chat:seeNewChanges.title")}
					</VSCodeButton>
					<VSCodeButton
						className="w-full mt-2"
						appearance="secondary"
						title={t("chat:restoreChanges.tooltip")}
						onClick={restoreChangesCallback}>
						{t("chat:restoreChanges.title")}
					</VSCodeButton>
				</>
			)}
		</div>
	)
}
