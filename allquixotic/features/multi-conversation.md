# Proper multiple independent conversations

## Why this exists
Roo already stores many tasks in history, but the runtime still behaves like a single-current-task system. The fork wants T3 Code-style task switching where each conversation can keep running independently.

## Implemented downstream behavior
- top-level tasks can stay alive concurrently
- visible-task selection is separate from task runtime ownership
- hidden tasks continue running and can keep queued messages/status updates
- the chat view shows a left-side active conversation list for switching between running roots

## Implemented touchpoints
- `src/core/webview/ClineProvider.ts`
- task lifecycle/event routing
- webview state shape and selection messages
- history/task-list UI
- chat rendering assumptions about a single current task

## Validation
- two root tasks can be alive at once
- switching visible tasks does not pause hidden tasks
- asks/todos/messages remain task-local
- task status updates remain correct while hidden
