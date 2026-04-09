import { fireEvent, render, screen } from "@/utils/test-utils"

import ActiveConversationList, { type ConversationListItem } from "../ActiveConversationList"

describe("ActiveConversationList", () => {
	const taskConversation: ConversationListItem = {
		kind: "task",
		rootTaskId: "task-1",
		activeTaskId: "task-1",
		rootTask: "Existing conversation",
		activeTask: "Existing conversation",
		ts: Date.now(),
		status: "idle",
		queuedMessageCount: 0,
	}

	const draftConversation: ConversationListItem = {
		kind: "draft",
		rootTaskId: "draft-1",
		activeTaskId: "draft-1",
		rootTask: "New conversation",
		activeTask: "New conversation",
		ts: Date.now() - 1000,
		status: "none",
		queuedMessageCount: 0,
	}

	it("calls onCreateConversation when the New button is clicked", () => {
		const onCreateConversation = vi.fn()

		render(
			<ActiveConversationList
				conversations={[taskConversation]}
				selectedConversationId={taskConversation.activeTaskId}
				onCreateConversation={onCreateConversation}
				onSelectConversation={vi.fn()}
				onDeleteConversation={vi.fn()}
				onArchiveConversation={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByText("New"))

		expect(onCreateConversation).toHaveBeenCalled()
	})

	it("shows archive in the context menu for real conversations", () => {
		const onArchiveConversation = vi.fn()

		render(
			<ActiveConversationList
				conversations={[taskConversation]}
				selectedConversationId={taskConversation.activeTaskId}
				onCreateConversation={vi.fn()}
				onSelectConversation={vi.fn()}
				onDeleteConversation={vi.fn()}
				onArchiveConversation={onArchiveConversation}
			/>,
		)

		const row = screen.getByText("Existing conversation").closest('[role="button"]') as HTMLElement
		fireEvent.contextMenu(row)
		fireEvent.click(screen.getByText("Archive"))

		expect(onArchiveConversation).toHaveBeenCalledWith(taskConversation)
	})

	it("calls onDeleteConversation for draft rows from the hover trash button", () => {
		const onDeleteConversation = vi.fn()

		render(
			<ActiveConversationList
				conversations={[draftConversation]}
				selectedConversationId={draftConversation.activeTaskId}
				onCreateConversation={vi.fn()}
				onSelectConversation={vi.fn()}
				onDeleteConversation={onDeleteConversation}
				onArchiveConversation={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByLabelText("Delete conversation"))

		expect(onDeleteConversation).toHaveBeenCalledWith(draftConversation)
	})
})
