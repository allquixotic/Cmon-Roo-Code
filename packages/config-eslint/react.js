import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import typescriptEslint from "typescript-eslint"
import pluginReactHooks from "eslint-plugin-react-hooks"
import pluginReact from "eslint-plugin-react"
import globals from "globals"

import { config } from "./base.js"

/**
 * @type {import("eslint").Linter.Config[]}
 */
export const reactConfig = [
	...config,
	js.configs.recommended,
	eslintConfigPrettier,
	...typescriptEslint.configs.recommended,
	{
		plugins: {
			react: pluginReact,
		},
		languageOptions: {
			globals: {
				...globals.serviceworker,
			},
		},
	},
	{
		plugins: {
			"react-hooks": pluginReactHooks,
		},
		settings: { react: { version: "detect" } },
		rules: {
			...pluginReactHooks.configs.recommended.rules,
			"no-useless-assignment": "off",
			"preserve-caught-error": "off",
			// React scope no longer necessary with new JSX transform.
			"react/react-in-jsx-scope": "off",
			"react/display-name": "off",
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/immutability": "off",
			"react-hooks/purity": "off",
			"react-hooks/refs": "off",
			"react-hooks/incompatible-library": "off",
			"react-hooks/unsupported-syntax": "off",
			"react-hooks/preserve-manual-memoization": "off",
		},
	},
]
