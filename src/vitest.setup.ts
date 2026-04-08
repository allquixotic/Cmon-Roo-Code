import nock from "nock"
import { vi } from "vitest"

import "./utils/path" // Import to enable String.prototype.toPosix().

// Disable network requests by default for all tests.
nock.disableNetConnect()

export function allowNetConnect(host?: string | RegExp) {
	if (host) {
		nock.enableNetConnect(host)
	} else {
		nock.enableNetConnect()
	}
}

// Global mocks that many tests expect.
global.structuredClone = global.structuredClone || ((obj: any) => JSON.parse(JSON.stringify(obj)))

function wrapConstructableImplementation<T>(implementation: T): T {
	if (typeof implementation !== "function") {
		return implementation
	}

	const fn = implementation as unknown as (...args: unknown[]) => unknown

	// Arrow functions do not have a prototype and cannot be used with `new`.
	// Vitest 4 started surfacing this for constructor-style mocks that had been
	// written with arrow implementations.
	if (Object.prototype.hasOwnProperty.call(fn, "prototype") && (fn as { prototype?: unknown }).prototype) {
		return implementation
	}

	return function (this: unknown, ...args: unknown[]) {
		return fn.apply(this, args)
	} as T
}
function patchMockMethods<T extends ReturnType<typeof vi.fn>>(mock: T): T {
	for (const methodName of ["mockImplementation", "mockImplementationOnce"] as const) {
		const originalMethod = mock[methodName] as typeof mock[typeof methodName] & {
			__ozConstructablePatched?: boolean
		}
		if (originalMethod?.__ozConstructablePatched) {
			continue
		}

		mock[methodName] = ((implementation: Parameters<typeof originalMethod>[0]) =>
			originalMethod.call(mock, wrapConstructableImplementation(implementation))) as typeof mock[typeof methodName]
		;(mock[methodName] as typeof mock[typeof methodName] & { __ozConstructablePatched?: boolean }).__ozConstructablePatched =
			true
	}

	return mock
}

function patchMockApi(mockApi: { fn: typeof vi.fn }) {

	if ((mockApi.fn as typeof vi.fn & { __ozConstructablePatched?: boolean }).__ozConstructablePatched) {
		return
	}

	const originalFn = mockApi.fn.bind(mockApi)
	const patchedFn = ((implementation?: Parameters<typeof vi.fn>[0]) =>
		patchMockMethods(originalFn(wrapConstructableImplementation(implementation)))) as typeof vi.fn

	;(patchedFn as typeof vi.fn & { __ozConstructablePatched?: boolean }).__ozConstructablePatched = true
	mockApi.fn = patchedFn
}

patchMockApi(vi as typeof vi & { fn: typeof vi.fn })

if ((globalThis as { vi?: { fn: typeof vi.fn } }).vi && (globalThis as { vi?: { fn: typeof vi.fn } }).vi !== vi) {
	patchMockApi((globalThis as { vi?: { fn: typeof vi.fn } }).vi!)
}

if ((globalThis as { vitest?: { fn: typeof vi.fn } }).vitest) {
	patchMockApi((globalThis as { vitest?: { fn: typeof vi.fn } }).vitest!)
}
