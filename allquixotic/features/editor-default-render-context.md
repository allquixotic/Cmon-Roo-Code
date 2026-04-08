# Editor-pane-by-default render context

## Why this exists
Roo can already pop out into an editor tab, but that is an explicit command rather than the default open/focus behavior.

## Verified current behavior
- Roo contributes a sidebar-first view container in `src/package.json`.
- Opening in the editor pane is currently handled through explicit commands in `src/activate/registerCommands.ts`.
- Focus behavior still prefers whichever panel already exists.

## Implemented downstream behavior
- Adds a persisted preference for default render context.
- When set to editor:
  - new/open/focus flows prefer editor tabs in the main editor area
  - sidebar mode remains available and supported

## Implemented touchpoints
- extension/global state
- command handlers (`plus`, `focus`, `open in editor`)
- provider/render-context propagation
- settings UI + i18n

## Validation
- editor-preferred mode opens Roo in the main editor pane by default
- sidebar-preferred mode preserves current behavior
- existing manual movement between areas still works
