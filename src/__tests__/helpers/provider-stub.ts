import { ClineProvider } from "../../core/webview/ClineProvider"

/**
 * Augments a plain stub object with the instance fields and bound methods that
 * ClineProvider methods read from `this` (runDelegationTransition,
 * delegationTransitionLocks, cancelledDelegationChildIds, cancellingDelegationChildIds),
 * so tests can call private methods via `(ClineProvider.prototype as any).method.call(stub, …)`
 * without instantiating a real ClineProvider.
 */
export function makeProviderStub<T extends object>(stub: T): T {
	const s = stub as any
	const proto = ClineProvider.prototype as any
	s.delegationTransitionLocks ??= new Map()
	s.cancelledDelegationChildIds ??= new Set()
	s.cancellingDelegationChildIds ??= new Set()
	s.log ??= vi.fn()
	s.taskHistoryStore ??= { get: () => undefined }
	// removeClineFromStack broadcasts a slim state refresh when the removed task was
	// not visible; tests that don't care about the webview get a no-op.
	s.postStateToWebviewWithoutClineMessages ??= vi.fn().mockResolvedValue(undefined)
	s.selectTask ??= vi.fn().mockResolvedValue(undefined)
	s.runDelegationTransition = proto.runDelegationTransition.bind(s)

	// reopenParentFromDelegation() relies on the concurrent-conversation aware helpers
	// isTaskVisible()/getTaskById() to decide whether to close the completing child and
	// refocus the parent. Tests that only express which task is "current" via getCurrentTask()
	// get sensible defaults derived from it, so the merged provider logic can run unchanged.
	if (typeof s.getCurrentTask === "function") {
		s.isTaskVisible ??= (id: string) => s.getCurrentTask()?.taskId === id
		s.getTaskById ??= (id: string) => {
			const current = s.getCurrentTask()
			return current?.taskId === id ? current : undefined
		}
	}

	return s
}
