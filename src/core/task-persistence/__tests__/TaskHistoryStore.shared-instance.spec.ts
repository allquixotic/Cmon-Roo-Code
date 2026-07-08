// npx vitest run core/task-persistence/__tests__/TaskHistoryStore.shared-instance.spec.ts

import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import type { HistoryItem } from "@roo-code/types"

import { TaskHistoryStore } from "../TaskHistoryStore"

vi.mock("../../../utils/storage", () => ({
	getStorageBasePath: vi.fn(async (p: string) => p),
}))

/** dispose() flushes the index asynchronously; retry the recursive rm until it settles. */
const rmStorageDir = async (dir: string) => {
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			await fs.rm(dir, { recursive: true, force: true })
			return
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 50))
		}
	}
	await fs.rm(dir, { recursive: true, force: true })
}

const makeItem = (id: string, overrides: Partial<HistoryItem> = {}): HistoryItem =>
	({
		id,
		ts: Date.now(),
		task: `Task ${id}`,
		tokensIn: 0,
		tokensOut: 0,
		totalCost: 0,
		...overrides,
	}) as HistoryItem

describe("TaskHistoryStore process-wide sharing", () => {
	let storageDir: string

	beforeEach(async () => {
		TaskHistoryStore.__resetInstancesForTests()
		storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-history-store-shared-"))
	})

	afterEach(async () => {
		TaskHistoryStore.__resetInstancesForTests()
		await rmStorageDir(storageDir)
	})

	it("getOrCreate returns ONE shared instance per storage path", () => {
		// Two providers over the same storage (sidebar + editor tab) must share a
		// single cache and write lock; separate instances would run independent
		// delegation reconciliation over the same files and sever live delegations.
		const a = TaskHistoryStore.getOrCreate(storageDir)
		const b = TaskHistoryStore.getOrCreate(storageDir)
		expect(b).toBe(a)

		const other = TaskHistoryStore.getOrCreate(storageDir + "-other")
		expect(other).not.toBe(a)

		a.release()
		b.release()
		other.release()
	})

	it("release() only disposes the store when the last reference is gone", async () => {
		const onWriteA = vi.fn().mockResolvedValue(undefined)
		const onWriteB = vi.fn().mockResolvedValue(undefined)
		const a = TaskHistoryStore.getOrCreate(storageDir, { onWrite: onWriteA })
		const b = TaskHistoryStore.getOrCreate(storageDir, { onWrite: onWriteB })
		expect(b).toBe(a)

		await a.initialize()

		// Both subscribers see every mutation.
		await a.upsert(makeItem("t1"))
		expect(onWriteA).toHaveBeenCalledTimes(1)
		expect(onWriteB).toHaveBeenCalledTimes(1)

		// First release (tab closed): the store survives and stops notifying only
		// the released subscriber.
		a.release(onWriteA)
		await a.upsert(makeItem("t2"))
		expect(onWriteA).toHaveBeenCalledTimes(1)
		expect(onWriteB).toHaveBeenCalledTimes(2)

		// Second release: the registry forgets the instance; a new getOrCreate
		// creates a fresh (non-disposed) store.
		b.release(onWriteB)
		const c = TaskHistoryStore.getOrCreate(storageDir)
		expect(c).not.toBe(a)
		c.release()
	})

	it("initialize() is idempotent — a second provider attach does not re-run reconciliation", async () => {
		const store = TaskHistoryStore.getOrCreate(storageDir, { delegationRepairGraceMs: 0 })
		await store.initialize()

		// Persist a live-looking delegation AFTER initialization.
		await store.upsert(makeItem("parent", { status: "active" }))
		await store.upsert(
			makeItem("parent", { status: "delegated", awaitingChildId: "child", delegatedToId: "child" }),
		)

		// Second attach (e.g. "Open in New Tab") re-calls initialize(); it must NOT
		// re-run reconcileDelegationState and repair the just-created delegation.
		const again = TaskHistoryStore.getOrCreate(storageDir, { delegationRepairGraceMs: 0 })
		expect(again).toBe(store)
		await again.initialize()

		expect(store.get("parent")?.status).toBe("delegated")
		expect(store.get("parent")?.awaitingChildId).toBe("child")

		store.release()
		again.release()
	})
})

describe("TaskHistoryStore preserveExistingStatus", () => {
	let storageDir: string
	let store: TaskHistoryStore

	beforeEach(async () => {
		TaskHistoryStore.__resetInstancesForTests()
		storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-history-store-status-"))
		store = new TaskHistoryStore(storageDir, { delegationRepairGraceMs: 0 })
		await store.initialize()
	})

	afterEach(async () => {
		store.dispose()
		await rmStorageDir(storageDir)
	})

	it("keeps the currently persisted status even when the caller carries a stale one", async () => {
		await store.upsert(makeItem("t1", { status: "active" }))
		await store.upsert(makeItem("t1", { status: "delegated", awaitingChildId: "c1" }))

		// A straggler save (e.g. Task.saveClineMessages) captured status "active"
		// before the delegation applied; with preserveExistingStatus the write must
		// NOT revert the transition.
		await store.upsert(makeItem("t1", { status: "active", tokensIn: 42 }), { preserveExistingStatus: true })

		const item = store.get("t1")
		expect(item?.status).toBe("delegated")
		expect(item?.tokensIn).toBe(42)
	})

	it("closes the TOCTOU window: a preserve-save enqueued behind a transition adopts it", async () => {
		await store.upsert(makeItem("t1", { status: "active" }))

		// Enqueue the transition and the stale-status save back-to-back WITHOUT
		// awaiting in between — both serialize on the store's write lock, and the
		// status decision must happen inside the lock.
		const transition = store.upsert(makeItem("t1", { status: "delegated", awaitingChildId: "c1" }))
		const stragglerSave = store.upsert(makeItem("t1", { status: "active", tokensOut: 7 }), {
			preserveExistingStatus: true,
		})
		await Promise.all([transition, stragglerSave])

		const item = store.get("t1")
		expect(item?.status).toBe("delegated")
		expect(item?.tokensOut).toBe(7)
	})

	it("first insert still applies the incoming status (initialStatus semantics)", async () => {
		await store.upsert(makeItem("child", { status: "active" }), { preserveExistingStatus: true })
		expect(store.get("child")?.status).toBe("active")
	})

	it("allows interrupted → delegated (resumed cancelled subtask can spawn subtasks)", async () => {
		await store.upsert(makeItem("t1", { status: "active" }))
		await store.upsert(makeItem("t1", { status: "interrupted" }))
		await expect(
			store.upsert(makeItem("t1", { status: "delegated", awaitingChildId: "c1" })),
		).resolves.toBeDefined()
		expect(store.get("t1")?.status).toBe("delegated")
	})
})

describe("TaskHistoryStore delegation-repair grace window", () => {
	let storageDir: string

	beforeEach(async () => {
		TaskHistoryStore.__resetInstancesForTests()
		storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-history-store-grace-"))
	})

	afterEach(async () => {
		await rmStorageDir(storageDir)
	})

	it("does NOT repair a freshly-written delegated parent (live delegation, child save in flight)", async () => {
		// Simulate the mid-delegation disk state: parent persisted as delegated,
		// child's history file not yet written.
		const seed = new TaskHistoryStore(storageDir, { delegationRepairGraceMs: 0 })
		await seed.initialize()
		await seed.upsert(makeItem("parent", { status: "active" }))
		await seed.upsert(makeItem("parent", { status: "delegated", awaitingChildId: "child", delegatedToId: "child" }))
		seed.dispose()

		// A second store (another window) initializing with the DEFAULT grace window
		// must leave the recent delegation alone.
		const other = new TaskHistoryStore(storageDir)
		await other.initialize()
		expect(other.get("parent")?.status).toBe("delegated")
		expect(other.get("parent")?.awaitingChildId).toBe("child")
		other.dispose()
	})

	it("repairs the same orphan once it is outside the grace window", async () => {
		const seed = new TaskHistoryStore(storageDir, { delegationRepairGraceMs: 0 })
		await seed.initialize()
		await seed.upsert(makeItem("parent", { status: "active" }))
		await seed.upsert(makeItem("parent", { status: "delegated", awaitingChildId: "child", delegatedToId: "child" }))
		seed.dispose()

		// Grace 0 = every file is "old enough"; the orphaned delegation is repaired.
		const other = new TaskHistoryStore(storageDir, { delegationRepairGraceMs: 0 })
		await other.initialize()
		expect(other.get("parent")?.status).toBe("active")
		expect(other.get("parent")?.awaitingChildId).toBeUndefined()
		other.dispose()
	})
})
