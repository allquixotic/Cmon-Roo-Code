import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"

import type { HistoryItem } from "@roo-code/types"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { safeWriteJson } from "../../utils/safeWriteJson"
import { getStorageBasePath } from "../../utils/storage"

/** Valid status values for a task's HistoryItem. */
export type HistoryItemStatus = NonNullable<HistoryItem["status"]>

const VALID_TRANSITIONS: Record<HistoryItemStatus, HistoryItemStatus[]> = {
	active: ["delegated", "completed", "interrupted"],
	delegated: ["active"],
	// interrupted → delegated: a cancelled subtask can be resumed from history and
	// keeps its persisted "interrupted" status while running (nothing transitions it
	// back to "active"); it must still be able to spawn subtasks via new_task.
	interrupted: ["completed", "delegated"],
	completed: [],
}

/**
 * Asserts that a task status transition is valid, throwing if not.
 *
 * @throws {Error} When the transition is not allowed by the state machine.
 */
export function assertValidTransition(from: HistoryItemStatus | undefined, to: HistoryItemStatus): void {
	const fromStatus: HistoryItemStatus = from ?? "active"
	const validTargets = VALID_TRANSITIONS[fromStatus]
	if (!validTargets.includes(to)) {
		throw new Error(`Invalid task status transition: ${fromStatus} → ${to}`)
	}
}

/**
 * Index file format for fast startup reads.
 */
interface HistoryIndex {
	version: number
	updatedAt: number
	entries: HistoryItem[]
}

/**
 * TaskHistoryStore encapsulates all task history persistence logic.
 *
 * Each task's HistoryItem is stored as an individual JSON file in its
 * existing task directory (`globalStorage/tasks/<taskId>/history_item.json`).
 * A single index file (`globalStorage/tasks/_index.json`) is maintained
 * as a cache for fast list reads at startup.
 *
 * Cross-process safety comes from `safeWriteJson`'s `proper-lockfile`
 * on per-task file writes. Within a single extension host process,
 * an in-process write lock serializes mutations.
 */
/**
 * Options for TaskHistoryStore constructor.
 */
export interface TaskHistoryStoreOptions {
	/**
	 * Optional callback invoked inside the write lock after each mutation
	 * (upsert, delete, deleteMany). Used for serialized write-through to
	 * globalState during the transition period.
	 */
	onWrite?: (items: HistoryItem[]) => Promise<void>
	/**
	 * Override for the delegation-repair grace window (ms). Tests pass 0 so
	 * freshly written fixtures are still eligible for reconciliation.
	 */
	delegationRepairGraceMs?: number
}

export class TaskHistoryStore {
	private readonly globalStoragePath: string
	private readonly onWriteSubscribers = new Set<(items: HistoryItem[]) => Promise<void>>()
	private cache: Map<string, HistoryItem> = new Map()
	private writeLock: Promise<void> = Promise.resolve()
	private indexWriteTimer: ReturnType<typeof setTimeout> | null = null
	private fsWatcher: fsSync.FSWatcher | null = null
	private reconcileTimer: ReturnType<typeof setTimeout> | null = null
	private disposed = false
	private initializeStarted = false
	private refCount = 0

	/**
	 * Process-wide registry keyed by storage path. Multiple ClineProviders in one
	 * extension host (sidebar + "Open in New Tab" editor panels) MUST share a single
	 * store instance: separate instances each hold their own write lock and cache
	 * over the same files, and a second instance's startup delegation reconciliation
	 * cannot distinguish a crash orphan from a delegation that is live right now in
	 * another provider — it would sever it.
	 */
	private static instances = new Map<string, TaskHistoryStore>()

	/**
	 * Get (or create) the shared store for a storage path. Callers own a reference
	 * and must call `release()` when disposed; the store shuts down when the last
	 * reference is released.
	 */
	/**
	 * Test-only: clear the process-wide registry so each test gets isolated stores.
	 * Does NOT dispose registered instances (tests own their lifecycles).
	 */
	static __resetInstancesForTests(): void {
		TaskHistoryStore.instances.clear()
	}

	static getOrCreate(globalStoragePath: string, options?: TaskHistoryStoreOptions): TaskHistoryStore {
		let store = TaskHistoryStore.instances.get(globalStoragePath)
		if (!store || store.disposed) {
			store = new TaskHistoryStore(globalStoragePath)
			TaskHistoryStore.instances.set(globalStoragePath, store)
		}
		store.refCount++
		if (options?.onWrite) {
			store.onWriteSubscribers.add(options.onWrite)
		}
		return store
	}

	/**
	 * Promise that resolves when initialization is complete.
	 * Callers can await this to ensure the store is ready before reading.
	 */
	public readonly initialized: Promise<void>
	private resolveInitialized!: () => void

	/** Debounce window for index writes in milliseconds. */
	private static readonly INDEX_WRITE_DEBOUNCE_MS = 2000

	/** Periodic reconciliation interval in milliseconds. */
	private static readonly RECONCILE_INTERVAL_MS = 5 * 60 * 1000

	/**
	 * Grace window during which startup delegation reconciliation will NOT repair a
	 * recently-written parent item: a freshly persisted delegation whose child has
	 * not written its first history file yet looks identical to a crash orphan.
	 */
	private static readonly DELEGATION_REPAIR_GRACE_MS = 60_000
	private readonly delegationRepairGraceMs: number

	constructor(globalStoragePath: string, options?: TaskHistoryStoreOptions) {
		this.globalStoragePath = globalStoragePath
		this.delegationRepairGraceMs = options?.delegationRepairGraceMs ?? TaskHistoryStore.DELEGATION_REPAIR_GRACE_MS
		if (options?.onWrite) {
			this.onWriteSubscribers.add(options.onWrite)
		}
		this.initialized = new Promise<void>((resolve) => {
			this.resolveInitialized = resolve
		})
	}

	/**
	 * Release one reference to a shared store obtained via getOrCreate().
	 * Unsubscribes the given onWrite callback (if provided) and disposes the
	 * store when the last reference is gone.
	 */
	release(onWrite?: (items: HistoryItem[]) => Promise<void>): void {
		if (onWrite) {
			this.onWriteSubscribers.delete(onWrite)
		}
		this.refCount = Math.max(0, this.refCount - 1)
		if (this.refCount === 0) {
			TaskHistoryStore.instances.delete(this.globalStoragePath)
			this.dispose()
		}
	}

	// ────────────────────────────── Lifecycle ──────────────────────────────

	/**
	 * Load index, reconcile if needed, start watchers.
	 * Idempotent: concurrent/subsequent calls (e.g. a second provider sharing the
	 * store) await the first initialization instead of re-running reconciliation.
	 */
	async initialize(): Promise<void> {
		if (this.initializeStarted) {
			return this.initialized
		}
		this.initializeStarted = true
		try {
			const tasksDir = await this.getTasksDir()
			await fs.mkdir(tasksDir, { recursive: true })

			// 1. Load existing index into the cache
			await this.loadIndex()

			// 2. Reconcile cache against actual task directories on disk
			await this.reconcile()

			// 3. Repair delegation inconsistencies left by a previous crash
			await this.reconcileDelegationState()

			// 4. Start fs.watch for cross-instance reactivity
			this.startWatcher()

			// 5. Start periodic reconciliation as a defensive fallback
			this.startPeriodicReconciliation()
		} finally {
			// Mark initialization as complete so callers awaiting `initialized` can proceed
			this.resolveInitialized()
		}
	}

	/**
	 * Flush pending writes, clear watchers, release resources.
	 */
	dispose(): void {
		this.disposed = true

		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
			this.indexWriteTimer = null
		}

		if (this.reconcileTimer) {
			clearTimeout(this.reconcileTimer)
			this.reconcileTimer = null
		}

		if (this.fsWatcher) {
			this.fsWatcher.close()
			this.fsWatcher = null
		}

		// Synchronously flush the index (best-effort)
		this.flushIndex().catch((err) => {
			console.error("[TaskHistoryStore] Error flushing index on dispose:", err)
		})
	}

	// ────────────────────────────── Reads ──────────────────────────────

	/**
	 * Get a single history item by task ID.
	 */
	get(taskId: string): HistoryItem | undefined {
		return this.cache.get(taskId)
	}

	/**
	 * Get all history items, sorted by timestamp descending (newest first).
	 */
	getAll(): HistoryItem[] {
		return Array.from(this.cache.values()).sort((a, b) => b.ts - a.ts)
	}

	/**
	 * Get history items filtered by workspace path.
	 */
	getByWorkspace(workspace: string): HistoryItem[] {
		return this.getAll().filter((item) => item.workspace === workspace)
	}

	// ────────────────────────────── Mutations ──────────────────────────────

	/**
	 * Insert or update a history item.
	 *
	 * Writes the per-task file immediately (source of truth),
	 * updates the in-memory Map, and schedules a debounced index write.
	 */
	async upsert(item: HistoryItem, options: { preserveExistingStatus?: boolean } = {}): Promise<HistoryItem[]> {
		return this.withLock(() => this.upsertCore(item, options))
	}

	/**
	 * Core upsert logic — must only be called from within `withLock`.
	 *
	 * Enforces state-machine transition rules when `item.status` changes.
	 * Pass `skipTransitionCheck: true` only for administrative repairs (reconciliation,
	 * migration) that need to write corrected state outside the normal task lifecycle.
	 *
	 * Pass `preserveExistingStatus: true` for saves that do not intend a status
	 * transition (e.g. Task.saveClineMessages): the status decision then happens
	 * INSIDE the lock — the item keeps whatever status is currently persisted,
	 * closing the TOCTOU where a stale pre-read status (captured before a queued
	 * transition applied) would silently revert e.g. "delegated" back to "active".
	 * First inserts still use the incoming item's status (initialStatus semantics).
	 */
	private async upsertCore(
		item: HistoryItem,
		options: { skipTransitionCheck?: boolean; preserveExistingStatus?: boolean } = {},
	): Promise<HistoryItem[]> {
		const existing = this.cache.get(item.id)

		if (options.preserveExistingStatus && existing) {
			// No transition intended: keep the currently persisted status regardless
			// of what the caller captured. No transition check needed (no transition
			// can occur by construction).
			item = existing.status !== undefined ? { ...item, status: existing.status } : item
		} else if (!options.skipTransitionCheck && existing && item.status !== undefined) {
			// Enforce transition validity at the write boundary so that any caller
			// (including fire-and-forget saves) cannot silently stomp a terminal status.
			// Skip when there is no existing record — first insert has no prior state to transition from.
			// Normalize existing.status (undefined = legacy "active") before comparing so that writing
			// status: "active" onto a legacy item without a status field is not treated as a transition.
			const normalizedExisting: HistoryItemStatus = existing.status ?? "active"
			if (item.status !== normalizedExisting) {
				assertValidTransition(existing.status, item.status)
			}
		}

		// Merge: preserve existing metadata unless explicitly overwritten
		const merged = existing ? { ...existing, ...item } : item

		// Write per-task file (source of truth)
		await this.writeTaskFile(merged)

		// Update in-memory cache
		this.cache.set(merged.id, merged)
		// Schedule debounced index write
		this.scheduleIndexWrite()

		const all = this.getAll()

		// Call onWrite callback inside the lock for serialized write-through
		for (const subscriber of this.onWriteSubscribers) {
			await subscriber(all)
		}

		return all
	}

	/**
	 * Delete a single task's history item.
	 */
	async delete(taskId: string): Promise<void> {
		return this.withLock(async () => {
			this.cache.delete(taskId)

			// Remove per-task file (best-effort)
			try {
				const filePath = await this.getTaskFilePath(taskId)
				await fs.unlink(filePath)
			} catch {
				// File may already be deleted
			}

			this.scheduleIndexWrite()

			// Call onWrite callback inside the lock for serialized write-through
			for (const subscriber of this.onWriteSubscribers) {
				await subscriber(this.getAll())
			}
		})
	}

	/**
	 * Delete multiple tasks' history items in a batch.
	 */
	async deleteMany(taskIds: string[]): Promise<void> {
		return this.withLock(async () => {
			for (const taskId of taskIds) {
				this.cache.delete(taskId)

				try {
					const filePath = await this.getTaskFilePath(taskId)
					await fs.unlink(filePath)
				} catch {
					// File may already be deleted
				}
			}

			this.scheduleIndexWrite()

			// Call onWrite callback inside the lock for serialized write-through
			for (const subscriber of this.onWriteSubscribers) {
				await subscriber(this.getAll())
			}
		})
	}

	// ────────────────────────────── Reconciliation ──────────────────────────────

	/**
	 * Scan task directories vs index and fix any drift.
	 *
	 * - Tasks on disk but missing from cache: read and add
	 * - Tasks in cache but missing from disk: remove
	 */
	async reconcile(): Promise<void> {
		// Run through the write lock to prevent interleaving with upsert/delete
		return this.withLock(async () => {
			const tasksDir = await this.getTasksDir()

			let dirEntries: string[]
			try {
				dirEntries = await fs.readdir(tasksDir)
			} catch {
				return // tasks dir doesn't exist yet
			}

			// Filter out the index file and hidden files
			const taskDirNames = dirEntries.filter((name) => !name.startsWith("_") && !name.startsWith("."))

			const onDiskIds = new Set(taskDirNames)
			const cacheIds = new Set(this.cache.keys())
			let changed = false

			// Tasks on disk but not in cache: read their history_item.json
			for (const taskId of onDiskIds) {
				if (!cacheIds.has(taskId)) {
					try {
						const item = await this.readTaskFile(taskId)
						if (item) {
							this.cache.set(taskId, item)
							changed = true
						}
					} catch {
						// Corrupted or missing file, skip
					}
				}
			}

			// Tasks in cache but not on disk: remove from cache
			for (const taskId of cacheIds) {
				if (!onDiskIds.has(taskId)) {
					this.cache.delete(taskId)
					changed = true
				}
			}

			if (changed) {
				this.scheduleIndexWrite()
			}
		})
	}

	/**
	 * Repair delegation inconsistencies left by a crash mid-transition.
	 *
	 * Called once from `initialize()` after `reconcile()`. Runs inside `withLock` to
	 * prevent interleaving with watcher-triggered reconcile() calls. Iterates until
	 * convergence so that one-level chained delegations visible at startup are resolved.
	 *
	 * Must NOT be called from within `withLock` — `withLock` is non-reentrant (promise
	 * chain); calling `upsert` (which acquires the lock) from inside would deadlock.
	 * `upsertCore` is called directly here instead, bypassing transition validation via
	 * `skipTransitionCheck: true` because these writes are administrative repairs, not
	 * runtime state-machine transitions.
	 *
	 * Cases repaired per pass:
	 * - Parent `delegated` with no `awaitingChildId` → parent → `active` (invalid state)
	 * - Parent `delegated`, child not found → parent → `active` (orphaned delegation)
	 * - Parent `delegated`, child `completed` → parent → `active` (interrupted handoff)
	 *
	 * A parent awaiting an `active`, `interrupted`, or `delegated` child is left as-is — the child is resumable.
	 *
	 * Repairs are guarded against LIVE delegations (this can run while another
	 * provider/window is mid-delegation over the same storage): before repairing,
	 * the parent and child files are re-read fresh from disk (the index-seeded
	 * cache can be stale), and a parent whose file was written within the grace
	 * window is skipped — a freshly persisted delegation whose child has not
	 * written its first history file yet is indistinguishable from a crash orphan.
	 */
	private async reconcileDelegationState(): Promise<void> {
		return this.withLock(async () => {
			let repairsInThisPass: number
			do {
				repairsInThisPass = 0
				// Rebuild the lookup map each pass so repairs from the previous pass
				// are visible when evaluating chained delegations.
				const byId = new Map(Array.from(this.cache.values()).map((i) => [i.id, i]))

				for (const [, cachedItem] of byId) {
					if (cachedItem.status !== "delegated") {
						continue
					}

					// Fresh read: the cache may be stale relative to writes from another
					// store instance (second window) or in-flight index debounce.
					const item = (await this.readTaskFile(cachedItem.id)) ?? cachedItem
					if (item.status !== "delegated") {
						this.cache.set(item.id, item)
						continue
					}

					// Recency guard: skip repairs for parents written moments ago — the
					// delegation is likely live in another provider, with the child's
					// first save still in flight. The periodic reconciliation pass will
					// repair it later if it truly is an orphan.
					if (await this.isRecentlyWritten(item.id)) {
						continue
					}

					if (!item.awaitingChildId) {
						await this.upsertCore(
							{ ...item, status: "active", awaitingChildId: undefined, delegatedToId: undefined },
							{ skipTransitionCheck: true },
						)
						console.warn(
							`[TaskHistoryStore] Reconciled invalid delegation: task ${item.id} → active (no awaitingChildId)`,
						)
						repairsInThisPass++
						continue
					}

					// Fresh read of the child as well: it may exist on disk without being
					// in this store's cache yet (created by another provider).
					const child = (await this.readTaskFile(item.awaitingChildId)) ?? byId.get(item.awaitingChildId)

					if (!child) {
						await this.upsertCore(
							{
								...item,
								status: "active",
								awaitingChildId: undefined,
								delegatedToId: undefined,
							},
							{ skipTransitionCheck: true },
						)
						console.warn(
							`[TaskHistoryStore] Reconciled orphaned delegation: task ${item.id} → active (child ${item.awaitingChildId} not found)`,
						)
						repairsInThisPass++
					} else if (child.status === "completed") {
						this.cache.set(child.id, child)
						await this.upsertCore(
							{
								...item,
								status: "active",
								awaitingChildId: undefined,
								delegatedToId: undefined,
								completedByChildId: child.id,
								completionResultSummary:
									child.completionResultSummary ?? "Task completed (recovered after interruption)",
							},
							{ skipTransitionCheck: true },
						)
						console.warn(
							`[TaskHistoryStore] Reconciled interrupted handoff: task ${item.id} → active (child ${item.awaitingChildId} already completed)`,
						)
						repairsInThisPass++
					} else {
						// child.status === "active", "interrupted", or "delegated" → leave
						// as-is this pass, but adopt the fresh child state into the cache.
						this.cache.set(child.id, child)
					}
				}
			} while (repairsInThisPass > 0)
		})
	}

	/**
	 * True when a task's history file was modified within the delegation-repair
	 * grace window. Missing files count as NOT recent (they cannot be live).
	 */
	private async isRecentlyWritten(taskId: string): Promise<boolean> {
		// Grace <= 0 disables the guard entirely. This must be an explicit check:
		// Date.now() is integer ms while stat.mtimeMs has sub-ms precision, so a
		// same-millisecond write can yield a NEGATIVE age that would pass `< 0`.
		if (this.delegationRepairGraceMs <= 0) {
			return false
		}
		try {
			const filePath = await this.getTaskFilePath(taskId)
			const stat = await fs.stat(filePath)
			return Date.now() - stat.mtimeMs < this.delegationRepairGraceMs
		} catch {
			return false
		}
	}

	// ────────────────────────────── Cache invalidation ──────────────────────────────

	/**
	 * Invalidate a single task's cache entry (re-read from disk on next access).
	 */
	async invalidate(taskId: string): Promise<void> {
		try {
			const item = await this.readTaskFile(taskId)
			if (item) {
				this.cache.set(taskId, item)
			} else {
				this.cache.delete(taskId)
			}
		} catch {
			this.cache.delete(taskId)
		}
	}

	/**
	 * Clear all in-memory cache and reload from index.
	 */
	invalidateAll(): void {
		this.cache.clear()
	}

	// ────────────────────────────── Migration ──────────────────────────────

	/**
	 * Migrate from globalState taskHistory array to per-task files.
	 *
	 * For each entry in the globalState array, writes a `history_item.json`
	 * file if one doesn't already exist. This is idempotent and safe to re-run.
	 */
	async migrateFromGlobalState(taskHistoryEntries: HistoryItem[]): Promise<void> {
		if (!taskHistoryEntries || taskHistoryEntries.length === 0) {
			return
		}

		for (const item of taskHistoryEntries) {
			if (!item.id) {
				continue
			}

			// Check if task directory exists on disk
			const tasksDir = await this.getTasksDir()
			const taskDir = path.join(tasksDir, item.id)

			try {
				await fs.access(taskDir)
			} catch {
				// Task directory doesn't exist; skip this entry as it's orphaned in globalState
				continue
			}

			// Write history_item.json if it doesn't exist yet
			const filePath = path.join(taskDir, GlobalFileNames.historyItem)
			try {
				await fs.access(filePath)
				// File already exists, skip (don't overwrite existing per-task files)
			} catch {
				// File doesn't exist, write it
				await safeWriteJson(filePath, item)
				this.cache.set(item.id, item)
			}
		}

		// Write the index
		await this.writeIndex()

		// Repair any delegation inconsistencies introduced by the migrated entries.
		// reconcileDelegationState() is idempotent so running it again is safe.
		await this.reconcileDelegationState()
	}

	// ────────────────────────────── Private: Index management ──────────────────────────────

	/**
	 * Load the `_index.json` file into the in-memory cache.
	 */
	private async loadIndex(): Promise<void> {
		const indexPath = await this.getIndexPath()

		try {
			const raw = await fs.readFile(indexPath, "utf8")
			const index: HistoryIndex = JSON.parse(raw)

			if (index.version === 1 && Array.isArray(index.entries)) {
				for (const entry of index.entries) {
					if (entry.id) {
						this.cache.set(entry.id, entry)
					}
				}
			}
		} catch {
			// Index doesn't exist or is corrupted; cache stays empty.
			// Reconciliation will rebuild it from per-task files.
		}
	}

	/**
	 * Write the full index to disk.
	 */
	private async writeIndex(): Promise<void> {
		const indexPath = await this.getIndexPath()
		const index: HistoryIndex = {
			version: 1,
			updatedAt: Date.now(),
			entries: this.getAll(),
		}

		await safeWriteJson(indexPath, index)
	}

	/**
	 * Schedule a debounced index write.
	 */
	private scheduleIndexWrite(): void {
		if (this.disposed) {
			return
		}

		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
		}

		this.indexWriteTimer = setTimeout(async () => {
			this.indexWriteTimer = null
			try {
				await this.writeIndex()
			} catch (err) {
				console.error("[TaskHistoryStore] Failed to write index:", err)
			}
		}, TaskHistoryStore.INDEX_WRITE_DEBOUNCE_MS)
	}

	/**
	 * Force an immediate index write (called on dispose/shutdown).
	 */
	async flushIndex(): Promise<void> {
		if (this.indexWriteTimer) {
			clearTimeout(this.indexWriteTimer)
			this.indexWriteTimer = null
		}

		await this.writeIndex()
	}

	// ────────────────────────────── Private: Per-task file I/O ──────────────────────────────

	/**
	 * Write a HistoryItem to its per-task `history_item.json` file.
	 */
	private async writeTaskFile(item: HistoryItem): Promise<void> {
		const filePath = await this.getTaskFilePath(item.id)
		await safeWriteJson(filePath, item)
	}

	/**
	 * Read a HistoryItem from its per-task `history_item.json` file.
	 */
	private async readTaskFile(taskId: string): Promise<HistoryItem | null> {
		const filePath = await this.getTaskFilePath(taskId)

		try {
			const raw = await fs.readFile(filePath, "utf8")
			const item: HistoryItem = JSON.parse(raw)
			return item.id ? item : null
		} catch {
			return null
		}
	}

	// ────────────────────────────── Private: fs.watch ──────────────────────────────

	/**
	 * Watch the tasks directory for changes from other instances.
	 */
	private startWatcher(): void {
		if (this.disposed) {
			return
		}

		// Use a debounced handler to avoid excessive reconciliation
		let watchDebounce: ReturnType<typeof setTimeout> | null = null

		this.getTasksDir()
			.then((tasksDir) => {
				if (this.disposed) {
					return
				}

				try {
					this.fsWatcher = fsSync.watch(tasksDir, { recursive: false }, (_eventType, _filename) => {
						if (this.disposed) {
							return
						}

						// Debounce the reconciliation triggered by fs.watch
						if (watchDebounce) {
							clearTimeout(watchDebounce)
						}
						watchDebounce = setTimeout(() => {
							this.reconcile().catch((err) => {
								console.error("[TaskHistoryStore] Reconciliation after fs.watch failed:", err)
							})
						}, 500)
					})

					this.fsWatcher.on("error", (err) => {
						console.error("[TaskHistoryStore] fs.watch error:", err)
						// fs.watch is unreliable on some platforms; periodic reconciliation
						// serves as the fallback.
					})
				} catch (err) {
					console.error("[TaskHistoryStore] Failed to start fs.watch:", err)
				}
			})
			.catch((err) => {
				console.error("[TaskHistoryStore] Failed to get tasks dir for watcher:", err)
			})
	}

	/**
	 * Start periodic reconciliation as a defensive fallback for platforms
	 * where fs.watch is unreliable.
	 */
	private startPeriodicReconciliation(): void {
		if (this.disposed) {
			return
		}

		this.reconcileTimer = setTimeout(async () => {
			if (this.disposed) {
				return
			}
			try {
				await this.reconcile()
			} catch (err) {
				console.error("[TaskHistoryStore] Periodic reconciliation failed:", err)
			}
			this.startPeriodicReconciliation()
		}, TaskHistoryStore.RECONCILE_INTERVAL_MS)
	}

	// ────────────────────────────── Atomic read-modify-write ──────────────────────────────

	/**
	 * Read a HistoryItem from the in-memory cache and write back an updated version,
	 * all within a single lock acquisition so no concurrent writer can interleave
	 * between the read and the write.
	 *
	 * The `updater` receives the current cached item and must return the new item
	 * synchronously. It must not perform I/O or acquire any other lock.
	 *
	 * @throws If the task ID is not present in the cache.
	 */
	public atomicReadAndUpdate(taskId: string, updater: (current: HistoryItem) => HistoryItem): Promise<HistoryItem[]> {
		return this.withLock(async () => {
			const current = this.cache.get(taskId)
			if (!current) {
				throw new Error(`[TaskHistoryStore] atomicReadAndUpdate: task ${taskId} not found in cache`)
			}
			// Deep-copy so a mutating updater cannot alter cached state before persistence.
			const snapshot = structuredClone(current)
			const updated = updater(snapshot)
			if (updated.id !== taskId) {
				throw new Error(
					`[TaskHistoryStore] atomicReadAndUpdate: updater changed task id from ${taskId} to ${updated.id}`,
				)
			}
			return this.upsertCore(updated)
		})
	}

	/**
	 * Atomically update two related HistoryItems within a single lock acquisition.
	 * Both updaters run synchronously (no I/O, no lock re-entry). Both writes are
	 * committed before the lock releases — no concurrent writer can observe an
	 * intermediate state.
	 *
	 * @throws If either task ID is not present in the cache.
	 */
	public atomicUpdatePair(
		firstId: string,
		secondId: string,
		firstUpdater: (current: HistoryItem) => HistoryItem,
		secondUpdater: (current: HistoryItem) => HistoryItem,
	): Promise<HistoryItem[]> {
		return this.withLock(async () => {
			const first = this.cache.get(firstId)
			if (!first) throw new Error(`[TaskHistoryStore] atomicUpdatePair: ${firstId} not found`)
			const second = this.cache.get(secondId)
			if (!second) throw new Error(`[TaskHistoryStore] atomicUpdatePair: ${secondId} not found`)

			const updatedFirst = firstUpdater(structuredClone(first))
			const updatedSecond = secondUpdater(structuredClone(second))

			if (updatedFirst.id !== firstId) {
				throw new Error(
					`[TaskHistoryStore] atomicUpdatePair: first updater changed id from ${firstId} to ${updatedFirst.id}`,
				)
			}
			if (updatedSecond.id !== secondId) {
				throw new Error(
					`[TaskHistoryStore] atomicUpdatePair: second updater changed id from ${secondId} to ${updatedSecond.id}`,
				)
			}

			// Validate status transitions before any disk write — mirrors upsertCore guard.
			for (const [existing, updated] of [
				[first, updatedFirst],
				[second, updatedSecond],
			] as const) {
				if (updated.status !== undefined) {
					const normalizedExisting: HistoryItemStatus = existing.status ?? "active"
					if (updated.status !== normalizedExisting) {
						assertValidTransition(existing.status, updated.status)
					}
				}
			}

			// Merge with existing cache entries before writing, mirroring upsertCore.
			const mergedFirst = { ...first, ...updatedFirst }
			const mergedSecond = { ...second, ...updatedSecond }

			// Write both files before touching the cache so readers never observe a
			// half-updated in-memory state between the two await points.
			await this.writeTaskFile(mergedFirst)
			await this.writeTaskFile(mergedSecond)

			// Both disk writes succeeded — now update the cache atomically.
			this.cache.set(firstId, mergedFirst)
			this.cache.set(secondId, mergedSecond)

			this.scheduleIndexWrite()
			const all = this.getAll()
			for (const subscriber of this.onWriteSubscribers) {
				await subscriber(all)
			}
			return all
		})
	}

	// ────────────────────────────── Private: Write lock ──────────────────────────────

	/**
	 * Serializes all read-modify-write operations within a single extension
	 * host process to prevent concurrent interleaving.
	 */
	private withLock<T>(fn: () => Promise<T>): Promise<T> {
		const result = this.writeLock.then(fn, fn)
		this.writeLock = result.then(
			() => {},
			() => {},
		)
		return result
	}

	// ────────────────────────────── Private: Path helpers ──────────────────────────────

	/**
	 * Get the tasks base directory path, resolving custom storage paths.
	 */
	private async getTasksDir(): Promise<string> {
		const basePath = await getStorageBasePath(this.globalStoragePath)
		return path.join(basePath, "tasks")
	}

	/**
	 * Get the path to a task's `history_item.json` file.
	 */
	private async getTaskFilePath(taskId: string): Promise<string> {
		const tasksDir = await this.getTasksDir()
		return path.join(tasksDir, taskId, GlobalFileNames.historyItem)
	}

	/**
	 * Get the path to the `_index.json` file.
	 */
	private async getIndexPath(): Promise<string> {
		const tasksDir = await this.getTasksDir()
		return path.join(tasksDir, GlobalFileNames.historyIndex)
	}
}
