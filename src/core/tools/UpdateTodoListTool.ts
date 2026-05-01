import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import cloneDeep from "clone-deep"
import crypto from "crypto"
import { TodoItem, TodoStatus, todoStatusSchema } from "@roo-code/types"
import { getLatestTodo } from "../../shared/todo"

interface UpdateTodoListParams {
	todos: string
}

const pendingTodoListsByApproval = new Map<string, TodoItem[]>()
const activeTodoApprovalKeyByTask = new Map<string, string>()

function getTodoApprovalKey(taskId: string, toolCallId?: string): string {
	return `${taskId}:${toolCallId || "current"}`
}

function setPendingTodoListForApproval(taskId: string, todos: TodoItem[], toolCallId?: string): void {
	const key = getTodoApprovalKey(taskId, toolCallId)
	pendingTodoListsByApproval.set(key, cloneDeep(todos))
	activeTodoApprovalKeyByTask.set(taskId, key)
}

function getPendingTodoListForApproval(taskId: string, toolCallId?: string): TodoItem[] | undefined {
	return pendingTodoListsByApproval.get(getTodoApprovalKey(taskId, toolCallId))
}

function clearPendingTodoListForApproval(taskId: string, toolCallId?: string): void {
	const key = getTodoApprovalKey(taskId, toolCallId)
	pendingTodoListsByApproval.delete(key)
	if (activeTodoApprovalKeyByTask.get(taskId) === key) {
		activeTodoApprovalKeyByTask.delete(taskId)
	}
}

export class UpdateTodoListTool extends BaseTool<"update_todo_list"> {
	readonly name = "update_todo_list" as const

	async execute(params: UpdateTodoListParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			const todosRaw = params.todos

			let todos: TodoItem[]
			try {
				todos = parseMarkdownChecklist(todosRaw || "")
			} catch {
				task.consecutiveMistakeCount++
				task.recordToolError("update_todo_list")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("The todos parameter is not valid markdown checklist or JSON"))
				return
			}

			const { valid, error } = validateTodos(todos)
			if (!valid) {
				task.consecutiveMistakeCount++
				task.recordToolError("update_todo_list")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(error || "todos parameter validation failed"))
				return
			}

			let normalizedTodos: TodoItem[] = todos.map((t) => ({
				id: t.id,
				content: t.content,
				status: normalizeStatus(t.status),
			}))

			const approvalMsg = JSON.stringify({
				tool: "updateTodoList",
				todos: normalizedTodos,
				taskId: task.taskId,
				toolCallId: callbacks.toolCallId,
			})

			setPendingTodoListForApproval(task.taskId, normalizedTodos, callbacks.toolCallId)
			try {
				const didApprove = await askApproval("tool", approvalMsg)
				if (!didApprove) {
					pushToolResult("User declined to update the todoList.")
					return
				}

				const pendingTodoList = getPendingTodoListForApproval(task.taskId, callbacks.toolCallId)
				const isTodoListChanged =
					pendingTodoList !== undefined && JSON.stringify(normalizedTodos) !== JSON.stringify(pendingTodoList)
				if (isTodoListChanged) {
					normalizedTodos = cloneDeep(pendingTodoList ?? [])
					await task.say(
						"user_edit_todos",
						JSON.stringify({
							tool: "updateTodoList",
							todos: normalizedTodos,
							taskId: task.taskId,
							toolCallId: callbacks.toolCallId,
						}),
					)
				}

				await setTodoListForTask(task, normalizedTodos)

				if (isTodoListChanged) {
					const md = todoListToMarkdown(normalizedTodos)
					pushToolResult(formatResponse.toolResult("User edits todo:\n\n" + md))
				} else {
					pushToolResult(formatResponse.toolResult("Todo list updated successfully."))
				}
			} finally {
				clearPendingTodoListForApproval(task.taskId, callbacks.toolCallId)
			}
		} catch (error) {
			await handleError("update todo list", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"update_todo_list">): Promise<void> {
		const todosRaw = block.params.todos

		// Parse the markdown checklist to maintain consistent format with execute()
		let todos: TodoItem[]
		try {
			todos = parseMarkdownChecklist(todosRaw || "")
		} catch {
			// If parsing fails during partial, send empty array
			todos = []
		}

		const approvalMsg = JSON.stringify({
			tool: "updateTodoList",
			todos: todos,
			taskId: task.taskId,
			toolCallId: block.id,
		})
		await task.ask("tool", approvalMsg, block.partial).catch(() => {})
	}
}

export function addTodoToTask(cline: Task, content: string, status: TodoStatus = "pending", id?: string): TodoItem {
	const todo: TodoItem = {
		id: id ?? crypto.randomUUID(),
		content,
		status,
	}
	if (!cline.todoList) cline.todoList = []
	cline.todoList.push(todo)
	return todo
}

export function updateTodoStatusForTask(cline: Task, id: string, nextStatus: TodoStatus): boolean {
	if (!cline.todoList) return false
	const idx = cline.todoList.findIndex((t) => t.id === id)
	if (idx === -1) return false
	const current = cline.todoList[idx]
	if (
		(current.status === "pending" && nextStatus === "in_progress") ||
		(current.status === "in_progress" && nextStatus === "completed") ||
		current.status === nextStatus
	) {
		cline.todoList[idx] = { ...current, status: nextStatus }
		return true
	}
	return false
}

export function removeTodoFromTask(cline: Task, id: string): boolean {
	if (!cline.todoList) return false
	const idx = cline.todoList.findIndex((t) => t.id === id)
	if (idx === -1) return false
	cline.todoList.splice(idx, 1)
	return true
}

export function getTodoListForTask(cline: Task): TodoItem[] | undefined {
	return cline.todoList?.slice()
}

export async function setTodoListForTask(cline?: Task, todos?: TodoItem[]) {
	if (cline === undefined) return
	cline.todoList = Array.isArray(todos) ? todos : []
}

export function restoreTodoListForTask(cline: Task, todoList?: TodoItem[]) {
	if (todoList) {
		cline.todoList = Array.isArray(todoList) ? todoList : []
		return
	}
	cline.todoList = getLatestTodo(cline.clineMessages)
}

function todoListToMarkdown(todos: TodoItem[]): string {
	return todos
		.map((t) => {
			let box = "[ ]"
			if (t.status === "completed") box = "[x]"
			else if (t.status === "in_progress") box = "[-]"
			return `${box} ${t.content}`
		})
		.join("\n")
}

function normalizeStatus(status: string | undefined): TodoStatus {
	if (status === "completed") return "completed"
	if (status === "in_progress") return "in_progress"
	return "pending"
}

function getTodoId(content: string, status: TodoStatus): string {
	return crypto
		.createHash("md5")
		.update(content + status)
		.digest("hex")
}

function normalizeTodoItem(todo: TodoItem): TodoItem {
	const content = typeof todo.content === "string" ? todo.content : ""
	const status = normalizeStatus(todo.status)
	return {
		id: typeof todo.id === "string" && todo.id ? todo.id : getTodoId(content, status),
		content,
		status,
	}
}

export function parseMarkdownChecklist(md: string): TodoItem[] {
	if (typeof md !== "string") return []
	const lines = md
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
	const todos: TodoItem[] = []
	for (const line of lines) {
		const match = line.match(/^(?:-\s*)?\[\s*([ xX\-~])\s*\]\s+(.+)$/)
		if (!match) continue
		let status: TodoStatus = "pending"
		if (match[1] === "x" || match[1] === "X") status = "completed"
		else if (match[1] === "-" || match[1] === "~") status = "in_progress"
		const id = getTodoId(match[2], status)
		todos.push({
			id,
			content: match[2],
			status,
		})
	}
	return todos
}

export function setPendingTodoList(taskId: string | undefined, todos: TodoItem[], toolCallId?: string) {
	if (!taskId) {
		return
	}

	const key = toolCallId ? getTodoApprovalKey(taskId, toolCallId) : activeTodoApprovalKeyByTask.get(taskId)
	if (!key) {
		return
	}
	if (!pendingTodoListsByApproval.has(key)) {
		return
	}

	pendingTodoListsByApproval.set(key, cloneDeep(todos.map((todo) => normalizeTodoItem(todo))))
}

function validateTodos(todos: any[]): { valid: boolean; error?: string } {
	if (!Array.isArray(todos)) return { valid: false, error: "todos must be an array" }
	for (const [i, t] of todos.entries()) {
		if (!t || typeof t !== "object") return { valid: false, error: `Item ${i + 1} is not an object` }
		if (!t.id || typeof t.id !== "string") return { valid: false, error: `Item ${i + 1} is missing id` }
		if (!t.content || typeof t.content !== "string")
			return { valid: false, error: `Item ${i + 1} is missing content` }
		if (t.status && !todoStatusSchema.options.includes(t.status as TodoStatus))
			return { valid: false, error: `Item ${i + 1} has invalid status` }
	}
	return { valid: true }
}

export const updateTodoListTool = new UpdateTodoListTool()
