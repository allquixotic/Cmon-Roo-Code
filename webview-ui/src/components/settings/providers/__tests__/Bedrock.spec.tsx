import React from "react"
import { fireEvent, render, screen } from "@/utils/test-utils"

import type { ProviderSettings } from "@roo-code/types"

import { Bedrock } from "../Bedrock"

const mockSetApiConfigurationField = vi.fn()
const mockRefetch = vi.fn()

vi.mock("@src/components/ui/hooks/useBedrockDiscovery", () => ({
	useBedrockDiscovery: vi.fn(() => ({
		data: [
			{
				id: "anthropic.claude-sonnet-4-5-20250929-v1:0",
				label: "Claude Sonnet 4.5",
				baseModelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
				targetKind: "foundation-model",
				contextWindow: 200_000,
				contextSource: "base",
			},
			{
				id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0:1m",
				label: "Claude Sonnet 4.5 1M",
				baseModelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
				targetKind: "system-profile",
				contextWindow: 1_000_000,
				contextSource: "profile-id",
			},
		],
		isLoading: false,
		isError: false,
		error: undefined,
		refetch: mockRefetch,
		isFetching: false,
	})),
}))

vi.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange, disabled }: any) => (
		<label data-testid={`checkbox-${String(children).replace(/\s+/g, "-").toLowerCase()}`}>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={() => onChange(!checked)}
				data-testid={`checkbox-input-${String(children).replace(/\s+/g, "-").toLowerCase()}`}
			/>
			{children}
		</label>
	),
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({ children, value, onInput, "data-testid": dataTestId, ...rest }: any) => (
		<div>
			{children}
			<input
				data-testid={dataTestId ?? "vscode-text-field-input"}
				value={value}
				onChange={(event) => onInput?.(event)}
				{...rest}
			/>
		</div>
	),
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@src/components/ui", () => ({
	Button: ({ children, onClick, disabled }: any) => (
		<button type="button" onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
	SearchableSelect: ({ value, onValueChange, options, "data-testid": dataTestId }: any) => (
		<select data-testid={dataTestId} value={value} onChange={(event) => onValueChange(event.target.value)}>
			{options.map((option: any) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	),
	Select: ({ children, value, onValueChange }: any) => (
		<select value={value} onChange={(event) => onValueChange(event.target.value)}>
			{children}
		</select>
	),
	SelectContent: ({ children }: any) => <>{children}</>,
	SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
	SelectTrigger: ({ children }: any) => <>{children}</>,
	SelectValue: () => null,
	StandardTooltip: ({ children }: any) => <div>{children}</div>,
}))

describe("Bedrock", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("selects a discovered Bedrock profile and persists the resolved invoke target", () => {
		const apiConfiguration: ProviderSettings = {
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
			awsRegion: "us-east-1",
			awsUseProfile: true,
			awsProfile: "dev",
			awsBedrockInvokeTarget: "anthropic.claude-sonnet-4-5-20250929-v1:0",
			awsBedrockTargetKind: "foundation-model",
		}

		render(<Bedrock apiConfiguration={apiConfiguration} setApiConfigurationField={mockSetApiConfigurationField} />)

		fireEvent.change(screen.getByTestId("bedrock-target-select"), {
			target: { value: "us.anthropic.claude-sonnet-4-5-20250929-v1:0:1m" },
		})

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsCustomArn", "")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith(
			"awsBedrockInvokeTarget",
			"us.anthropic.claude-sonnet-4-5-20250929-v1:0:1m",
		)
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockTargetKind", "system-profile")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith(
			"apiModelId",
			"anthropic.claude-sonnet-4-5-20250929-v1:0",
		)
	})

	it("shows the custom ARN input when manual ARN mode is selected", () => {
		const apiConfiguration: ProviderSettings = {
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-sonnet-4-6",
			awsRegion: "us-east-1",
			awsUseProfile: true,
			awsProfile: "dev",
		}

		render(<Bedrock apiConfiguration={apiConfiguration} setApiConfigurationField={mockSetApiConfigurationField} />)

		fireEvent.change(screen.getByTestId("bedrock-target-select"), {
			target: { value: "__bedrock_manual_arn__" },
		})

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("awsBedrockTargetKind", "custom-arn")
	})

	it("shows and updates the VPC endpoint field when enabled", () => {
		const apiConfiguration: ProviderSettings = {
			apiProvider: "bedrock",
			apiModelId: "anthropic.claude-sonnet-4-6",
			awsRegion: "us-east-1",
			awsUseProfile: true,
			awsProfile: "dev",
			awsBedrockEndpointEnabled: true,
			awsBedrockEndpoint: "https://example.com",
		}

		render(<Bedrock apiConfiguration={apiConfiguration} setApiConfigurationField={mockSetApiConfigurationField} />)

		expect(screen.getByTestId("vpc-endpoint-input")).toHaveValue("https://example.com")

		fireEvent.change(screen.getByTestId("vpc-endpoint-input"), {
			target: { value: "https://bedrock-vpc.example.com" },
		})

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith(
			"awsBedrockEndpoint",
			"https://bedrock-vpc.example.com",
		)
	})
})
