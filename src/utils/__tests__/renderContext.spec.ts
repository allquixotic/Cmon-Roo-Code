import { getDefaultRenderContext, normalizeRenderContext, shouldRedirectSidebarToEditor } from "../renderContext"

describe("renderContext helpers", () => {
	it("normalizes unknown values to editor", () => {
		expect(normalizeRenderContext(undefined)).toBe("editor")
		expect(normalizeRenderContext("anything-else")).toBe("editor")
	})

	it("preserves the editor render context", () => {
		expect(normalizeRenderContext("editor")).toBe("editor")
	})

	it("preserves the sidebar render context", () => {
		expect(normalizeRenderContext("sidebar")).toBe("sidebar")
	})

	it("reads and normalizes the saved default render context", () => {
		const contextProxy = {
			getValue: vi.fn().mockReturnValue("editor"),
		}

		expect(getDefaultRenderContext(contextProxy as any)).toBe("editor")
		expect(contextProxy.getValue).toHaveBeenCalledWith("defaultRenderContext")
	})

	it("redirects sidebar launches when the editor is preferred", () => {
		expect(shouldRedirectSidebarToEditor("sidebar", "editor")).toBe(true)
		expect(shouldRedirectSidebarToEditor("sidebar", "sidebar")).toBe(false)
		expect(shouldRedirectSidebarToEditor("editor", "editor")).toBe(false)
	})
})
