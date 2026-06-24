import * as vscode from "vscode"

import { type CodeActionId, type CodeActionName } from "@roo-code/types"
import { Package } from "../shared/package"
import { t } from "../i18n"

import { getCodeActionCommand } from "../utils/commands"
import { EditorUtils } from "../integrations/editor/EditorUtils"

export const TITLES: Record<CodeActionName, string> = {
	EXPLAIN: "Explain with Zoo Code",
	FIX: "Fix with Zoo Code",
	IMPROVE: "Improve with Zoo Code",
	ADD_TO_CONTEXT: "Add to Zoo Code",
	NEW_TASK: "New Zoo Code Task",
} as const

export class CodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix,
		vscode.CodeActionKind.RefactorRewrite,
	]

	private createAction(
		title: string,
		kind: vscode.CodeActionKind,
		command: CodeActionId,
		args: any[],
	): vscode.CodeAction {
		const action = new vscode.CodeAction(title, kind)
		action.command = { command: getCodeActionCommand(command), title, arguments: args }
		return action
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		try {
			if (!vscode.workspace.getConfiguration(Package.name).get<boolean>("enableCodeActions", true)) {
				return []
			}

			const effectiveRange = EditorUtils.getEffectiveRange(document, range)

			if (!effectiveRange) {
				return []
			}

			const filePath = EditorUtils.getFilePath(document)
			const actions: vscode.CodeAction[] = []

			actions.push(
				this.createAction(
					t("common:codeActions.addToContext"),
					vscode.CodeActionKind.QuickFix,
					"addToContext",
					[
						filePath,
						effectiveRange.text,
						effectiveRange.range.start.line + 1,
						effectiveRange.range.end.line + 1,
					],
				),
			)

			if (context.diagnostics.length > 0) {
				const relevantDiagnostics = context.diagnostics.filter((d) =>
					EditorUtils.hasIntersectingRange(effectiveRange.range, d.range),
				)

				if (relevantDiagnostics.length > 0) {
					actions.push(
						this.createAction(t("common:codeActions.fix"), vscode.CodeActionKind.QuickFix, "fixCode", [
							filePath,
							effectiveRange.text,
							effectiveRange.range.start.line + 1,
							effectiveRange.range.end.line + 1,
							relevantDiagnostics.map(EditorUtils.createDiagnosticData),
						]),
					)
				}
			} else {
				actions.push(
					this.createAction(t("common:codeActions.explain"), vscode.CodeActionKind.QuickFix, "explainCode", [
						filePath,
						effectiveRange.text,
						effectiveRange.range.start.line + 1,
						effectiveRange.range.end.line + 1,
					]),
				)

				actions.push(
					this.createAction(t("common:codeActions.improve"), vscode.CodeActionKind.QuickFix, "improveCode", [
						filePath,
						effectiveRange.text,
						effectiveRange.range.start.line + 1,
						effectiveRange.range.end.line + 1,
					]),
				)
			}

			return actions
		} catch (error) {
			console.error("Error providing code actions:", error)
			return []
		}
	}
}
