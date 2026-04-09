#!/usr/bin/env bun

import { promises as fs } from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"

const forkRoot = import.meta.dir
const buildRoot = path.join(forkRoot, "build")
const repoRoot = path.resolve(forkRoot, "..")
const artifactsDir = path.join(buildRoot, "artifacts")
const isWindows = process.platform === "win32"
const pnpmCommand = isWindows ? "pnpm.cmd" : "pnpm"
const homeDir = process.env.HOME ?? process.env.USERPROFILE

const editorTargets = {
	code: {
		label: "VS Code",
		userDataDirByPlatform: {
			darwin: ["Library", "Application Support", "Code"],
			linux: [".config", "Code"],
			win32: ["AppData", "Roaming", "Code"],
		},
		extensionsDirByPlatform: {
			darwin: [".vscode", "extensions"],
			linux: [".vscode", "extensions"],
			win32: [".vscode", "extensions"],
		},
	},
	"code-insiders": {
		label: "VS Code Insiders",
		userDataDirByPlatform: {
			darwin: ["Library", "Application Support", "Code - Insiders"],
			linux: [".config", "Code - Insiders"],
			win32: ["AppData", "Roaming", "Code - Insiders"],
		},
		extensionsDirByPlatform: {
			darwin: [".vscode-insiders", "extensions"],
			linux: [".vscode-insiders", "extensions"],
			win32: [".vscode-insiders", "extensions"],
		},
	},
}

function log(message) {
	console.log(`[allquixotic] ${message}`)
}

function usage() {
	console.log(`Usage:
  bun allquixotic/build.js [build|install|build-install] [options]

Commands:
  build         Validate and package the current checkout as a VSIX (default)
  install       Install a built VSIX into a local VS Code extensions directory
  build-install Build the current checkout and install the resulting VSIX locally

Build options:
  --skip-install
  --skip-check-types
  --skip-tests
  --skip-vsix

Install options:
  --vsix=<path>             Install an explicit VSIX instead of the latest artifact
  --editor=<code|code-insiders>
  --user-data-dir=<path>    Override the VS Code user-data directory to probe
  --extensions-dir=<path>   Override the VS Code extensions directory to install into
  --portable-data-dir=<path>
`)
}

function pathForSegments(basePath, segmentsByPlatform) {
	const segments = segmentsByPlatform[process.platform]
	if (!segments) {
		throw new Error(`Unsupported platform: ${process.platform}`)
	}
	return path.join(basePath, ...segments)
}

function ensureHomeDir() {
	if (!homeDir) {
		throw new Error("Could not resolve the current user home directory")
	}
	return homeDir
}

function getEditorTarget(editorName) {
	const target = editorTargets[editorName]
	if (!target) {
		throw new Error(
			`Unsupported editor target: ${editorName}. Supported values: ${Object.keys(editorTargets).join(", ")}`,
		)
	}
	return target
}

function resolveCliPath(value) {
	return path.resolve(process.cwd(), value)
}

function parseArguments(args) {
	const flags = new Set()
	const options = new Map()

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]
		if (!arg.startsWith("--")) {
			throw new Error(`Unexpected argument: ${arg}`)
		}

		const equalsIndex = arg.indexOf("=")
		if (equalsIndex !== -1) {
			options.set(arg.slice(2, equalsIndex), arg.slice(equalsIndex + 1))
			continue
		}

		const next = args[index + 1]
		if (next && !next.startsWith("--")) {
			options.set(arg.slice(2), next)
			index += 1
			continue
		}

		flags.add(arg)
	}

	return { flags, options }
}

async function run(command, args, options = {}) {
	await new Promise((resolve, reject) => {
		log(`$ ${[command, ...args].join(" ")}`)
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: "inherit",
			env: { ...process.env, CI: process.env.CI ?? "1" },
		})

		child.on("error", reject)
		child.on("exit", (code) => {
			if (code === 0) {
				resolve(undefined)
				return
			}
			reject(new Error(`${command} exited with code ${code ?? "unknown"}`))
		})
	})
}

async function pathExists(target) {
	try {
		await fs.access(target)
		return true
	} catch {
		return false
	}
}

async function removeObsoleteExtensionEntries(extensionsDir, installPrefix) {
	const obsoletePath = path.join(extensionsDir, ".obsolete")
	if (!(await pathExists(obsoletePath))) {
		return
	}

	let obsoleteEntries
	try {
		obsoleteEntries = JSON.parse(await fs.readFile(obsoletePath, "utf8"))
	} catch {
		log(`Skipping obsolete cleanup because ${obsoletePath} could not be parsed`)
		return
	}

	if (!obsoleteEntries || typeof obsoleteEntries !== "object" || Array.isArray(obsoleteEntries)) {
		log(`Skipping obsolete cleanup because ${obsoletePath} does not contain an object`)
		return
	}

	const normalizedInstallPrefix = installPrefix.toLowerCase()
	let changed = false
	for (const key of Object.keys(obsoleteEntries)) {
		if (key.toLowerCase().startsWith(normalizedInstallPrefix)) {
			delete obsoleteEntries[key]
			changed = true
		}
	}

	if (!changed) {
		return
	}

	if (Object.keys(obsoleteEntries).length === 0) {
		await fs.rm(obsoletePath, { force: true })
	} else {
		await fs.writeFile(obsoletePath, JSON.stringify(obsoleteEntries))
	}

	log(`Removed obsolete markers for ${installPrefix} from ${obsoletePath}`)
}

async function ensureBuildRoot() {
	await fs.mkdir(buildRoot, { recursive: true })
}

async function recreateDirectory(target) {
	await fs.rm(target, { recursive: true, force: true })
	await fs.mkdir(target, { recursive: true })
}

async function copyVsixArtifacts() {
	await recreateDirectory(artifactsDir)
	const binDir = path.join(repoRoot, "bin")
	const entries = await fs.readdir(binDir, { withFileTypes: true })
	const vsixFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".vsix"))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b))

	if (vsixFiles.length === 0) {
		throw new Error(`No .vsix files were produced in ${binDir}`)
	}

	const copied = []
	for (const name of vsixFiles) {
		const source = path.join(binDir, name)
		const target = path.join(artifactsDir, name)
		await fs.copyFile(source, target)
		copied.push(target)
	}

	return copied
}

async function runBranchBuild({ skipInstall, skipCheckTypes, skipTests, skipVsix }) {
	log(`Building current checkout at ${repoRoot}`)

	if (!skipInstall) {
		await run(pnpmCommand, ["install", "--frozen-lockfile"], { cwd: repoRoot })
	}

	await run(pnpmCommand, ["clean"], { cwd: repoRoot })

	if (!skipCheckTypes) {
		await run(pnpmCommand, ["--dir", "packages/types", "check-types"], { cwd: repoRoot })
		await run(pnpmCommand, ["--dir", "src", "check-types"], { cwd: repoRoot })
		await run(pnpmCommand, ["--dir", "webview-ui", "check-types"], { cwd: repoRoot })
	}

	if (!skipTests) {
		await run(pnpmCommand, ["--dir", "src", "test"], { cwd: repoRoot })
		await run(pnpmCommand, ["--dir", "webview-ui", "test"], { cwd: repoRoot })
	}

	if (skipVsix) {
		return []
	}

	await run(pnpmCommand, ["vsix"], { cwd: repoRoot })
	const copiedArtifacts = await copyVsixArtifacts()
	log("VSIX artifacts:")
	for (const artifact of copiedArtifacts) {
		log(`  ${artifact}`)
	}
	return copiedArtifacts
}

async function getLatestVsixArtifact() {
	if (!(await pathExists(artifactsDir))) {
		throw new Error(`No artifact directory found at ${artifactsDir}. Run the build first or pass --vsix.`)
	}

	const entries = await fs.readdir(artifactsDir, { withFileTypes: true })
	const vsixEntries = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".vsix"))
			.map(async (entry) => {
				const fullPath = path.join(artifactsDir, entry.name)
				const stats = await fs.stat(fullPath)
				return { fullPath, mtimeMs: stats.mtimeMs }
			}),
	)

	if (vsixEntries.length === 0) {
		throw new Error(`No .vsix files found in ${artifactsDir}. Run the build first or pass --vsix.`)
	}

	vsixEntries.sort((left, right) => right.mtimeMs - left.mtimeMs || left.fullPath.localeCompare(right.fullPath))
	return vsixEntries[0].fullPath
}

async function resolveVsixForInstall(options, builtArtifacts = []) {
	const explicitVsix = options.get("vsix")
	if (explicitVsix) {
		const resolved = resolveCliPath(explicitVsix)
		if (!(await pathExists(resolved))) {
			throw new Error(`VSIX not found: ${resolved}`)
		}
		return resolved
	}

	if (builtArtifacts.length > 0) {
		return builtArtifacts.at(-1)
	}

	return getLatestVsixArtifact()
}

function escapePowerShellLiteral(value) {
	return value.replaceAll("'", "''")
}

async function extractVsix(vsixPath, destinationDir) {
	await recreateDirectory(destinationDir)

	if (isWindows) {
		const command = `Expand-Archive -LiteralPath '${escapePowerShellLiteral(vsixPath)}' -DestinationPath '${escapePowerShellLiteral(destinationDir)}' -Force`
		await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command])
		return
	}

	await run("unzip", ["-q", "-o", vsixPath, "-d", destinationDir])
}

async function resolveInstallTarget(options) {
	const portableDataDir = options.get("portable-data-dir")
	const userDataDirOverride = options.get("user-data-dir")
	const extensionsDirOverride = options.get("extensions-dir")

	if (portableDataDir && (userDataDirOverride || extensionsDirOverride)) {
		throw new Error("Use either --portable-data-dir or --user-data-dir/--extensions-dir, not both")
	}

	if (portableDataDir) {
		const resolvedPortableDataDir = resolveCliPath(portableDataDir)
		const userDataDir = path.join(resolvedPortableDataDir, "user-data")
		const userSettingsDir = path.join(userDataDir, "User")
		return {
			label: `portable VS Code data at ${resolvedPortableDataDir}`,
			userDataDir,
			userSettingsDir,
			settingsFile: path.join(userSettingsDir, "settings.json"),
			extensionsDir: path.join(resolvedPortableDataDir, "extensions"),
		}
	}

	const editorName = options.get("editor") ?? "code"
	const editorTarget = getEditorTarget(editorName)
	const baseHomeDir = ensureHomeDir()
	const userDataDir = userDataDirOverride
		? resolveCliPath(userDataDirOverride)
		: pathForSegments(baseHomeDir, editorTarget.userDataDirByPlatform)
	const extensionsDir = extensionsDirOverride
		? resolveCliPath(extensionsDirOverride)
		: pathForSegments(baseHomeDir, editorTarget.extensionsDirByPlatform)
	const userSettingsDir = path.join(userDataDir, "User")

	return {
		label: editorTarget.label,
		userDataDir,
		userSettingsDir,
		settingsFile: path.join(userSettingsDir, "settings.json"),
		extensionsDir,
	}
}

async function installVsix(vsixPath, installTarget) {
	if (!(await pathExists(vsixPath))) {
		throw new Error(`VSIX not found: ${vsixPath}`)
	}

	if (!(await pathExists(installTarget.userSettingsDir))) {
		throw new Error(
			`Could not find the target VS Code user profile at ${installTarget.userSettingsDir}. Launch ${installTarget.label} once first, or pass --user-data-dir/--portable-data-dir.`,
		)
	}

	await fs.mkdir(installTarget.extensionsDir, { recursive: true })

	const extractDir = await fs.mkdtemp(path.join(buildRoot, "install-"))
	try {
		await extractVsix(vsixPath, extractDir)

		const extensionDir = path.join(extractDir, "extension")
		const manifestPath = path.join(extensionDir, "package.json")
		if (!(await pathExists(manifestPath))) {
			throw new Error(`Extracted VSIX is missing ${manifestPath}`)
		}

		const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
		const publisher = manifest.publisher
		const name = manifest.name
		const version = manifest.version
		if (!publisher || !name || !version) {
			throw new Error(`VSIX manifest ${manifestPath} is missing publisher, name, or version`)
		}

		const extensionId = `${publisher}.${name}`
		const installPrefix = `${extensionId.toLowerCase()}-`
		const extensionEntries = await fs.readdir(installTarget.extensionsDir, { withFileTypes: true })
		for (const entry of extensionEntries) {
			if (!entry.isDirectory()) {
				continue
			}
			if (entry.name.toLowerCase().startsWith(installPrefix)) {
				await fs.rm(path.join(installTarget.extensionsDir, entry.name), { recursive: true, force: true })
			}
		}
		await removeObsoleteExtensionEntries(installTarget.extensionsDir, installPrefix)
		const installedDir = path.join(installTarget.extensionsDir, `${installPrefix}${version}`)
		await fs.rm(installedDir, { recursive: true, force: true })
		await fs.cp(extensionDir, installedDir, { recursive: true })

		log(`Installed ${publisher}.${name}@${version}`)
		log(`  VSIX: ${vsixPath}`)
		log(`  User settings: ${installTarget.settingsFile}`)
		log(`  Extensions dir: ${installTarget.extensionsDir}`)
		log(`  Installed dir: ${installedDir}`)
		log("Restart VS Code to load the updated extension")
	} finally {
		await fs.rm(extractDir, { recursive: true, force: true })
	}
}

async function main() {
	const rawArgs = process.argv.slice(2)
	if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
		usage()
		return
	}

	let command = "build"
	if (rawArgs[0] && !rawArgs[0].startsWith("-")) {
		command = rawArgs.shift()
	}
	if (!["build", "install", "build-install"].includes(command)) {
		usage()
		throw new Error(`Unsupported command: ${command}`)
	}

	const { flags, options } = parseArguments(rawArgs)
	const skipInstall = flags.has("--skip-install")
	const skipCheckTypes = flags.has("--skip-check-types")
	const skipTests = flags.has("--skip-tests")
	const skipVsix = flags.has("--skip-vsix")

	let copiedArtifacts = []

	if (command !== "install") {
		await ensureBuildRoot()
		copiedArtifacts = await runBranchBuild({ skipInstall, skipCheckTypes, skipTests, skipVsix })

		if (command === "build") {
			log("Build complete")
			return
		}
	}

	if (command === "build-install" && skipVsix && !options.has("vsix")) {
		throw new Error("build-install requires a VSIX artifact. Remove --skip-vsix or pass --vsix=<path>.")
	}

	await ensureBuildRoot()
	const installTarget = await resolveInstallTarget(options)
	const vsixPath = await resolveVsixForInstall(options, copiedArtifacts)
	log(`Installing into ${installTarget.label}`)
	await installVsix(vsixPath, installTarget)

	if (command === "build-install") {
		log("Build and install complete")
	} else {
		log("Install complete")
	}
}

main().catch((error) => {
	console.error(`[allquixotic] ${error instanceof Error ? error.message : String(error)}`)
	process.exit(1)
})
