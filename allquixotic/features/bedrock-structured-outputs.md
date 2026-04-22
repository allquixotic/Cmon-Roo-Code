# AWS Bedrock structured outputs (strict tool use)

## Why this exists

AWS Bedrock's Converse API supports structured outputs via a `strict: true` flag on each tool definition. When set, Bedrock validates the model's tool arguments against the supplied JSON Schema (draft 2020-12 subset) so downstream code can rely on shape-correct payloads instead of paying for post-hoc parsing and retries. Upstream Roo/CRC sent native tools to Bedrock without strict validation, so tool-call arguments could drift from schema on any supported model — wasting tokens on malformed invocations and requiring defensive parsing in the agent loop.

## Verified current behavior

- Bedrock handler at `src/api/providers/bedrock.ts` sends `toolConfig.tools` via `ConverseStreamCommand` without any strict flag; tool schemas are already normalized to JSON Schema draft 2020-12 via `normalizeToolSchema()` in `src/utils/json-schema.ts`.
- `ApiHandlerCreateMessageMetadata` (in `src/api/index.ts`) carries `tools`, `tool_choice`, `taskId`, `mode`; no per-provider extension points existed for Bedrock-specific state.
- `ERROR_TYPES` in `bedrock.ts` classifies throttling / validation / access-denied / quota / model-not-ready / internal-server errors, but has no awareness of structured-output-specific failures.
- Global state (`ContextProxy` → `GLOBAL_STATE_KEYS`, declared in `packages/types/src/global-settings.ts`) is the established place for hidden per-install cache data; secrets go in `SECRET_STATE_KEYS`.

## Implemented downstream behavior

- New per-profile checkbox **Attempt strict structured output** in the Bedrock Roo Settings panel. Default **enabled** when the setting is missing; user can uncheck to force the pre-feature behavior.
- When a request goes out and strict is eligible (profile enabled AND at least one native tool AND the target model has not been recently marked unsupported), each tool spec in the Converse payload carries `strict: true`.
- First real request is the smoke test — no synthetic probe. If Bedrock rejects the request with a structured-output-indicative error (400 with a pattern like "does not support strict", "strict is not supported", "textformat is not supported", "output_config is not supported"), the handler:
    1. Marks the model ID as unsupported in a hidden global-state record `bedrockStructuredOutputUnsupported` (map: modelId → expiry epoch ms, TTL 30 days).
    2. Yields a user-visible chunk with the **verbatim Bedrock error message** and a notice that strict mode has been disabled for that model for 30 days.
    3. Rebuilds the payload with `strict` stripped and silently retries once. Subsequent requests on the same model skip strict until the 30-day entry expires.
- When Bedrock signals the schema is still being compiled ("up to a few minutes" per AWS docs — we pattern-match messages like "schema is being compiled", "grammar compilation", "schema compilation in progress" on 400/503), the handler enters a bounded polling loop: 6 attempts max, total wait capped at 180 s, initial 3 s delay growing ×1.7 per attempt up to 45 s per step. Each wait yields a text chunk telling the user what's happening and which attempt is next.
- Expired cache entries (value <= now) are pruned lazily on the next write to `bedrockStructuredOutputUnsupported`, so a model gets re-probed automatically 30 days after its last observed rejection.
- **Schema normalization for strict mode**: Bedrock rejects several JSON Schema constraints under strict even on otherwise-supporting models — specifically numeric `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`multipleOf`, array `maxItems`, and array `minItems > 1`. (Verified empirically against the live API in pydantic-ai [PR #4237](https://github.com/pydantic/pydantic-ai/pull/4237).) Without handling these, a supported model like Claude Sonnet would be falsely cached as unsupported the first time a tool with such a constraint is used. When strict is enabled, we strip these constraints from the tool schema and append their former values to the schema's `description` as a hint to the model (e.g., `"How many times to replace (minimum=1)"`). This is a pure-schema transform — string constraints (`minLength`, `maxLength`, `pattern`, `format`), `enum`/`const`/`default`, `$ref`/`$defs`, `anyOf`/`oneOf`, and `additionalProperties: false` are all preserved. Two real CRC tool schemas triggered this — `edit_file` (`expected_replacements: minimum 1`) and `ask_followup_question` (`follow_up: minItems 1, maxItems 4`) — both now pass cleanly.
- All other provider handlers are untouched. The two new `ApiHandlerCreateMessageMetadata` fields (`isModelStructuredOutputUnsupported`, `markModelStructuredOutputUnsupported`) are optional and read only inside `AwsBedrockHandler`; non-Bedrock providers see no behavior change.

## Implemented touchpoints

- `packages/types/src/provider-settings.ts` — add `awsBedrockStructuredOutput: z.boolean().optional()` to `bedrockSchema` (default ON at read site via `?? true`).
- `packages/types/src/global-settings.ts` — add hidden `bedrockStructuredOutputUnsupported: z.record(z.string(), z.number()).optional()` to `globalSettingsSchema`.
- `src/shared/bedrock-structured-output-cache.ts` (new) — pure helper exporting `isUnsupported`, `markUnsupported`, `THIRTY_DAYS_MS`.
- `src/api/index.ts` — extend `ApiHandlerCreateMessageMetadata` with the two optional Bedrock-specific accessors.
- `src/core/task/Task.ts` — private method `getBedrockStructuredOutputAccessors()` plumbed into all four metadata construction sites, reading/writing via `providerRef.deref()?.contextProxy`.
- `src/api/providers/bedrock.ts` — `convertToolsForBedrock(tools, { strict })` adds `strict: true` per toolSpec and runs the input schema through the Bedrock strict-incompatible-constraint stripper; `createMessage` wraps `client.send(...)` in a preflight retry loop that handles the two new error types; two new `ERROR_TYPES` entries (`STRUCTURED_OUTPUT_UNSUPPORTED`, `STRUCTURED_OUTPUT_COMPILING`) with HTTP-status gating so they don't swallow unrelated 400/503 errors.
- `src/utils/json-schema.ts` — new `stripBedrockStrictIncompatibleConstraints()` exported alongside `normalizeToolSchema()`. Recursive tree-walk transform that strips numeric `minimum`/`maximum`/etc. and array `maxItems`/`minItems > 1`, appending the stripped values to the schema's description.
- `webview-ui/src/components/settings/providers/Bedrock.tsx` — checkbox always visible in the Bedrock profile panel.
- `webview-ui/src/i18n/locales/*/settings.json` — three new keys (`awsBedrockStructuredOutput`, `awsBedrockStructuredOutputTooltip`, `awsBedrockStructuredOutputDescription`) in every locale.

## Validation

- Supported model (e.g. `anthropic.claude-sonnet-4-5-20250929-v1:0`): first request carries `strict: true` on tool specs and streams a clean, schema-valid tool call; no fallback chunks; no entry in `bedrockStructuredOutputUnsupported`.
- Unsupported model (e.g. an older Titan/Llama variant): first request fails at send-time with a 400; user sees a text chunk containing the verbatim Bedrock error plus the disablement notice; global state gets a new entry for that model with expiry ≈ now + 30 days; second request on the same model omits `strict` silently, no further user-visible notice.
- Schema-compile simulation (inject a 400 with "schema is being compiled" on first N attempts, then success): user sees N progress chunks with attempt numbers and wait durations; streaming eventually proceeds normally.
- Cache expiry: manually time-travel an entry to the past; next request treats the model as supported again and re-attempts with strict on.
- Non-Bedrock providers: identical network payloads before and after the change; the two new metadata accessors are never invoked.
