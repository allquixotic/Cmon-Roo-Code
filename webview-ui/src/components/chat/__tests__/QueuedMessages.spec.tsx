import { render, fireEvent, screen } from "@src/utils/test-utils"

import type { QueuedMessage } from "@roo-code/types"

import { QueuedMessages } from "../QueuedMessages"

vi.mock("../Mention", () => ({
	Mention: ({ text }: { text: string }) => <span>{text}</span>,
}))

vi.mock("../../common/Thumbnails", () => ({
	default: () => null,
}))

const baseMessage: QueuedMessage = {
	id: "queued-1",
	text: "please add here",
	images: [],
	timestamp: 1,
	createdAt: 1,
	updatedAt: 1,
	deliveryMode: "steer",
}

describe("QueuedMessages", () => {
	it("does not move the caret to the end when the queue rerenders during an edit", () => {
		const onRemove = vi.fn()
		const onUpdate = vi.fn()
		const { rerender } = render(<QueuedMessages queue={[baseMessage]} onRemove={onRemove} onUpdate={onUpdate} />)

		fireEvent.click(screen.getByText("please add here"))

		const textarea = screen.getByDisplayValue("please add here") as HTMLTextAreaElement
		expect(textarea.selectionStart).toBe("please add here".length)
		expect(textarea.selectionEnd).toBe("please add here".length)

		fireEvent.change(textarea, { target: { value: "please add a word here" } })
		const editedTextarea = screen.getByDisplayValue("please add a word here") as HTMLTextAreaElement
		editedTextarea.setSelectionRange(13, 13)

		rerender(<QueuedMessages queue={[{ ...baseMessage, updatedAt: 2 }]} onRemove={onRemove} onUpdate={onUpdate} />)

		expect(screen.getByDisplayValue("please add a word here")).toBe(editedTextarea)
		expect(editedTextarea.selectionStart).toBe(13)
		expect(editedTextarea.selectionEnd).toBe(13)
	})
})
