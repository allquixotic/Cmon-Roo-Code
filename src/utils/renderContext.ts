import { type GlobalState } from "@roo-code/types"

import { ContextProxy } from "../core/config/ContextProxy"

export type DefaultRenderContext = NonNullable<GlobalState["defaultRenderContext"]>

export function normalizeRenderContext(value: unknown): DefaultRenderContext {
	return value === "sidebar" ? "sidebar" : "editor"
}

export function getDefaultRenderContext(contextProxy: Pick<ContextProxy, "getValue">): DefaultRenderContext {
	return normalizeRenderContext(contextProxy.getValue("defaultRenderContext"))
}

export function shouldRedirectSidebarToEditor(
	renderContext: "sidebar" | "editor",
	defaultRenderContext: DefaultRenderContext,
): boolean {
	return renderContext === "sidebar" && defaultRenderContext === "editor"
}
