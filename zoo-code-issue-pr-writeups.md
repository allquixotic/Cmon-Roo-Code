# Zoo Code issue and PR write-ups for CRC branches

Prepared: 2026-05-15

Target repository: https://github.com/Zoo-Code-Org/Zoo-Code

Fork branch source: https://github.com/allquixotic/Cmon-Roo-Code

Base reviewed: `zoo/main`

Submitter Discord: `coorbin`

Created upstream so far:

- Issue #124 / draft PR #125: Robust Amazon Bedrock support
- Issue #126 / draft PR #128: Concurrent conversations sidebar
- Issue #127 / draft PR #129: Compact slash commands
- Issue #130 / draft PR #135: Persist local prompt and draft history
- Issue #131 / draft PR #136: Parallelize safe read-only command batches
- Issue #132 / draft PR #137: YOLO mode
- Issue #133 / draft PR #138: Queue and steer deferred message delivery
- Issue #134 / draft PR #139: Remove unsolicited nag/announcement surfaces

## Scope

This file contains draft GitHub Issue bodies and Pull Request bodies for the Zoo Code PR branches created from CRC work today. It excludes `allquixotic`, per request.

Included PR branches:

| Branch                              | Commit      | Intended PR order | Notes                                                                                                                             |
| ----------------------------------- | ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `zoo-port/bedrock-robust-support`   | `c72dc1699` | 1                 | Independent Bedrock provider improvement.                                                                                         |
| `zoo-port/concurrent-conversations` | `df09e55d2` | 2                 | Independent UI/core feature.                                                                                                      |
| `zoo-port/compact-slash-commands`   | `b84115304` | 3                 | Independent chat command feature.                                                                                                 |
| `zoo-port/persist-prompt-history`   | `b7aa0c22e` | 4                 | Independent chat input persistence feature.                                                                                       |
| `zoo-port/parallel-safe-commands`   | `aa9b6e3f2` | 5                 | Independent core performance feature.                                                                                             |
| `zoo-port/yolo-mode`                | `eeb92ad09` | 6                 | Independent auto-approval feature.                                                                                                |
| `zoo-port/queue-steer`              | `86d7f7f10` | 7                 | Depends on `zoo-port/concurrent-conversations`; open after that PR merges or as an explicitly stacked PR if maintainers allow it. |
| `zoo-port/nag-removals`             | `0ff2a2057` | 8                 | Independent UI cleanup/removal branch, but product-policy sensitive.                                                              |

Not included as PR branches:

| Branch                              | Reason                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `allquixotic`                       | Explicitly excluded.                                                                  |
| `zoo-port/integration`              | Integration branch only; it combines all feature branches and is not a bite-sized PR. |
| `zoo-port/bedrock-target-discovery` | No diff from `zoo/main`; not a PR branch.                                             |

## Zoo contribution requirements reviewed

Reviewed files in Zoo Code:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`

Relevant requirements:

- Search existing issues before opening a new one.
- Open an approved GitHub Issue before opening each PR.
- Comment "Claiming" on the issue and coordinate with the core team on Discord to be assigned before doing/submitting the work.
- Keep each PR focused on one feature or fix.
- Link every PR to its approved issue with `Closes: #...`.
- Provide a clear test procedure.
- Include screenshots or video for UI changes when applicable.
- Consider documentation impact.
- Follow the code of conduct: respectful, inclusive communication; report issues to `support@zoocode.dev`.

Compliance gaps that cannot be fixed in the branches before issue creation:

- If maintainers require issue numbers in commit messages, amend or re-cherry-pick the final commits after issue numbers exist.
- UI PRs should get screenshots or a short recording before submission.
- `zoo-port/queue-steer` should either wait until the concurrent-conversations PR lands or be handled as a maintainer-approved stacked PR.

Duplicate search summary:

- Bedrock search found no duplicate issue. Related but not duplicate: PR #79 "Add Claude Opus 4.7 to the Amazon Bedrock model list", PR #55 "Update dependency @ai-sdk/amazon-bedrock to v4.0.105", and issue #73 "Consider setting tool_choice='required' globally when tools are present".
- Concurrent conversation/sidebar searches found no duplicates before creating issue #126.
- Slash command searches found no duplicates before creating issue #127.
- Prompt history searches found no duplicates.
- Parallel safe command searches found no duplicates.
- YOLO mode searches found no exact duplicate. Related but narrower: issue #102 "Reduce approval-control flash for auto-approved read-only asks" and issue #105 "Tighten Task.ask sequencing for auto-approved read-only asks".
- Queue/steer searches found no duplicates.
- Announcement/news/upsell/cloud/nag searches found no duplicates.

## 1. Robust Amazon Bedrock support

Branch: `zoo-port/bedrock-robust-support`

Commit: `c72dc1699`

Suggested issue title: `[ENHANCEMENT] Improve Amazon Bedrock model discovery, context handling, and output-token support`

Duplicate status: No duplicate issue found. Mention related Bedrock PRs #79 and #55 in the PR notes, but they are model-list/dependency updates rather than the provider robustness work in this branch.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/124

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/125

### Issue body

**Is your feature request related to a problem? Please describe.**

Zoo Code's Amazon Bedrock support is limited for current Claude-on-Bedrock workflows. Users need better handling for inference profiles, custom ARNs, cross-region/global profile selection, current model limits, large context windows, and Bedrock-specific request differences. Without this, Bedrock can fall back to overly conservative defaults, make it difficult to select the actual invocation target, or fail to use provider capabilities that are available in the user's AWS account.

**Describe the solution you'd like**

Improve the Bedrock provider so it can discover Bedrock foundation models and inference profiles, represent profile targets explicitly, handle custom ARNs and region mismatches more robustly, support the current Claude 4.x model metadata, preserve 200k and 1M context options where available, probe maximum output token caps, and handle Bedrock-specific thinking/structured-output behavior more safely.

**Describe alternatives you've considered**

The main alternative is maintaining a static model table only. That is simpler, but it does not account for account-specific inference profiles, newly available regions, custom ARNs, or empirically different max output limits. Another alternative is documenting manual custom model entries, but that leaves each user to rediscover Bedrock-specific invocation rules.

**Additional context**

This aligns with Zoo's "Reliability First" and "Leading on Agent Performance" roadmap themes. It is intentionally provider-focused and avoids any notification, news, cloud sync, or upsell behavior.

Related existing Zoo work, but not duplicates:

- https://github.com/Zoo-Code-Org/Zoo-Code/pull/79
- https://github.com/Zoo-Code-Org/Zoo-Code/pull/55

### PR body

### Related GitHub Issue

Closes: #124

### Description

This PR improves Amazon Bedrock support across provider metadata, invocation target resolution, settings UI, and request handling.

Key changes:

- Adds Bedrock control-plane discovery for foundation models and inference profiles.
- Expands discovered targets with explicit 1M-context variants where applicable.
- Improves inference-profile, custom ARN, region, and cross-region/global target handling.
- Updates Bedrock Claude model metadata, including 200k/1M context and max output token support.
- Adds a Bedrock max-output-token probe flow for models where AWS does not expose the cap directly.
- Handles Bedrock strict structured output fallback and caches unsupported structured-output responses.
- Handles Bedrock thinking payload differences, including adaptive thinking models.
- Adds focused tests for Bedrock metadata, discovery, max-token probing, structured output, reasoning, and JSON schema behavior.

Reviewer focus:

- Bedrock target resolution and whether the selected model/profile is the same target used for probing and runtime calls.
- 200k versus 1M context behavior. This PR should not regress eligible models to a 128k context window.
- The strict structured-output fallback path and whether the unsupported-cache duration is acceptable.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter @roo-code/types test -- src/__tests__/bedrock.spec.ts
pnpm --filter zoo-code test -- api/providers/__tests__/bedrock-max-tokens-probe.spec.ts api/providers/__tests__/bedrock-reasoning.spec.ts api/providers/__tests__/bedrock-structured-output.spec.ts shared/__tests__/bedrock-structured-output-cache.spec.ts utils/__tests__/json-schema.spec.ts
```

Manual verification recommended:

- Configure Bedrock with an AWS profile and region.
- Confirm discovered foundation models and inference profiles appear in settings.
- Select a Claude 4.x profile that supports 1M context and confirm the selected context window remains 1M.
- Use the max-output-token probe button and confirm the detected cap updates the model settings.
- Send a tool-using request through Bedrock and confirm normal tool calling still works.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

TODO: Attach screenshots of the Bedrock settings model/profile selector and max-output-token probe UI.

### Documentation Updates

Yes. Bedrock user documentation should mention model/profile discovery, custom ARN/profile selection, 1M context selection, and max-output-token probing.

### Additional Notes

Related but not duplicate Zoo PRs:

- https://github.com/Zoo-Code-Org/Zoo-Code/pull/79
- https://github.com/Zoo-Code-Org/Zoo-Code/pull/55

### Get in Touch

Discord: `coorbin`

## 2. Concurrent conversations sidebar

Branch: `zoo-port/concurrent-conversations`

Commit: `df09e55d2`

Suggested issue title: `[ENHANCEMENT] Add concurrent conversation sidebar and task switching`

Duplicate status: No duplicate issue found.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/126

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/128

### Issue body

**Is your feature request related to a problem? Please describe.**

Zoo Code currently centers the UI around one active task/conversation at a time. That makes it hard to manage multiple ongoing threads, compare work across tasks, or return to another conversation without losing context or disrupting a running task.

**Describe the solution you'd like**

Add first-class concurrent conversation support. The UI should show active conversations, allow switching between them, and keep task state and message routing tied to the selected conversation. A running or recently active conversation should remain visible and recoverable without requiring users to mentally track it outside the extension.

**Describe alternatives you've considered**

The alternative is to keep relying on one active webview task and history navigation. That is simpler, but it does not match workflows where users run several independent coding tasks, compare attempts, or need to return to a previous active task quickly. My alternative is to use (where possible) other tools with a conversation sidebar already, like T3 Code, Codex or Claude Code, or to continue maintaining my own fork of Roo Code as I've done since its development slowed down.

**Additional context**

This aligns with Zoo's "Enhanced User Experience" and "Leading on Agent Performance" themes. It is a user-facing workflow feature, not branding, notification, news, or cloud-sync work. This brings Zoo into alignment with the industry standard for agentic coding established by the GUI apps for Claude Code, Codex, and T3 Code.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

### PR body

### Related GitHub Issue

Closes: #126

### Description

This PR adds concurrent conversation support in the webview and provider layer.

Key changes:

- Adds an active conversation list in the chat UI.
- Tracks active task/conversation metadata so users can switch between live or recent conversations.
- Updates provider/webview message routing so actions apply to the currently selected conversation.
- Adjusts task cancellation and state-posting behavior to avoid UI flicker and preserve task identity.
- Adds tests around conversation switching, provider behavior, and cancel/flicker regressions.

Reviewer focus:

- Whether all user actions route to the selected conversation.
- Whether switching conversations preserves visible state without leaking messages between tasks.
- Whether cancellation/resume behavior remains stable.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter zoo-code test -- core/webview/__tests__/ClineProvider.spec.ts core/webview/__tests__/ClineProvider.flicker-free-cancel.spec.ts
pnpm --filter @roo-code/vscode-webview test -- src/components/chat/__tests__/ChatView.spec.tsx
```

Manual verification recommended:

- Start one Zoo task.
- Start or switch to a second conversation.
- Confirm both appear in the active conversation list.
- Switch back and forth and confirm each conversation keeps its own messages and status.
- Cancel one task and confirm the other conversation remains usable.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

TODO: Attach before/after screenshots or a short video showing the active conversation list and switching between two conversations.

### Documentation Updates

Yes. If Zoo Code has user docs for chat/task workflows, add a short section explaining active conversations and switching behavior.

### Additional Notes

No duplicate issue found in Zoo's tracker. This PR was prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

### Get in Touch

Discord: `coorbin`

## 3. Compact slash commands

Branch: `zoo-port/compact-slash-commands`

Commit: `b84115304`

Suggested issue title: `[ENHANCEMENT] Add compact slash commands`

Duplicate status: No duplicate issue found.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/127

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/129

### Issue body

**Is your feature request related to a problem? Please describe.**

While Zoo has a 'condense' feature that automatically kicks in when the context window is nearly full, it is sometimes cheaper - especially with models that have very large context windows - to manually trigger a condense (also known as compact, in the terminology of other agentic harnesses) when the user wishes to shrink their context window. This is because working with a bloated context window can reduce model accuracy and raise the cost of successive requests. The user can manually balance the model's awareness of the ongoing task with economic and accuracy factors by choosing when they wish to perform a compact of the context window.

**Describe the solution you'd like**

The /compact and /compact-and commands are standard in agentic harnesses like Warp terminal, Claude Code, Codex, etc. (specifically, /compact-and is unique to Warp as far as I know.) This PR adds them to Zoo Code.

**Describe alternatives you've considered**

There aren't any good alternatives available today while continuing to use Zoo Code.

**Additional context**

This is a small to moderate user-experience improvement and aligns with Zoo's "Enhanced User Experience" theme.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

### PR body

### Related GitHub Issue

Closes: #127

### Description

This PR adds `/compact` and `/compact-and` slash commands so users can manually trigger context condensation for the current task.

Key changes:

- Registers `compact` and `compact-and` as built-in slash commands so they appear in the command picker with descriptions.
- Intercepts `/compact` in the chat send path and dispatches the existing `condenseTaskContextRequest` for the current task.
- Implements `/compact-and <message>` by condensing first, then sending the provided follow-up message after condensation finishes.
- Guards against duplicate or invalid condense requests when there is no current task, no messages, sending is disabled, or a condense is already in flight.
- Updates command tests to cover the new built-in commands.

Reviewer focus:

- Whether the command names and descriptions fit Zoo Code's command style.
- Whether `/compact-and` waits for condensation to finish before sending the follow-up.
- Whether existing automatic condense behavior and ordinary slash commands remain unchanged.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter zoo-code test -- services/command/__tests__/built-in-commands.spec.ts
pnpm --filter @roo-code/vscode-webview test -- src/components/chat/__tests__/ChatView.spec.tsx
```

Manual verification recommended:

- Open the slash command picker in chat.
- Confirm the compact commands appear.
- Run /compact or /compact-and commands and confirm it performs the compaction correctly.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

TODO: Attach a screenshot of the slash command picker showing `/compact` and `/compact-and`.

### Documentation Updates

Possibly. If Zoo docs list slash commands, add `/compact` and `/compact-and` there.

### Additional Notes

No duplicate issue found in Zoo's tracker. This PR was prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

### Get in Touch

Discord: `coorbin`

## 4. Persist local prompt and draft history

Branch: `zoo-port/persist-prompt-history`

Commit: `b7aa0c22e`

Suggested issue title: `[ENHANCEMENT] Persist local chat prompt and draft history across webview sessions`

Duplicate status: No duplicate issue found.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/130

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/135

### Issue body

**Problem (one or two sentences)**

Prompt history is useful while steering Zoo, but newly typed or recently sent prompts can be lost across webview reloads or other UI lifecycle changes. That makes it harder to recover draft work, reuse a recent instruction, or refine the last prompt during longer local sessions.

**Context (who is affected and when)**

This affects users who keep Zoo Code open for long-running coding sessions, especially when the extension host reloads, the webview remounts, or the user returns to a workspace after switching context. It also affects users who type a substantial prompt and want it to be recoverable through prompt-history navigation even if the webview lifecycle changes before they send it.

**Desired behavior (conceptual, not technical)**

Zoo Code should keep a local, workspace-aware prompt history that survives webview reloads. Sent prompts and the active draft should become available through the existing prompt-history navigation, while empty entries and repeated entries should not clutter the displayed merged history.

**Constraints / preferences (optional)**

- Keep the feature local to the webview; do not add cloud sync, account sync, notifications, news, or upsell behavior.
- Scope persisted entries by workspace where possible, while still allowing workspace-less entries to be available.
- Treat persisted browser storage defensively so malformed localStorage data does not break chat.
- Preserve the existing keyboard prompt-history behavior.

**Request checklist**

- [x] I've searched existing Issues and Discussions for duplicates
- [x] This describes a specific problem with clear context and impact

**Zoo Code Task Links (optional)**

N/A

**Acceptance criteria (optional)**

- Given a user sends prompts in a workspace, when the webview reloads, then recent sent prompts are available through prompt-history navigation.
- Given the user is typing a non-empty draft, when the autosave interval runs, then that draft is persisted locally and can appear in prompt history.
- Given persisted data is malformed, empty, or unavailable, then chat still loads without throwing.
- Given active conversation history, task history, and persisted history all exist, then the displayed prompt history merges them without repeating the same trimmed prompt text.
- No cloud sync, notification, news, or upsell behavior is introduced.

**Proposed approach (optional)**

Add a localStorage-backed prompt-history utility with a Zoo-specific storage key, normalization, workspace filtering, an active draft ID, and a custom change event. Update `usePromptHistory` to merge persisted entries with active conversation and task history, and update `ChatView` to record sent prompts from normal send, queued-send, and ask-response paths.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

**Trade-offs / risks (optional)**

This uses browser localStorage, so reviewers should confirm that local-only persistence is acceptable and that the retention cap of 100 entries is appropriate. The implementation deduplicates the displayed merged history, but persisted sent records remain chronological records of sends; if maintainers want storage-level deduplication, that should be added explicitly.

### PR body

### Related GitHub Issue

Closes: #130

### Description

This PR adds local webview persistence for chat prompt history and active prompt drafts.

Key changes:

- Adds `webview-ui/src/components/chat/utils/promptHistory.ts` with localStorage read/write helpers, entry normalization, workspace filtering, a custom history-changed event, and a 100-entry cap.
- Autosaves the current non-empty draft every 5 seconds, updating one active draft entry in place until the user sends or clears it.
- Records sent prompts from normal message send, queued message send, primary/secondary ask responses, and `acceptInput` command-output queueing.
- Updates `usePromptHistory` to merge persisted history with active conversation prompts and task-history prompts while deduplicating displayed entries by trimmed prompt text.
- Adds unit tests for draft autosave, workspace filtering, sent prompt recording, and invalid storage handling.

Reviewer focus:

- Whether localStorage is the right persistence layer for this local-only behavior.
- Whether workspace filtering should include or exclude workspace-less entries.
- Whether storage-level deduplication is desired in addition to the current display-level deduplication.
- Whether all send/queue/ask-response paths that should record prompt history are covered.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter @roo-code/vscode-webview test -- src/components/chat/utils/__tests__/promptHistory.spec.ts src/components/chat/__tests__/ChatView.spec.tsx
```

Manual verification recommended:

- Send several prompts.
- Use prompt-history keyboard navigation.
- Reload the webview or restart the extension host.
- Confirm recent prompts remain available and duplicate entries are not repeated in the displayed history.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

Not required unless maintainers want a short video of keyboard prompt-history navigation.

### Documentation Updates

No documentation update appears required; this is an incremental local persistence improvement to existing prompt-history behavior.

### Additional Notes

No duplicate issue found in Zoo's tracker. This PR is local-only and does not add cloud sync or new user-facing announcement surfaces.

### Get in Touch

Discord: `coorbin`

## 5. Parallelize safe read-only command batches

Branch: `zoo-port/parallel-safe-commands`

Commit: `aa9b6e3f2`

Suggested issue title: `[ENHANCEMENT] Run consecutive safe read-only command tools in parallel`

Duplicate status: No duplicate issue found. Auto-approval issues #102 and #105 are related to approval UI sequencing, but they are not duplicates of this command-presentation performance change.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/131

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/136

### Issue body

**Problem (one or two sentences)**

When the assistant emits several independent read-only shell commands, Zoo Code currently resolves them serially. This adds avoidable latency during codebase exploration, where commands like `rg`, `ls`, `cat`, `git status`, and `git show` often do not depend on each other.

**Context (who is affected and when)**

This affects users asking Zoo Code to inspect a codebase, gather file context, or compare several files before implementation. It is most visible when an assistant emits multiple read-only `execute_command` tool calls in a row.

**Desired behavior (conceptual, not technical)**

Zoo Code should run a bounded batch of consecutive, clearly read-only command tools in parallel once the assistant stream has completed enough to know the full batch. It should preserve tool-result ordering and keep unsafe or mutating commands on the existing serial path.

**Constraints / preferences (optional)**

- Only parallelize `execute_command` blocks that pass a conservative read-only classifier.
- Do not parallelize commands with shell control syntax, redirects, command substitution, environment assignment, or mutating flags.
- Keep approval prompts ordered even if the command executions run concurrently.
- Preserve result order in the model-visible tool results.
- Keep the batch size bounded.

**Request checklist**

- [x] I've searched existing Issues and Discussions for duplicates
- [x] This describes a specific problem with clear context and impact

**Zoo Code Task Links (optional)**

N/A

**Acceptance criteria (optional)**

- Given consecutive safe read-only `execute_command` tool calls, when the assistant stream is complete, then Zoo runs up to four of them concurrently.
- Given the commands complete in a different wall-clock order, then tool results are still appended in the assistant's original order.
- Given a command is unsafe, mutating, uses shell control syntax, or is not recognized as read-only, then it stays on the existing serial execution path.
- Given user approval is required, then approval prompts remain serialized.
- Existing command approval and rejection behavior remains intact.

**Proposed approach (optional)**

Detect batches of consecutive complete `execute_command` tool blocks whose commands pass a conservative read-only parser. Run each batch with `Promise.all`, preserve output order when pushing tool results, serialize approval prompts through an approval queue, and cap batches at four commands.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

**Trade-offs / risks (optional)**

The key risk is misclassifying a command as read-only. This implementation intentionally rejects shell control syntax and only allows a narrow command set plus read-only `git` subcommands. Maintainers may want to tune the allowlist before merging.

Related but not duplicate issues:

- https://github.com/Zoo-Code-Org/Zoo-Code/issues/102
- https://github.com/Zoo-Code-Org/Zoo-Code/issues/105

### PR body

### Related GitHub Issue

Closes: #131

### Description

This PR runs bounded batches of consecutive safe read-only `execute_command` tool calls in parallel.

Key changes:

- Adds a conservative read-only shell command classifier for simple file-inspection commands and read-only `git` subcommands.
- Defers safe command execution until the stream is complete enough to identify consecutive batch members.
- Runs up to four consecutive read-only commands concurrently while preserving model-visible tool-result order.
- Serializes approval prompts even when the approved command executions run concurrently.
- Keeps unsafe, mutating, or complex shell forms on the existing serial path.
- Adds focused tests for parallel execution, stream-completion deferral, preserved result order, and unsafe-command fallback.

Reviewer focus:

- The read-only command classifier and whether the allowlist is strict enough.
- Whether approval prompt sequencing and rejection behavior are preserved.
- Whether result ordering remains correct when faster commands finish before slower earlier commands.
- Interaction with existing auto-approval work such as issues #102 and #105.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter zoo-code test -- core/assistant-message/__tests__/presentAssistantMessage-parallel-commands.spec.ts
```

Manual verification recommended:

- Ask Zoo to inspect several independent files or run several read-only commands.
- Confirm safe command output appears without unnecessary serial delay.
- Confirm a write/mutating command still follows the normal approval path.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

Not required; this is a core behavior/performance change.

### Documentation Updates

No user-facing documentation update appears required unless Zoo documents command execution ordering.

### Additional Notes

Related but not duplicate:

- https://github.com/Zoo-Code-Org/Zoo-Code/issues/102
- https://github.com/Zoo-Code-Org/Zoo-Code/issues/105

### Get in Touch

Discord: `coorbin`

## 6. YOLO mode

Branch: `zoo-port/yolo-mode`

Commit: `eeb92ad09`

Suggested issue title: `[ENHANCEMENT] Add YOLO mode for explicit broad auto-approval`

Duplicate status: No exact duplicate found. Related but narrower: issues #102 and #105.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/132

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/137

### Issue body

**Problem (one or two sentences)**

Advanced users sometimes want a single explicit mode that lets Zoo proceed through ordinary tool, MCP, and command approval prompts without repeatedly stopping for confirmations. Existing auto-approval settings are granular, but configuring them one by one is tedious for trusted local workflows.

**Context (who is affected and when)**

This affects users who run Zoo Code in local repositories where they already trust the agent to perform broad actions, such as repetitive code edits, file reads, terminal commands, MCP calls, and subtask/mode operations. It is most useful in private development environments where speed matters and the user intentionally accepts the increased risk.

**Desired behavior (conceptual, not technical)**

Zoo Code should provide an explicit opt-in YOLO mode. When enabled, Zoo should effectively auto-approve broad tool, MCP, and command categories while still respecting denied command prefixes, still requiring the protected-write setting for protected writes, and still asking real follow-up questions that need user input.

**Constraints / preferences (optional)**

- YOLO mode must be off by default.
- Do not add confirmation pop-ups, nag screens, or notification surfaces.
- Denied command prefixes remain hard blocks.
- Protected writes remain gated unless protected-write auto-approval is separately enabled.
- Follow-up suggestions should not be silently auto-selected in YOLO mode.
- Settings should continue to use the local cached settings buffer until the user saves.

**Request checklist**

- [x] I've searched existing Issues and Discussions for duplicates
- [x] This describes a specific problem with clear context and impact

**Zoo Code Task Links (optional)**

N/A

**Acceptance criteria (optional)**

- Given YOLO mode is disabled, existing auto-approval behavior is unchanged.
- Given YOLO mode is enabled, ordinary tool asks, MCP asks, and terminal command asks are approved without extra confirmation unless a deny/protected-write rule applies.
- Given a command matches a denied command prefix, YOLO mode denies it.
- Given a protected write is requested and protected-write auto-approval is not enabled, Zoo still asks.
- Given a follow-up suggestion is shown, YOLO mode does not auto-select it or start the follow-up countdown.
- Individual auto-approval controls are visibly overridden/locked while YOLO mode is active.

**Proposed approach (optional)**

Add `yoloMode` to global settings and extension state, teach `checkAutoApproval` to handle YOLO before the normal granular auto-approval path, update chat/settings UI to show YOLO as active and lock individual controls, and keep `SettingsView` wired through `cachedState`.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

**Trade-offs / risks (optional)**

This intentionally broadens auto-approval for users who enable it. The main review concern is whether the remaining guardrails are sufficient and whether the UI text makes the risk clear without becoming a nag surface.

Related but not duplicate issues:

- https://github.com/Zoo-Code-Org/Zoo-Code/issues/102
- https://github.com/Zoo-Code-Org/Zoo-Code/issues/105

### PR body

### Related GitHub Issue

Closes: #132

### Description

This PR adds an explicit YOLO mode to the auto-approval system.

Key changes:

- Adds `yoloMode` to global settings/state plumbing.
- Updates `checkAutoApproval` so YOLO mode approves broad tool, MCP, and command categories while preserving denied command prefixes and protected-write boundaries.
- Keeps follow-up asks/manual choices out of YOLO auto-approval and disables follow-up auto-approval countdowns while YOLO mode is active.
- Updates the chat auto-approval dropdown so YOLO appears active, individual quick controls are locked, and the displayed enabled count reflects the effective YOLO state.
- Updates auto-approval settings to expose the YOLO checkbox and lock granular controls while YOLO is active, using `cachedState` rather than direct live state mutation.
- Adds tests for YOLO decision behavior and follow-up suggestion behavior.

Reviewer focus:

- Whether the scope of YOLO approval is acceptable for Zoo Code.
- Whether the UI language makes the risk clear without adding nagging pop-ups.
- Whether protected writes and denied command prefixes remain respected.
- Whether locking granular controls while YOLO is active is preferable to letting users edit them behind the effective YOLO override.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter zoo-code test -- core/auto-approval/__tests__/checkAutoApproval.spec.ts
pnpm --filter @roo-code/vscode-webview test -- src/components/chat/__tests__/FollowUpSuggest.spec.tsx src/hooks/__tests__/useAutoApprovalState.spec.ts
```

Manual verification recommended:

- Enable YOLO mode in settings.
- Confirm allowed read/write/MCP/mode/subtask/command flows proceed without repeated confirmations.
- Confirm denied command prefixes are still blocked.
- Confirm protected writes still require explicit protected-write configuration.
- Confirm follow-up questions still wait for user input.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

TODO: Attach screenshots of the YOLO mode setting and auto-approval dropdown.

### Documentation Updates

Yes. User-facing docs should explain what YOLO mode approves, what it still blocks, and when users should avoid enabling it.

### Additional Notes

Related but not duplicate:

- https://github.com/Zoo-Code-Org/Zoo-Code/issues/102
- https://github.com/Zoo-Code-Org/Zoo-Code/issues/105

This PR deliberately does not auto-answer follow-up questions in YOLO mode.

### Get in Touch

Discord: `coorbin`

## 7. Queue and steer deferred message delivery

Branch: `zoo-port/queue-steer`

Commit: `86d7f7f10`

Suggested issue title: `[ENHANCEMENT] Add queue and steer delivery modes for running conversations`

Duplicate status: No duplicate issue found.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/133

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/138

Dependency note: This branch builds on `zoo-port/concurrent-conversations`, now draft PR #128. To keep the PR focused, open it after #128 lands, or ask maintainers whether they accept stacked PR review. If opened directly against Zoo `main` before #128 merges, the GitHub diff will include the concurrent-conversation changes as prerequisites.

### Issue body

**Problem (one or two sentences)**

When a conversation is already running, users need a clear way to send more input without guessing whether it will wait for the next handoff, steer the active task, or be dropped. A single implicit queue is not expressive enough for long-running concurrent conversations. Competing tools like Codex and Claude Code allow the user to either `queue` or `steer` the conversation. Queue means the user's input will be provided to the LLM after it is fully finished the conversation and returns control back to the user. Steer means that on the next opportunity after a tool call sequence is complete, the harness (Zoo) will insert the change into the conversation stream before the model can continue.

**Context (who is affected and when)**

This affects users who send additional instructions while Zoo is streaming, running tools, waiting at an API boundary, waiting on a follow-up handoff, or recovering after cancellation/resume. It is especially useful once concurrent conversations are available because users can keep working while a task is active.

**Desired behavior (conceptual, not technical)**

Zoo Code should distinguish ordinary queued follow-up messages from steer messages. Queued messages should wait for the next safe handoff. Steer messages should be delivered sooner at safe task/API/tool boundaries, without corrupting model-visible tool history or losing queued input.

**Constraints / preferences (optional)**

- Requires the concurrent-conversations routing from PR #128.
- Route queued/steer operations to the selected conversation/task.
- Preserve images, timestamps, and message IDs when editing or switching delivery mode.
- Preserve queued messages when a running task is cancelled and replaced with a resumable task.
- Do not drain ordinary queued messages during unsafe/resumable states just because a compatibility method is called.
- Keep model-visible API history valid when steering interrupts pending tool blocks.

**Request checklist**

- [x] I've searched existing Issues and Discussions for duplicates
- [x] This describes a specific problem with clear context and impact

**Zoo Code Task Links (optional)**

N/A

**Acceptance criteria (optional)**

- Given a running conversation, when the user sends an ordinary follow-up, then it is queued with delivery mode `queue`.
- Given a queued message, when the user switches it to `steer`, then it moves to the steer lane without losing text/images/timestamps.
- Given a steer message is pending at an API boundary or after a completed tool boundary, then Zoo delivers it as user feedback and continues from a safe point.
- Given a steer message interrupts before later tool blocks run, then skipped tool-use blocks receive synthetic tool results so provider history remains valid.
- Given a task is cancelled and replaced with a resumable task, then queued/steer messages are restored on the replacement task and are not prematurely drained.
- The queued-message UI lets users view lanes, edit messages, switch delivery mode, and remove messages.

**Proposed approach (optional)**

Add a `QueuedMessageDeliveryMode` type with `queue` and `steer` lanes, update `MessageQueueService` to manage separate lanes with steer-first combined ordering, extend webview messages with delivery mode metadata, update the queued-message UI, and add Task handoff helpers for queued drain and steer delivery at API/tool boundaries.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

**Trade-offs / risks (optional)**

The main risk is boundary safety. Steering must not interrupt in the middle of a provider/tool protocol in a way that creates invalid tool history. This branch handles that by appending synthetic tool results for skipped tool blocks and by consuming steer input only at explicit API/tool boundaries.

### PR body

### Related GitHub Issue

Closes: #133

### Description

This PR adds explicit queue and steer delivery modes for messages sent while a conversation is running. It is stacked on the concurrent-conversations work from PR #128.

Dependency PR: #128. Please review/merge #128 first; until then this PR is intentionally opened as a stacked draft and its GitHub diff against `main` may include the concurrent-conversations prerequisite.

Key changes:

- Adds `QueuedMessageDeliveryMode` and extends queued-message payloads with `createdAt`, `updatedAt`, and `deliveryMode`.
- Reworks `MessageQueueService` into separate `queue` and `steer` lanes with steer-first combined ordering, lane-specific dequeue, delivery-mode switching, restore support, and tests.
- Updates webview message handling to resolve the target task before and after image resolution, preserve dropped input, and pass delivery mode through queue/edit actions.
- Updates `QueuedMessages` UI to show separate "Steer next" and "Queued" lanes with edit, remove, and Queue/Steer toggle actions.
- Updates Task handoff behavior so ordinary queued messages drain only at appropriate follow-up/idle handoffs, while steer messages can be consumed at API boundaries or after completed tool boundaries.
- Adds synthetic tool results for skipped tool calls when steer input interrupts after a tool boundary.
- Preserves queued/steer messages across cancel/replacement and defers draining until resume.
- Keeps the legacy `processQueuedMessages()` method as a no-op compatibility shim so queued messages are not drained from unsafe call sites.
- Adds focused tests for queue service lanes, queued-message UI, ask drain behavior, task steer boundaries, and cancel restoration.

Reviewer focus:

- Boundary safety for steer delivery and provider API history validity.
- Whether the UI language clearly distinguishes ordinary queued input from steer input.
- Whether cancel/resume restoration preserves user intent without prematurely delivering queued messages.
- Interaction with concurrent conversation switching from PR #128.

### Test Procedure

From the Zoo Code worktree after the concurrent-conversations branch is present:

```bash
pnpm lint
pnpm check-types
pnpm --filter zoo-code test -- core/message-queue/__tests__/MessageQueueService.spec.ts core/task/__tests__/Task.spec.ts core/task/__tests__/ask-queued-message-drain.spec.ts core/webview/__tests__/ClineProvider.flicker-free-cancel.spec.ts
pnpm --filter @roo-code/vscode-webview test -- src/components/chat/__tests__/QueuedMessages.spec.tsx src/components/chat/__tests__/ChatView.spec.tsx
```

Manual verification recommended:

- Start a long-running conversation.
- Send one message as queued input and one as steer input.
- Confirm the queued-message list shows both messages and their delivery modes.
- Edit a queued message before it is delivered.
- Confirm steer input is delivered at a safe boundary and ordinary queued input is drained in order.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

TODO: Attach a short video showing messages being queued, edited, switched between delivery modes, and delivered during a running conversation.

### Documentation Updates

Yes. User-facing docs should explain the difference between queued input and steer input.

### Additional Notes

This should be reviewed after or on top of PR #128. If opened before #128 merges, the GitHub diff against Zoo `main` will include prerequisite concurrent-conversation changes.

### Get in Touch

Discord: `coorbin`

## 8. Remove unsolicited nag/announcement surfaces

Branch: `zoo-port/nag-removals`

Commit: `0ff2a2057`

Suggested issue title: `[ENHANCEMENT] Remove unsolicited announcement and upsell surfaces`

Duplicate status: No duplicate issue found.

Created issue: https://github.com/Zoo-Code-Org/Zoo-Code/issues/134

Created draft PR: https://github.com/Zoo-Code-Org/Zoo-Code/pull/139

Product-policy note: This branch is intentionally opinionated. It removes announcement/news/upsell surfaces while preserving consent/safety surfaces. Zoo maintainers may prefer an opt-out setting, a "quiet mode", or a user-initiated changelog surface instead of hard removal.

### Issue body

**Problem (one or two sentences)**

Unsolicited announcement, release-note, social-link, and upsell surfaces can interrupt users who want Zoo Code to stay focused on local coding work. These surfaces are especially distracting when they appear in the main chat workflow or behind persistent state rather than being explicitly requested by the user.

**Context (who is affected and when)**

This affects users who prefer a quiet, local-first coding tool and do not want release announcements, marketing copy, social links, or cloud/service promotions in the extension UI. It is most visible on launch, on the chat home screen, and anywhere upsell dismissal state has to be tracked.

**Desired behavior (conceptual, not technical)**

Zoo Code should avoid unsolicited announcement and upsell UI in the coding workflow. Important safety, telemetry-consent, and account-required surfaces should remain, but release notes, changelog/news modals, social links, and dismissible upsells should be removed or moved to places the user opens intentionally.

**Constraints / preferences (optional)**

- Preserve telemetry-consent and other safety/consent surfaces.
- Do not remove any account-required flow that is necessary for an explicit user action.
- Do not add replacement pop-ups or new notification surfaces.
- Keep localization and extension state schemas consistent after removing announcement/upsell state.
- Maintainers may prefer an opt-out setting or user-opened changelog instead of full removal.

**Request checklist**

- [x] I've searched existing Issues and Discussions for duplicates
- [x] This describes a specific problem with clear context and impact

**Zoo Code Task Links (optional)**

N/A

**Acceptance criteria (optional)**

- Given the chat webview launches, then no announcement modal/banner appears solely because an announcement ID changed.
- Given the version indicator is displayed, then it is a passive version label rather than a release-notes/news click target.
- Given upsell components were previously dismissible, then the extension no longer tracks or requests `dismissedUpsells` state for those removed surfaces.
- Announcement localization keys and tests for removed components are cleaned up.
- Telemetry consent and safety/permission surfaces remain intact.

**Proposed approach (optional)**

Remove the announcement component and auto-show state path, remove the clickable version-indicator announcement trigger, remove the generic dismissible upsell component and dismissed-upsell persistence messages, and clean up related state types, tests, and localization strings.

This issue and the associated PR were prepared with agentic AI assistance, then reviewed by a human. The underlying feature has been tested in production business use for several weeks in the contributor's fork.

**Trade-offs / risks (optional)**

This is product-policy sensitive. The implementation is a hard removal of several product-communication surfaces; maintainers may prefer a configurable quiet mode or a user-initiated changelog/news area.

### PR body

### Related GitHub Issue

Closes: #134

### Description

This PR removes several unsolicited announcement and upsell surfaces from the extension UI while preserving unrelated consent and safety surfaces.

Key changes:

- Removes the chat `Announcement` component and its tests.
- Removes announcement auto-show state and extension messages, including `latestAnnouncementId`, `lastShownAnnouncementId`, `shouldShowAnnouncement`, and `didShowAnnouncement`.
- Changes `VersionIndicator` from a clickable release-notes/announcement trigger into a passive version label.
- Removes `DismissibleUpsell`, its tests, `dismissedUpsells` global state, and the `dismissUpsell`/`getDismissedUpsells` webview message paths.
- Removes announcement localization blocks across locales and updates the version indicator aria label.
- Updates affected chat/app/context/settings tests after removing the announcement/upsell props and state.

Reviewer focus:

- Whether Zoo wants full removal, an opt-out setting, or relocation to a user-initiated changelog/news surface.
- Confirming no required consent, safety, or account-critical notice was removed.
- Confirming localization cleanup is acceptable.
- Confirming telemetry consent remains untouched.

### Test Procedure

From the Zoo Code worktree:

```bash
pnpm lint
pnpm check-types
pnpm --filter zoo-code test -- core/webview/__tests__/ClineProvider.spec.ts
pnpm --filter @roo-code/vscode-webview test -- src/__tests__/App.spec.tsx src/components/chat/__tests__/ChatView.spec.tsx src/components/settings/__tests__/SettingsView.spec.tsx src/context/__tests__/ExtensionStateContext.spec.tsx
```

Manual verification recommended:

- Launch the extension webview.
- Confirm no announcement modal/banner appears in chat.
- Confirm the version indicator no longer opens release notes/news as a click target.
- Confirm removed upsell state is not expected by settings or extension state hydration.
- Confirm telemetry/consent surfaces still behave normally.

### Pre-Submission Checklist

- [ ] **Issue Linked**: This PR is linked to an approved GitHub Issue.
- [ ] **Scope**: My changes are focused on the linked issue.
- [ ] **Self-Review**: I have performed a thorough self-review of my code.
- [ ] **Testing**: New and/or updated tests have been added to cover my changes.
- [ ] **Documentation Impact**: I have considered if my changes require documentation updates.
- [ ] **Contribution Guidelines**: I have read and agree to the Contributor Guidelines.

### Screenshots / Videos

TODO: Attach before/after screenshots if maintainers want to compare removed announcement/upsell surfaces.

### Documentation Updates

No user-facing documentation update appears required unless Zoo docs mention these announcement or upsell surfaces.

### Additional Notes

This PR is likely to need product-maintainer agreement because it removes product communication surfaces. If maintainers prefer a preference flag, this branch can be adapted into "disable unsolicited announcements by default" or "add quiet mode" instead of hard removal.

### Get in Touch

Discord: `coorbin`

## Suggested submission sequence

1. Already opened: Bedrock issue #124 and draft PR #125.
2. Already opened: concurrent-conversations issue #126 and draft PR #128.
3. Already opened: compact slash commands issue #127 and draft PR #129.
4. Already opened: prompt history issue #130 and draft PR #135.
5. Already opened: parallel safe command batches issue #131 and draft PR #136.
6. Already opened: YOLO mode issue #132 and draft PR #137.
7. Already opened as stacked draft work: queue/steer issue #133 and draft PR #138, dependent on PR #128.
8. Already opened: nag removals issue #134 and draft PR #139.

## Integrated branch verification

The integrated branch `zoo-port/integration` combines the feature branches and was verified with:

```bash
pnpm lint
pnpm check-types
```

Focused source and webview tests were also run across the integrated branch. Local tooling reported the repository's Node engine warning because the repo expects Node `20.20.2` and the local environment was using Node `25.8.0`.
