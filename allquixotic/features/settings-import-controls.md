# Settings import controls

## Why this exists
Roo already supports startup settings import from an external JSON file, but the feature is effectively hidden in VS Code configuration and is awkward to use if you want the path remembered but startup import disabled.

## Verified current behavior
- Startup import path already exists as `roo-cline.autoImportSettingsPath`.
- Startup auto-import logic lives in `src/utils/autoImportSettings.ts`.
- Roo Settings has import/export controls, but no dedicated startup import toggle or path display.

## Implemented downstream behavior
- Keeps the VS Code setting path as the source of truth.
- In Roo Settings:
  - displays the configured external JSON path read-only
  - exposes a toggle for enabling/disabling startup auto-import
  - exposes an `Import Now` action that imports from that configured path on demand

## Implemented touchpoints
- persisted enable/disable flag in global settings
- startup auto-import gated on path + enabled flag
- Roo Settings controls and webview action handling

## Validation
- path present + toggle on => startup import runs
- path present + toggle off => startup import does not run
- `Import Now` works even while startup import is disabled
