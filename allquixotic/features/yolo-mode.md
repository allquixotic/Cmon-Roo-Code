# YOLO mode downstream feature

## Why this exists
Roo’s current auto-approval model is granular but still approval-centric. It does not provide a single “trust the agent for everything except direct questions” mode.

## Verified current behavior
- Auto-approval decisions are handled in `src/core/auto-approval/index.ts`.
- Follow-up questions can auto-select the first suggestion after a timeout.
- The approval button bar still appears in the chat view for tool/command asks.

## Implemented downstream behavior
- Adds a `YOLO mode` checkbox in Roo Settings.
- When enabled:
  - follow-up questions always ask and wait indefinitely
  - read/write/MCP/mode/subtask/execute asks short-circuit to auto-approval
  - the normal delayed approval button bar is suppressed for those short-circuited asks
- YOLO mode still respects:
  - denied command prefixes
  - protected or otherwise explicitly denied file writes

## Implemented touchpoints
- types/settings schema + extension state serialization
- settings UI + i18n
- auto-approval policy logic
- chat ask/approval rendering

## Validation
- questions still block for user input
- denied commands are still denied
- protected writes are still blocked
- no approve/reject button flash for short-circuited asks
