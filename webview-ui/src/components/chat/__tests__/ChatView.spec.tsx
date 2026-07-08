// pnpm --filter @roo-code/vscode-webview test src/components/chat/__tests__/ChatView.spec.tsx

import React from "react"
import { render, waitFor, act, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import type { SuggestionItem } from "@roo-code/types"

import ChatView, { ChatViewProps } from "../ChatView"

const mockVirtuosoState = vi.hoisted(() => ({
	lastConfig: null as {
		computeItemKey?: (index: number, item: ClineMessage) => React.Key
		defaultItemHeight?: number
		increaseViewportBy?: number | { top?: number; bottom?: number }
	} | null,
}))

// Define minimal types needed for testing
interface ClineMessage {
	type: "say" | "ask"
	say?: string
	ask?: string
	task?: string
	ts: number
	text?: string
	partial?: boolean
}

interface ExtensionState {
	version: string
	clineMessages: ClineMessage[]
	taskHistory: any[]
	allowedCommands: string[]
	alwaysAllowExecute: boolean
	[key: string]: any
}

// Mock vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock use-sound hook
const mockPlayFunction = vi.fn()
vi.mock("use-sound", () => ({
	default: vi.fn().mockImplementation(() => {
		return [mockPlayFunction]
	}),
}))

// Mock components that use ESM dependencies
vi.mock("../ChatRow", () => ({
	default: function MockChatRow({
		message,
		onSuggestionClick,
	}: {
		message: ClineMessage
		onSuggestionClick?: (suggestion: SuggestionItem, event?: React.MouseEvent) => void
	}) {
		if (message.type === "ask" && message.ask === "followup" && message.text) {
			try {
				const followUp = JSON.parse(message.text) as { suggest?: SuggestionItem[] }
				return (
					<div data-testid="chat-row">
						{followUp.suggest?.map((suggestion) => (
							<button
								key={suggestion.answer}
								type="button"
								onClick={(event) => onSuggestionClick?.(suggestion, event)}>
								{suggestion.answer}
							</button>
						))}
					</div>
				)
			} catch {
				// Fall through to the generic row renderer.
			}
		}

		return <div data-testid="chat-row">{JSON.stringify(message)}</div>
	},
}))

vi.mock("../AutoApproveMenu", () => ({
	default: () => null,
}))

// Mock react-virtuoso to render items directly without virtualization
// This allows tests to verify items rendered in the chat list
vi.mock("react-virtuoso", () => ({
	Virtuoso: function MockVirtuoso({
		data,
		itemContent,
		computeItemKey,
		defaultItemHeight,
		increaseViewportBy,
	}: {
		data: ClineMessage[]
		itemContent: (index: number, item: ClineMessage) => React.ReactNode
		computeItemKey?: (index: number, item: ClineMessage) => React.Key
		defaultItemHeight?: number
		increaseViewportBy?: number | { top?: number; bottom?: number }
	}) {
		mockVirtuosoState.lastConfig = {
			computeItemKey,
			defaultItemHeight,
			increaseViewportBy,
		}

		return (
			<div data-testid="virtuoso-item-list">
				{data.map((item, index) => (
					<div key={computeItemKey?.(index, item) ?? item.ts} data-testid={`virtuoso-item-${index}`}>
						{itemContent(index, item)}
					</div>
				))}
			</div>
		)
	},
}))

// Mock QueuedMessages component
vi.mock("../QueuedMessages", () => ({
	QueuedMessages: function MockQueuedMessages({
		queue = [],
		onRemove,
	}: {
		queue?: Array<{
			id: string
			text: string
			images?: string[]
			timestamp?: number
			createdAt?: number
			updatedAt?: number
			deliveryMode?: "queue" | "steer"
		}>
		onRemove?: (messageId: string) => void
		onUpdate?: (
			message: { id: string; text: string; images?: string[] },
			updates: { text?: string; deliveryMode?: "queue" | "steer" },
		) => void
	}) {
		if (!queue || queue.length === 0) {
			return null
		}
		return (
			<div data-testid="queued-messages">
				{queue.map((msg) => (
					<div key={msg.id}>
						<span>{msg.text}</span>
						<button aria-label="Remove message" onClick={() => onRemove?.(msg.id)}>
							Remove
						</button>
					</div>
				))}
			</div>
		)
	},
}))

// Mock RooTips component
vi.mock("@src/components/welcome/RooTips", () => ({
	default: function MockRooTips() {
		return <div data-testid="roo-tips">Tips content</div>
	},
}))

// Mock RooHero component
vi.mock("@src/components/welcome/RooHero", () => ({
	default: function MockRooHero() {
		return <div data-testid="roo-hero">Hero content</div>
	},
}))

vi.mock("../../history/HistoryPreview", () => ({
	default: function MockHistoryPreview() {
		return <div data-testid="history-preview">Recent task: sensitive demo task</div>
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
	Trans: ({ i18nKey, children }: { i18nKey: string; children?: React.ReactNode }) => {
		return <>{children || i18nKey}</>
	},
}))

interface ChatTextAreaProps {
	onSend: () => void
	inputValue?: string
	setInputValue?: (value: string) => void
	sendingDisabled?: boolean
	submissionDisabled?: boolean
	submissionDisabledReason?: string
	placeholderText?: string
	selectedImages?: string[]
	shouldDisableImages?: boolean
	isStreaming?: boolean
	onStop?: () => void
}

const mockInputRef = React.createRef<HTMLInputElement>()
const mockFocus = vi.fn()

vi.mock("../ChatTextArea", () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mockReact = require("react")

	const ChatTextAreaComponent = mockReact.forwardRef(function MockChatTextArea(
		props: ChatTextAreaProps,
		ref: React.ForwardedRef<{ focus: () => void }>,
	) {
		// Use useImperativeHandle to expose the mock focus method
		mockReact.useImperativeHandle(ref, () => ({
			focus: mockFocus,
		}))

		return (
			<div
				data-testid="chat-textarea"
				data-submission-disabled={props.submissionDisabled}
				data-submission-disabled-reason={props.submissionDisabledReason}>
				<input
					ref={mockInputRef}
					type="text"
					value={props.inputValue || ""}
					onChange={(e) => {
						// Use parent's setInputValue if available
						if (props.setInputValue) {
							props.setInputValue(e.target.value)
						}
					}}
					onKeyDown={(e) => {
						// Only call onSend when Enter is pressed (simulating real behavior)
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault()
							props.onSend()
						}
					}}
					data-sending-disabled={props.sendingDisabled}
				/>
				{props.isStreaming && props.onStop && (
					<button type="button" onClick={props.onStop}>
						Stop
					</button>
				)}
			</div>
		)
	})

	return {
		default: ChatTextAreaComponent,
		ChatTextArea: ChatTextAreaComponent, // Export as named export too
	}
})

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: function MockVSCodeButton({
		children,
		onClick,
		appearance,
	}: {
		children: React.ReactNode
		onClick?: () => void
		appearance?: string
	}) {
		return (
			<button onClick={onClick} data-appearance={appearance}>
				{children}
			</button>
		)
	},
	VSCodeTextField: function MockVSCodeTextField({
		value,
		onInput,
		placeholder,
	}: {
		value?: string
		onInput?: (e: { target: { value: string } }) => void
		placeholder?: string
	}) {
		return (
			<input
				type="text"
				value={value}
				onChange={(e) => onInput?.({ target: { value: e.target.value } })}
				placeholder={placeholder}
			/>
		)
	},
	VSCodeLink: function MockVSCodeLink({ children, href }: { children: React.ReactNode; href?: string }) {
		return <a href={href}>{children}</a>
	},
}))

// Mock window.postMessage to trigger state hydration
const mockPostMessage = (state: Partial<ExtensionState>) => {
	window.postMessage(
		{
			type: "state",
			state: {
				version: "1.0.0",
				clineMessages: [],
				taskHistory: [],
				apiConfiguration: { apiProvider: "anthropic", apiKey: "test-key" },
				allowedCommands: [],
				alwaysAllowExecute: false,
				cloudIsAuthenticated: false,
				...state,
			},
		},
		"*",
	)
}

const defaultProps: ChatViewProps = {
	isHidden: false,
}

const queryClient = new QueryClient()

const renderChatView = (props: Partial<ChatViewProps> = {}) => {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatView {...defaultProps} {...props} />
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatView - Conversation Drafts", () => {
	beforeEach(() => vi.clearAllMocks())

	it("adds a new draft conversation to the sidebar when New is clicked", async () => {
		const { getByText } = renderChatView()

		mockPostMessage({
			activeConversations: [
				{
					rootTaskId: "task-1",
					activeTaskId: "task-1",
					rootTask: "Existing conversation",
					activeTask: "Existing conversation",
					ts: Date.now(),
					status: "idle",
					queuedMessageCount: 0,
					steerMessageCount: 0,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("New")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()
		fireEvent.click(getByText("New"))

		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "clearTask" })

		await waitFor(() => {
			expect(getByText("New conversation")).toBeInTheDocument()
		})
	})

	it("selects the new draft immediately even before the extension clears the previous task state", async () => {
		const { getByText } = renderChatView()

		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [{ type: "say", say: "text", ts: 1, text: "Existing conversation" }],
			activeConversations: [
				{
					rootTaskId: "task-1",
					activeTaskId: "task-1",
					rootTask: "Existing conversation",
					activeTask: "Existing conversation",
					ts: Date.now(),
					status: "idle",
					queuedMessageCount: 0,
					steerMessageCount: 0,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("New")).toBeInTheDocument()
		})

		fireEvent.click(getByText("New"))

		await waitFor(() => {
			expect(getByText("New conversation")).toBeInTheDocument()
		})

		const draftRow = getByText("New conversation").closest('[role="button"]')
		const existingRow = Array.from(document.querySelectorAll('[role="button"][aria-pressed]')).find((row) =>
			row.textContent?.includes("Existing conversation"),
		)

		expect(draftRow).toHaveAttribute("aria-pressed", "true")
		expect(existingRow).toHaveAttribute("aria-pressed", "false")
	})
	it("clears the previous task from the chat pane immediately when New is clicked", async () => {
		const { getByText, getByTestId, queryByText } = renderChatView()

		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "Existing conversation" },
				{ type: "say", say: "text", ts: 2, text: "Previous pane text" },
			],
			activeConversations: [
				{
					rootTaskId: "task-1",
					activeTaskId: "task-1",
					rootTask: "Existing conversation",
					activeTask: "Existing conversation",
					ts: Date.now(),
					status: "idle",
					queuedMessageCount: 0,
					steerMessageCount: 0,
				},
			],
		})

		await waitFor(() => {
			expect(queryByText(/Previous pane text/)).toBeInTheDocument()
			expect(getByText("New")).toBeInTheDocument()
		})

		fireEvent.click(getByText("New"))

		await waitFor(() => {
			expect(getByText("New conversation")).toBeInTheDocument()
			expect(getByTestId("roo-hero")).toBeInTheDocument()
		})
		expect(queryByText(/Previous pane text/)).not.toBeInTheDocument()
	})

	it("starts a selected draft instead of sending to stale previous task state", async () => {
		const { getByText, getByTestId } = renderChatView()

		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [
				{ type: "say", say: "task", ts: 1, text: "Existing conversation" },
				{ type: "say", say: "text", ts: 2, text: "Previous pane text" },
			],
			activeConversations: [
				{
					rootTaskId: "task-1",
					activeTaskId: "task-1",
					rootTask: "Existing conversation",
					activeTask: "Existing conversation",
					ts: Date.now(),
					status: "idle",
					queuedMessageCount: 0,
					steerMessageCount: 0,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("New")).toBeInTheDocument()
		})

		fireEvent.click(getByText("New"))

		await waitFor(() => {
			expect(getByText("New conversation")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()

		const input = getByTestId("chat-textarea").querySelector("input") as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "Start draft from stale state" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "newTask",
					taskId: expect.stringMatching(/^draft-/),
					text: "Start draft from stale state",
					images: [],
				}),
			)
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
				taskId: "task-1",
			}),
		)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "queueMessage",
				taskId: "task-1",
			}),
		)
	})

	it("reuses the selected draft id when the first message starts a task", async () => {
		const { getByText, getByTestId } = renderChatView()

		mockPostMessage({
			activeConversations: [
				{
					rootTaskId: "task-1",
					activeTaskId: "task-1",
					rootTask: "Existing conversation",
					activeTask: "Existing conversation",
					ts: Date.now(),
					status: "idle",
					queuedMessageCount: 0,
					steerMessageCount: 0,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("New")).toBeInTheDocument()
		})

		fireEvent.click(getByText("New"))

		await waitFor(() => {
			expect(getByText("New conversation")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()

		const input = getByTestId("chat-textarea").querySelector("input") as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "Start draft" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "newTask",
					taskId: expect.stringMatching(/^draft-/),
					text: "Start draft",
					images: [],
				}),
			)
		})
	})
})

describe("ChatView - Sound Playing Tests", () => {
	beforeEach(() => vi.clearAllMocks())

	it("plays celebration sound for completion results", async () => {
		renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Add completion result
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed successfully",
					partial: false, // Ensure it's not partial
				},
			],
		})

		// Wait for sound to be played
		await waitFor(() => {
			expect(mockPlayFunction).toHaveBeenCalled()
		})
	})

	it("plays progress_loop sound for api failures", async () => {
		renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Add API failure
		mockPostMessage({
			soundEnabled: true, // Enable sound
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "api_req_failed",
					ts: Date.now(),
					text: "API request failed",
					partial: false, // Ensure it's not partial
				},
			],
		})

		// Wait for sound to be played
		await waitFor(() => {
			expect(mockPlayFunction).toHaveBeenCalled()
		})
	})

	it("does not play sound when resuming a task from history", () => {
		renderChatView()

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Hydrate state with a task that has a resumeTaskId (indicating it's resumed from history)
		mockPostMessage({
			resumeTaskId: "task-123",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Resumed task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
				},
			],
		})

		// Should not play sound when resuming from history
		expect(mockPlayFunction).not.toHaveBeenCalled()
	})

	it("does not play sound when resuming a completed task from history", () => {
		renderChatView()

		// Clear any initial calls
		mockPlayFunction.mockClear()

		// Hydrate state with a completed task that has a resumeTaskId
		mockPostMessage({
			resumeTaskId: "task-123",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Resumed task",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed",
				},
			],
		})

		// Should not play sound for completion when resuming from history
		expect(mockPlayFunction).not.toHaveBeenCalled()
	})
})

describe("ChatView - Virtualization Configuration", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockVirtuosoState.lastConfig = null
	})

	it("keeps the off-screen render buffer tight for chat rows", async () => {
		renderChatView()

		const taskTs = Date.now() - 100
		const rowTs = Date.now()

		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: taskTs,
					text: "Initial task",
				},
				{
					type: "say",
					say: "text",
					ts: rowTs,
					text: "Visible row",
				},
			],
		})

		await waitFor(() => {
			expect(mockVirtuosoState.lastConfig).not.toBeNull()
		})

		expect(mockVirtuosoState.lastConfig?.defaultItemHeight).toBe(180)
		expect(mockVirtuosoState.lastConfig?.increaseViewportBy).toEqual({ top: 600, bottom: 800 })
		expect(mockVirtuosoState.lastConfig?.computeItemKey?.(1, { type: "say", ts: rowTs })).toBe(`${rowTs}-1`)
	})
})

describe("ChatView - Focus Grabbing Tests", () => {
	beforeEach(() => vi.clearAllMocks())

	it("does not grab focus when follow-up question presented", async () => {
		const { getByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Wait for the component to fully render and settle before clearing mocks

		// Wait for the debounced focus effect to fire (50ms debounce + buffer for CI variability)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100))
		})

		// Clear any initial calls after state has settled
		mockFocus.mockClear()

		// Add follow-up question
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "followup",
					ts: Date.now(),
					text: "Should I continue?",
				},
			],
		})

		// Wait for state update to complete
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Should not grab focus for follow-up questions
		expect(mockFocus).not.toHaveBeenCalled()
	})
})

describe("ChatView - No Profile State", () => {
	beforeEach(() => vi.clearAllMocks())

	it("keeps the home view visible and disables submission when there is no usable profile", async () => {
		const { getByTestId } = renderChatView()

		mockPostMessage({
			apiConfiguration: {},
			clineMessages: [],
		})

		await waitFor(() => {
			expect(getByTestId("roo-hero")).toBeInTheDocument()
		})

		const chatTextArea = getByTestId("chat-textarea")
		expect(chatTextArea.getAttribute("data-submission-disabled")).toBe("true")
		expect(chatTextArea.getAttribute("data-submission-disabled-reason")).toBe("Add a profile first!")
	})

	it("re-enables submission when a usable profile exists", async () => {
		const { getByTestId } = renderChatView()

		mockPostMessage({
			apiConfiguration: { apiProvider: "anthropic", apiKey: "test-key" },
			clineMessages: [],
		})

		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		const chatTextArea = getByTestId("chat-textarea")
		await waitFor(() => {
			expect(chatTextArea.getAttribute("data-submission-disabled")).toBe("false")
		})
		expect(chatTextArea.getAttribute("data-submission-disabled-reason")).toBeNull()
	})
})

describe("ChatView - Message Queueing Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset the mock to clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("shows sending is disabled when task is active", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with active task that should disable sending
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 1000,
					text: "Task in progress",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: true, // Partial messages disable sending
				},
			],
		})

		// Wait for state to be updated and check that sending is disabled
		await waitFor(() => {
			const chatTextArea = getByTestId("chat-textarea")
			const input = chatTextArea.querySelector("input")!
			expect(input.getAttribute("data-sending-disabled")).toBe("true")
		})
	})

	it("shows sending is enabled when no task is active", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with completed task
		mockPostMessage({
			clineMessages: [
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed",
					partial: false,
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Check that sending is enabled
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")!
		expect(input.getAttribute("data-sending-disabled")).toBe("false")
	})

	it("queues messages when API request is in progress (spinner visible)", async () => {
		const { getByTestId } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()

		// Add api_req_started without cost (spinner state - API request in progress)
		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = still streaming
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})
		await waitFor(() => {
			expect(getByTestId("virtuoso-item-list")).toHaveTextContent("api_req_started")
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user typing and sending a message during the spinner
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement
		await waitFor(() => expect(input).toHaveAttribute("data-sending-disabled", "true"))

		// Trigger message send by simulating typing and Enter key press
		await act(async () => {
			fireEvent.change(input, { target: { value: "follow-up question during spinner" } })
		})
		await waitFor(() => {
			expect(input.value).toBe("follow-up question during spinner")
		})
		await act(async () => {
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the message was queued, not sent as askResponse
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "follow-up question during spinner",
				images: [],
				deliveryMode: "queue",
				taskId: "task-1",
			})
		})

		// Verify it was NOT sent as a direct askResponse (which would get lost)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
				askResponse: "messageResponse",
			}),
		)
	})

	it("queues with the last known task id when a state blip clears currentTaskId mid-stream", async () => {
		const { getByTestId } = renderChatView()

		const streamingMessages: ClineMessage[] = [
			{
				type: "say" as const,
				say: "task" as const,
				ts: Date.now() - 2000,
				text: "Initial task",
			},
			{
				type: "say" as const,
				say: "api_req_started" as const,
				ts: Date.now(),
				text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = still streaming
			},
		]

		// Hydrate with a streaming task so the last-known task id is recorded.
		mockPostMessage({ currentTaskId: "task-1", clineMessages: streamingMessages })

		await waitFor(() => {
			expect(getByTestId("virtuoso-item-list")).toHaveTextContent("api_req_started")
		})

		// A state push built during a transient no-current-task window in the extension
		// (cancel/rehydrate, delegation swap) clears currentTaskId but keeps messages.
		mockPostMessage({ currentTaskId: undefined, clineMessages: streamingMessages })

		vi.mocked(vscode.postMessage).mockClear()

		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "message during blip" } })
		})
		await act(async () => {
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// The message must still be queued — routed via the last known task id
		// instead of being dropped on the floor.
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "message during blip",
				images: [],
				deliveryMode: "queue",
				taskId: "task-1",
			})
		})
	})

	it("sends messages normally when API request is complete (cost present)", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with completed API request (cost present)
		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({
						apiProtocol: "anthropic",
						cost: 0.05, // Cost present = streaming complete
						tokensIn: 100,
						tokensOut: 50,
					}),
				},
				{
					type: "say",
					say: "text",
					ts: Date.now(),
					text: "Response from API",
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user sending a message when API is done
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			// Use fireEvent to properly trigger React's onChange handler
			fireEvent.change(input, { target: { value: "follow-up after completion" } })

			// Simulate pressing Enter to send
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the message was sent as askResponse, not queued
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "messageResponse",
				text: "follow-up after completion",
				images: [],
				taskId: "task-1",
			})
		})

		// Verify it was NOT queued
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "queueMessage",
			}),
		)
	})

	it("preserves message order when messages sent during queue drain", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with API request in progress and existing queue
		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = still streaming
				},
			],
			messageQueue: [
				{
					id: "msg1",
					text: "queued message 1",
					images: [],
					timestamp: 1,
					createdAt: 1,
					updatedAt: 1,
					deliveryMode: "queue",
				},
				{
					id: "msg2",
					text: "queued message 2",
					images: [],
					timestamp: 2,
					createdAt: 2,
					updatedAt: 2,
					deliveryMode: "queue",
				},
			],
		})

		// Wait for state to be updated
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user sending a new message while queue has items
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "message during queue drain" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the new message was queued (not sent directly) to preserve order
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "message during queue drain",
				images: [],
				deliveryMode: "queue",
				taskId: "task-1",
			})
		})

		// Verify it was NOT sent as askResponse (which would break ordering)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
				askResponse: "messageResponse",
			}),
		)
	})

	it("queues messages during command_output state instead of losing them", async () => {
		const { getByTestId } = renderChatView()

		// Hydrate state with command_output ask (Proceed While Running state)
		mockPostMessage({
			currentTaskId: "task-1",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "command_output",
					ts: Date.now(),
					text: "",
					partial: false, // Non-partial so buttons are enabled
				},
			],
		})

		// Wait for state to be updated - need to allow time for React effects to propagate
		// (clineAsk state update -> clineAskRef.current update)
		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		// Allow React effects to complete (clineAsk -> clineAskRef sync)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50))
		})

		// Clear message calls before simulating user input
		vi.mocked(vscode.postMessage).mockClear()

		// Simulate user typing and sending a message during command execution
		const chatTextArea = getByTestId("chat-textarea")
		const input = chatTextArea.querySelector("input")! as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "message during command execution" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		// Verify that the message was queued (not lost via terminalOperation)
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "queueMessage",
				text: "message during command execution",
				images: [],
				deliveryMode: "queue",
				taskId: "task-1",
			})
		})

		// Verify it was NOT sent as terminalOperation (which would lose the message)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "terminalOperation",
			}),
		)
	})

	it("sends typed feedback from completion_result instead of starting a new task", async () => {
		const { getByTestId, getByText } = renderChatView()

		mockPostMessage({
			currentTaskId: "task-1",
			currentTaskItem: { id: "task-1" },
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Task completed",
					partial: false,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("chat:startNewTask.title")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()

		const input = getByTestId("chat-textarea").querySelector("input") as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "feedback on completed task" } })
		})

		fireEvent.click(getByText("chat:startNewTask.title"))

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "messageResponse",
			text: "feedback on completed task",
			images: [],
			taskId: "task-1",
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith({ type: "clearTask" })
	})

	it("queues typed input when Proceed While Running is clicked during command_output", async () => {
		const { getByTestId, getByText } = renderChatView()

		mockPostMessage({
			currentTaskId: "task-1",
			currentTaskItem: { id: "task-1" },
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "command_output",
					ts: Date.now(),
					text: "",
					partial: false,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("chat:proceedWhileRunning.title")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()

		const input = getByTestId("chat-textarea").querySelector("input") as HTMLInputElement

		await act(async () => {
			fireEvent.change(input, { target: { value: "message during command execution" } })
		})

		fireEvent.click(getByText("chat:proceedWhileRunning.title"))

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "queueMessage",
			text: "message during command execution",
			images: [],
			deliveryMode: "queue",
			taskId: "task-1",
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "terminalOperation",
			}),
		)
	})
})

describe("ChatView - Recent conversation preview privacy", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		const storage = new Map<string, string>([["crc.recentConversationsHidden", "false"]])
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => storage.set(key, String(value)),
				removeItem: (key: string) => storage.delete(key),
				clear: () => storage.clear(),
			},
		})
	})

	it("hides and restores the empty-state recent conversation list by button or hotkey without deleting history", async () => {
		const { getByRole, getByTestId, queryByTestId } = renderChatView()

		mockPostMessage({
			taskHistory: [
				{
					id: "task-1",
					task: "Sensitive demo task",
					ts: Date.now(),
					tokensIn: 0,
					tokensOut: 0,
					totalCost: 0,
				},
			],
		})

		await waitFor(() => {
			expect(getByTestId("history-preview")).toBeInTheDocument()
		})

		fireEvent.click(getByRole("button", { name: /Hide recent conversations/i }))

		await waitFor(() => {
			expect(queryByTestId("history-preview")).not.toBeInTheDocument()
			expect(getByTestId("recent-conversations-hidden")).toBeInTheDocument()
		})
		expect(window.localStorage.getItem("crc.recentConversationsHidden")).toBe("true")

		fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true })

		await waitFor(() => {
			expect(getByTestId("history-preview")).toBeInTheDocument()
		})
		expect(window.localStorage.getItem("crc.recentConversationsHidden")).toBe("false")

		fireEvent.keyDown(window, { key: "h", ctrlKey: true, shiftKey: true })

		await waitFor(() => {
			expect(queryByTestId("history-preview")).not.toBeInTheDocument()
			expect(getByRole("button", { name: /Show recent conversations/i })).toBeInTheDocument()
		})
		expect(window.localStorage.getItem("crc.recentConversationsHidden")).toBe("true")
	})
})

describe("ChatView - Task-local Stop and Continue state", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("clears a paused task's Continue button when switching to a running task", async () => {
		const { getByText, queryByText, getByTestId } = renderChatView()

		const activeConversations = [
			{
				rootTaskId: "task-a",
				activeTaskId: "task-a",
				rootTask: "Paused task",
				activeTask: "Paused task",
				ts: 1000,
				status: "resumable",
				queuedMessageCount: 0,
				steerMessageCount: 0,
			},
			{
				rootTaskId: "task-b",
				activeTaskId: "task-b",
				rootTask: "Running task",
				activeTask: "Running task",
				ts: 2000,
				status: "running",
				queuedMessageCount: 0,
				steerMessageCount: 0,
			},
		]

		mockPostMessage({
			currentTaskId: "task-a",
			currentTaskItem: { id: "task-a" },
			activeConversations,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: 100,
					text: "Paused task",
				},
				{
					type: "ask",
					ask: "resume_task",
					ts: 101,
					text: "",
					partial: false,
				},
			],
		})

		await waitFor(() => {
			expect(getByText("chat:resumeTask.title")).toBeInTheDocument()
		})

		mockPostMessage({
			currentTaskId: "task-b",
			currentTaskItem: { id: "task-b" },
			activeConversations,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: 200,
					text: "Running task",
				},
				{
					type: "say",
					say: "text",
					ts: 201,
					text: "Still running",
				},
			],
		})

		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
			expect(queryByText("chat:resumeTask.title")).not.toBeInTheDocument()
			expect(queryByText("chat:terminate.title")).not.toBeInTheDocument()
		})
	})

	it("includes the current task id when stopping a streaming task", async () => {
		const { getByText } = renderChatView()

		mockPostMessage({
			currentTaskId: "task-1",
			currentTaskItem: { id: "task-1" },
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: 100,
					text: "Streaming task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: 101,
					text: JSON.stringify({ apiProtocol: "anthropic" }),
				},
			],
		})

		await waitFor(() => {
			expect(getByText("Stop")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()
		fireEvent.click(getByText("Stop"))

		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "cancelTask", taskId: "task-1" })
	})
})

describe("ChatView - Follow-up Suggestions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("switches to a known mode from a malformed object mode suggestion", async () => {
		const { getByRole } = renderChatView()

		mockPostMessage({
			mode: "ask",
			customModes: [],
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 1000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "followup",
					ts: Date.now(),
					text: JSON.stringify({
						question: "Switch mode?",
						suggest: [{ answer: "Use code mode", mode: { mode_slug: "code" } }],
					}),
					partial: false,
				},
			],
		})

		const suggestion = await waitFor(() => getByRole("button", { name: "Use code mode" }))
		vi.mocked(vscode.postMessage).mockClear()

		fireEvent.click(suggestion)

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({ type: "mode", text: "code" })
		})
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "messageResponse",
			text: "Use code mode",
			images: [],
		})
	})

	it("does not switch modes for an unknown malformed object mode suggestion", async () => {
		const { getByRole } = renderChatView()

		mockPostMessage({
			mode: "ask",
			customModes: [],
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 1000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "followup",
					ts: Date.now(),
					text: JSON.stringify({
						question: "Switch mode?",
						suggest: [{ answer: "Use invalid mode", mode: { mode_slug: "not-a-mode" } }],
					}),
					partial: false,
				},
			],
		})

		const suggestion = await waitFor(() => getByRole("button", { name: "Use invalid mode" }))
		vi.mocked(vscode.postMessage).mockClear()

		fireEvent.click(suggestion)

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "messageResponse",
				text: "Use invalid mode",
				images: [],
			})
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "mode" }))
	})
})

describe("ChatView - Context Condensing Indicator Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should add a condensing message to groupedMessages when isCondensing is true", async () => {
		// This test verifies that when the condenseTaskContextStarted message is received,
		// the isCondensing state is set to true and a synthetic condensing message is added
		// to the grouped messages list
		const { getByTestId, container } = renderChatView()

		// First hydrate state with an active task
		mockPostMessage({
			currentTaskId: "test-task-id",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 1000,
					text: JSON.stringify({ apiProtocol: "anthropic" }),
				},
			],
		})

		// Wait for component to render
		await waitFor(() => {
			expect(getByTestId("chat-view")).toBeInTheDocument()
		})

		// Allow time for useEvent hook to register message listener
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10))
		})

		// Dispatch a MessageEvent directly to trigger the message handler
		// This simulates the VSCode extension sending a message to the webview
		await act(async () => {
			const event = new MessageEvent("message", {
				data: {
					type: "condenseTaskContextStarted",
					text: "test-task-id",
				},
			})
			window.dispatchEvent(event)
			// Wait for React state updates
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		// Check that groupedMessages now includes a condensing message
		// With Virtuoso mocked, items render directly and we can find the ChatRow with partial condense_context message
		await waitFor(
			() => {
				const rows = container.querySelectorAll('[data-testid="chat-row"]')
				// Check for the actual message structure: partial condense_context message
				const condensingRow = Array.from(rows).find((row) => {
					const text = row.textContent || ""
					return text.includes('"say":"condense_context"') && text.includes('"partial":true')
				})
				expect(condensingRow).toBeTruthy()
			},
			{ timeout: 2000 },
		)
	})

	it("does not show a condensing message for a different task", async () => {
		const { getByTestId, container } = renderChatView()

		mockPostMessage({
			currentTaskId: "current-task-id",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Current task",
				},
			],
		})

		await waitFor(() => {
			expect(getByTestId("chat-view")).toBeInTheDocument()
		})

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "condenseTaskContextStarted",
						text: "other-task-id",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		const rows = container.querySelectorAll('[data-testid="chat-row"]')
		const condensingRow = Array.from(rows).find((row) => {
			const text = row.textContent || ""
			return text.includes('"say":"condense_context"') && text.includes('"partial":true')
		})
		expect(condensingRow).toBeUndefined()
	})

	it("keeps the current task condensing indicator when another task responds", async () => {
		const { getByTestId, container } = renderChatView()

		mockPostMessage({
			currentTaskId: "current-task-id",
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Current task",
				},
			],
		})

		await waitFor(() => {
			expect(getByTestId("chat-view")).toBeInTheDocument()
		})

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "condenseTaskContextStarted",
						text: "current-task-id",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		await waitFor(() => {
			const rows = container.querySelectorAll('[data-testid="chat-row"]')
			const condensingRow = Array.from(rows).find((row) => {
				const text = row.textContent || ""
				return text.includes('"say":"condense_context"') && text.includes('"partial":true')
			})
			expect(condensingRow).toBeTruthy()
		})

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "condenseTaskContextResponse",
						text: "other-task-id",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		let rows = container.querySelectorAll('[data-testid="chat-row"]')
		let condensingRow = Array.from(rows).find((row) => {
			const text = row.textContent || ""
			return text.includes('"say":"condense_context"') && text.includes('"partial":true')
		})
		expect(condensingRow).toBeTruthy()

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "condenseTaskContextResponse",
						text: "current-task-id",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		await waitFor(() => {
			rows = container.querySelectorAll('[data-testid="chat-row"]')
			condensingRow = Array.from(rows).find((row) => {
				const text = row.textContent || ""
				return text.includes('"say":"condense_context"') && text.includes('"partial":true')
			})
			expect(condensingRow).toBeUndefined()
		})
	})
})

describe("ChatView - Compact Command Routing Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(vscode.postMessage).mockClear()
	})

	it("sends /compact-and follow-up to the original task after switching tasks", async () => {
		const { getByTestId } = renderChatView()

		const activeConversations = [
			{
				rootTaskId: "task-a",
				activeTaskId: "task-a",
				rootTask: "Task A",
				activeTask: "Task A",
				ts: Date.now() - 1000,
				status: "idle",
				queuedMessageCount: 0,
				steerMessageCount: 0,
			},
			{
				rootTaskId: "task-b",
				activeTaskId: "task-b",
				rootTask: "Task B",
				activeTask: "Task B",
				ts: Date.now(),
				status: "idle",
				queuedMessageCount: 0,
				steerMessageCount: 0,
			},
		]

		mockPostMessage({
			currentTaskId: "task-a",
			currentTaskItem: { id: "task-a" },
			activeConversations,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Task A",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now() - 1000,
					text: "Done",
				},
			],
		})

		await waitFor(() => {
			expect(getByTestId("chat-textarea")).toBeInTheDocument()
		})

		vi.mocked(vscode.postMessage).mockClear()

		const input = getByTestId("chat-textarea").querySelector("input") as HTMLInputElement
		await act(async () => {
			fireEvent.change(input, { target: { value: "/compact-and continue task A" } })
			fireEvent.keyDown(input, { key: "Enter", code: "Enter" })
		})

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "condenseTaskContextRequest",
				text: "task-a",
			})
		})

		mockPostMessage({
			currentTaskId: "task-b",
			currentTaskItem: { id: "task-b" },
			activeConversations,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 500,
					text: "Task B",
				},
				{
					type: "ask",
					ask: "completion_result",
					ts: Date.now(),
					text: "Done",
				},
			],
		})

		vi.mocked(vscode.postMessage).mockClear()

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "condenseTaskContextResponse",
						text: "task-a",
					},
				}),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
		})

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "messageResponse",
				text: "continue task A",
				images: [],
				taskId: "task-a",
			})
		})
		expect(vscode.postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "askResponse",
				text: "continue task A",
				taskId: "task-b",
			}),
		)
	})
})
