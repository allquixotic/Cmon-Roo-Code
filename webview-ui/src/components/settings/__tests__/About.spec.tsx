import { act, fireEvent, render, screen, waitFor } from "@/utils/test-utils"

import { TranslationProvider } from "@/i18n/__mocks__/TranslationContext"
import { vscode } from "@/utils/vscode"

import { About } from "../About"

vi.mock("@/utils/vscode", () => ({
	vscode: { postMessage: vi.fn() },
}))

vi.mock("@/i18n/TranslationContext", async () => {
	const actual = await vi.importActual<typeof import("@/i18n/TranslationContext")>("@/i18n/TranslationContext")
	return {
		...actual,
		useAppTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("@roo/package", () => ({
	Package: {
		name: "roo-code",
		version: "1.0.0",
		sha: "abc12345",
	},
}))

describe("About", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders the About section header", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText("settings:sections.about")).toBeInTheDocument()
	})

	it("displays version information", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText(/Version: 1\.0\.0/)).toBeInTheDocument()
	})

	it("renders the bug report section with label and link text", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText("settings:about.bugReport.label")).toBeInTheDocument()
		expect(screen.getByText("settings:about.bugReport.link")).toBeInTheDocument()
	})

	it("renders the feature request section with label and link text", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText("settings:about.featureRequest.label")).toBeInTheDocument()
		expect(screen.getByText("settings:about.featureRequest.link")).toBeInTheDocument()
	})

	it("renders the security issue section with label and link text", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText("settings:about.securityIssue.label")).toBeInTheDocument()
		expect(screen.getByText("settings:about.securityIssue.link")).toBeInTheDocument()
	})

	it("renders the contact section with label and email", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText("settings:about.contact.label")).toBeInTheDocument()
		expect(screen.getByText("support@roocode.com")).toBeInTheDocument()
	})

	it("renders export, import, and reset buttons", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		expect(screen.getByText("settings:footer.settings.export")).toBeInTheDocument()
		expect(screen.getByText("settings:footer.settings.import")).toBeInTheDocument()
		expect(screen.getByText("settings:footer.settings.reset")).toBeInTheDocument()
	})

	it("requests the configured auto-import path on mount", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "getVSCodeSetting",
			setting: "roo-code.autoImportSettingsPath",
		})
	})

	it("renders auto-import controls and imports from the configured path", async () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "vsCodeSetting",
						setting: "roo-code.autoImportSettingsPath",
						value: "/tmp/roo-settings.json",
					},
				}),
			)
		})

		await waitFor(() => expect(screen.getByTestId("auto-import-path-input")).toHaveValue("/tmp/roo-settings.json"))

		fireEvent.click(screen.getByTestId("auto-import-now-button"))

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "importSettings",
			text: "/tmp/roo-settings.json",
		})
	})

	it("leaves startup auto-import unchecked by default", () => {
		render(
			<TranslationProvider>
				<About />
			</TranslationProvider>,
		)

		expect(screen.getByTestId("auto-import-startup-checkbox")).not.toBeChecked()
	})
})
