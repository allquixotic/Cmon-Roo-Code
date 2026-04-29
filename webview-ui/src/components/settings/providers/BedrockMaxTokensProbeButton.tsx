import { useCallback, type ReactNode } from "react"

import type { ProviderSettings } from "@roo-code/types"

import { Button, StandardTooltip } from "@src/components/ui"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import {
	useBedrockMaxTokensProbe,
	type BedrockMaxTokensProbeResult,
} from "@src/components/ui/hooks/useBedrockMaxTokensProbe"

interface BedrockMaxTokensProbeButtonProps {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	/** Resolved model id (may differ from `apiConfiguration.apiModelId` for inference-profile targets). */
	modelId?: string
}

const formatProbeStatus = (
	t: ReturnType<typeof useAppTranslation>["t"],
	probing: boolean,
	result: BedrockMaxTokensProbeResult | undefined,
	error: string | undefined,
	override: number | undefined,
): ReactNode => {
	if (probing) {
		return <span>{t("settings:providers.bedrock.detectMaxTokensProbing")}</span>
	}
	if (error) {
		return (
			<span className="text-vscode-errorForeground">
				{t("settings:providers.bedrock.detectMaxTokensError", { error })}
			</span>
		)
	}
	if (result) {
		return (
			<span>
				{t("settings:providers.bedrock.detectMaxTokensSuccess", {
					value: result.maxOutputTokens.toLocaleString(),
					attempts: result.attempts,
					source: result.source,
				})}
			</span>
		)
	}
	if (override && override > 0) {
		return (
			<span>
				{t("settings:providers.bedrock.detectMaxTokensOverrideActive", {
					value: override.toLocaleString(),
				})}
			</span>
		)
	}
	return null
}

/**
 * Renders the AWS-probe affordance that lives next to the max-output-tokens slider
 * when the active provider is Bedrock. Clicking "Detect" sends a tiny Converse probe
 * via the extension-side helper and persists the discovered cap into
 * `apiConfiguration.awsModelMaxOutputTokens`. "Reset to default" clears the override
 * so the static `bedrockModels` table takes over again.
 *
 * The component renders both the buttons (returned via `buttonSlot`) and the helper
 * status text (returned via `helperText`) so the parent (`ThinkingBudget`) can place
 * each in the correct location inside `MaxOutputTokensControl`.
 */
export const useBedrockMaxTokensProbeUi = ({
	apiConfiguration,
	setApiConfigurationField,
	modelId,
}: BedrockMaxTokensProbeButtonProps): { buttonSlot: ReactNode; helperText: ReactNode } => {
	const { t } = useAppTranslation()
	const { probe, isProbing, lastResult, lastError } = useBedrockMaxTokensProbe()

	const onDetect = useCallback(async () => {
		const targetModelId = modelId || apiConfiguration.apiModelId || ""
		if (!targetModelId) {
			return
		}
		try {
			const result = await probe(apiConfiguration, targetModelId)
			setApiConfigurationField("awsModelMaxOutputTokens", result.maxOutputTokens)
			// If the user's existing `modelMaxTokens` request value would now exceed the
			// detected cap, optimistically lower it. Never raise it - that's the user's call.
			if (
				typeof apiConfiguration.modelMaxTokens === "number" &&
				apiConfiguration.modelMaxTokens > result.maxOutputTokens
			) {
				setApiConfigurationField("modelMaxTokens", result.maxOutputTokens)
			}
		} catch {
			// Error surfaced through the hook's lastError state; no-op here.
		}
	}, [apiConfiguration, modelId, probe, setApiConfigurationField])

	const onReset = useCallback(() => {
		setApiConfigurationField("awsModelMaxOutputTokens", undefined)
	}, [setApiConfigurationField])

	const detectDisabled = isProbing || !apiConfiguration.awsRegion || !(modelId || apiConfiguration.apiModelId)
	const resetDisabled = isProbing || !apiConfiguration.awsModelMaxOutputTokens

	const buttonSlot = (
		<div className="flex items-center gap-1">
			<StandardTooltip content={t("settings:providers.bedrock.detectMaxTokensTooltip")}>
				<Button
					variant="outline"
					size="sm"
					type="button"
					disabled={detectDisabled}
					onClick={onDetect}
					data-testid="bedrock-max-tokens-detect">
					{isProbing
						? t("settings:providers.bedrock.detectMaxTokensProbing")
						: t("settings:providers.bedrock.detectMaxTokens")}
				</Button>
			</StandardTooltip>
			{apiConfiguration.awsModelMaxOutputTokens ? (
				<Button
					variant="ghost"
					size="sm"
					type="button"
					disabled={resetDisabled}
					onClick={onReset}
					data-testid="bedrock-max-tokens-reset">
					{t("settings:providers.bedrock.detectMaxTokensReset")}
				</Button>
			) : null}
		</div>
	)

	const helperText = formatProbeStatus(t, isProbing, lastResult, lastError, apiConfiguration.awsModelMaxOutputTokens)

	return { buttonSlot, helperText }
}
