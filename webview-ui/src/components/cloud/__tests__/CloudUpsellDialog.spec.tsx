import { render, screen, fireEvent } from "@testing-library/react"
import { vi } from "vitest"
import { CloudUpsellDialog } from "../CloudUpsellDialog"

// Mock the useTranslation hook
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"cloud:cloudBenefitsTitle": "Try Roo Code Cloud",
				"cloud:cloudBenefitProvider": "Access free and paid models that work great with Roo",
				"cloud:cloudBenefitCloudAgents": "Give tasks to autonomous Cloud agents",
				"cloud:cloudBenefitTriggers": "Get code reviews on GitHub, start tasks from Slack and more",
				"cloud:cloudBenefitWalkaway": "Follow and control tasks from anywhere (including your phone)",
				"cloud:cloudBenefitHistory": "Access your task history from anywhere and share them with others",
				"cloud:cloudBenefitMetrics": "Get a holistic view of your token consumption",
				"cloud:connect": "Get started",
			}
			return translations[key] || key
		},
	}),
	initReactI18next: { type: "3rdParty", init: () => {} },
	Trans: ({ children, i18nKey }: { children?: React.ReactNode; i18nKey: string }) => {
		return <>{children || i18nKey}</>
	},
}))

// RooHero now reads masqueradeAsRooCode from the ExtensionStateContext and renders
// translated alt text. Stub both dependencies so this dialog-focused test keeps a
// minimal render tree.
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ masqueradeAsRooCode: false }),
}))
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({ t: (key: string) => key, i18n: {} }),
}))

describe("CloudUpsellDialog", () => {
	const mockOnOpenChange = vi.fn()
	const mockOnConnect = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders dialog when open", () => {
		render(<CloudUpsellDialog open={true} onOpenChange={mockOnOpenChange} onConnect={mockOnConnect} />)

		expect(screen.getByText("Try Roo Code Cloud")).toBeInTheDocument()
		expect(screen.getByText("Access free and paid models that work great with Roo")).toBeInTheDocument()
		expect(screen.getByText("Give tasks to autonomous Cloud agents")).toBeInTheDocument()
		expect(screen.getByText("Get code reviews on GitHub, start tasks from Slack and more")).toBeInTheDocument()
		expect(screen.getByText("Follow and control tasks from anywhere (including your phone)")).toBeInTheDocument()
		expect(
			screen.getByText("Access your task history from anywhere and share them with others"),
		).toBeInTheDocument()
		expect(screen.getByText("Get a holistic view of your token consumption")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument()
	})

	it("does not render dialog when closed", () => {
		render(<CloudUpsellDialog open={false} onOpenChange={mockOnOpenChange} onConnect={mockOnConnect} />)

		expect(screen.queryByText("Try Roo Code Cloud")).not.toBeInTheDocument()
	})

	it("calls onConnect when connect button is clicked", () => {
		render(<CloudUpsellDialog open={true} onOpenChange={mockOnOpenChange} onConnect={mockOnConnect} />)

		const connectButton = screen.getByRole("button", { name: "Get started" })
		fireEvent.click(connectButton)

		expect(mockOnConnect).toHaveBeenCalledTimes(1)
	})

	it("renders all benefits as list items", () => {
		render(<CloudUpsellDialog open={true} onOpenChange={mockOnOpenChange} onConnect={mockOnConnect} />)

		const listItems = screen.getAllByRole("listitem")
		expect(listItems).toHaveLength(6)
	})
})
