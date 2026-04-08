import type { ActiveConversationSummary } from "@roo-code/types"

import { Button } from "@src/components/ui"
import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"

interface ActiveConversationListProps {
	conversations: ActiveConversationSummary[]
	currentTaskId?: string
}

const STATUS_LABELS: Record<ActiveConversationSummary["status"], string> = {
	running: "Running",
	interactive: "Waiting",
	resumable: "Paused",
	idle: "Idle",
	none: "Ready",
}

export default function ActiveConversationList({
	conversations,
	currentTaskId,
}: ActiveConversationListProps) {
	if (conversations.length === 0) {
		return null
	}

	return (
		<aside className="flex w-[220px] shrink-0 flex-col border-r border-vscode-editorGroup-border bg-vscode-sideBar-background/40">
			<div className="flex items-center justify-between gap-2 border-b border-vscode-editorGroup-border px-3 py-2">
				<div className="min-w-0">
					<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vscode-descriptionForeground">
						Conversations
					</div>
					<div className="text-xs text-vscode-descriptionForeground">{conversations.length} active</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={() => vscode.postMessage({ type: "clearTask" })}>
					New
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				<div className="flex flex-col gap-1">
					{conversations.map((conversation) => {
						const isActive = conversation.activeTaskId === currentTaskId
						const subtitle =
							conversation.activeTaskId !== conversation.rootTaskId
								? `${conversation.activeTask} · ${STATUS_LABELS[conversation.status]}`
								: STATUS_LABELS[conversation.status]

						return (
							<button
								key={conversation.activeTaskId}
								type="button"
								onClick={() =>
									vscode.postMessage({ type: "showTaskWithId", text: conversation.activeTaskId })
								}
								className={cn(
									"flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
									"border-transparent bg-transparent hover:border-vscode-focusBorder/40 hover:bg-vscode-list-hoverBackground",
									isActive &&
										"border-vscode-focusBorder bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground",
								)}>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 text-sm font-medium leading-5">
										<div className="truncate">{conversation.rootTask}</div>
									</div>
									{conversation.queuedMessageCount > 0 && (
										<span
											className={cn(
												"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
												isActive
													? "bg-vscode-badge-background text-vscode-badge-foreground"
													: "bg-vscode-badge-background/80 text-vscode-badge-foreground",
											)}>
											{conversation.queuedMessageCount}
										</span>
									)}
								</div>
								<div
									className={cn(
										"text-xs leading-4",
										isActive ? "opacity-80" : "text-vscode-descriptionForeground",
									)}>
									<div className="truncate">{subtitle}</div>
								</div>
							</button>
						)
					})}
				</div>
			</div>
		</aside>
	)
}
