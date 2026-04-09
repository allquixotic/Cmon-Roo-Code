<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# CRC

> Cmon Roo Code — your AI-powered dev team, right in your editor.

CRC is this repository’s downstream sync and rebrand of Roo Code. The name stands for **Cmon Roo Code**: a version of the project that keeps the upstream agentic workflow while preserving the behavior changes and product decisions in this repo.

## CRC Highlights

- Generate, refactor, debug, explain, and plan with built-in Code, Architect, Ask, Debug, and custom modes.
- **YOLO mode in Settings:** adds a dedicated checkbox that forces automatic approval for read, write, MCP, mode-switch, subtask, and execute asks, while still leaving follow-up questions and protected writes under user control.
- **Multiple live conversations:** keeps multiple root tasks alive at the same time and lets you switch between them without replacing the others.
- **Settings import controls:** adds a CRC Settings toggle for startup auto-import plus an `Import Now` action that imports from the configured external JSON settings path on demand.
- **Default editor-pane rendering:** adds a UI preference that makes CRC prefer opening in an editor tab instead of the sidebar, while still keeping the sidebar workflow available.
- **Prompt caching enabled by default where supported:** new and default profiles automatically use prompt caching on supported providers, and the settings UI shows a prominent cost warning when caching is explicitly disabled.
- **Telemetry-free fork behavior:** telemetry, analytics, and error-reporting code have been removed from this repo.
- Keep upstream capabilities such as checkpoints, worktrees, MCP integration, slash-command skills, and broad model/provider support from the latest sync.

## Building and Installing CRC Locally

The `allquixotic/build.js` Bun helper builds the current checkout directly and can install the resulting VSIX into a local VS Code profile using platform-aware defaults.

- Full branch build only:

```sh
bun allquixotic/build.js build
```

- Full branch build and local install:

```sh
bun allquixotic/build.js build-install
```

- Reinstall the latest built artifact without rebuilding:

```sh
bun allquixotic/build.js install
```

By default the installer targets the standard VS Code user profile for the current platform, probes the corresponding user-data directory, and installs into the matching extensions directory. You can override the defaults when needed:

```sh
bun allquixotic/build.js install --editor=code-insiders
bun allquixotic/build.js install --user-data-dir=/path/to/Code --extensions-dir=/path/to/extensions
bun allquixotic/build.js install --portable-data-dir=/path/to/code-portable-data
```

Built VSIX artifacts are copied to `allquixotic/build/artifacts/`. After `install` or `build-install`, restart VS Code to load the updated extension.

## What's New in v3.52.0

- Add Poe as an AI provider so you can access Poe models directly in CRC.
- Improve the xAI provider with a Responses API migration, reusable transform utilities, and updated Grok-4.20 defaults.
- Fix MiniMax model listings and context window handling for more reliable setup.

<details>
  <summary>🌐 Available languages</summary>

- [English](README.md)
- [Català](locales/ca/README.md)
- [Deutsch](locales/de/README.md)
- [Español](locales/es/README.md)
- [Français](locales/fr/README.md)
- [हिंदी](locales/hi/README.md)
- [Bahasa Indonesia](locales/id/README.md)
- [Italiano](locales/it/README.md)
- [日本語](locales/ja/README.md)
- [한국어](locales/ko/README.md)
- [Nederlands](locales/nl/README.md)
- [Polski](locales/pl/README.md)
- [Português (BR)](locales/pt-BR/README.md)
- [Русский](locales/ru/README.md)
- [Türkçe](locales/tr/README.md)
- [Tiếng Việt](locales/vi/README.md)
- [简体中文](locales/zh-CN/README.md)
- [繁體中文](locales/zh-TW/README.md)
- ...
    </details>

---

## What Can CRC Do For You?

- Generate code from natural language descriptions and specs
- Adapt with Modes: Code, Architect, Ask, Debug, and Custom Modes
- Refactor and debug existing code
- Write and update documentation
- Answer questions about your codebase
- Automate repetitive tasks
- Utilize MCP servers

## Modes

CRC adapts to how you work:

- Code Mode: everyday coding, edits, and file ops
- Architect Mode: plan systems, specs, and migrations
- Ask Mode: fast answers, explanations, and docs
- Debug Mode: trace issues, add logs, isolate root causes
- Custom Modes: build specialized modes for your team or workflow

Learn more: [Using Modes](https://docs.roocode.com/basic-usage/using-modes) • [Custom Modes](https://docs.roocode.com/advanced-usage/custom-modes)

## Resources

- **[Documentation](https://docs.roocode.com):** The official guide to installing, configuring, and mastering CRC.
- **[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline):** Install the current published extension build.
- **[GitHub Issues](https://github.com/RooCodeInc/Roo-Code/issues):** Report bugs and track development.
- **[Feature Requests](https://github.com/RooCodeInc/Roo-Code/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop):** Have an idea? Share it with the developers.
- **[GitHub Discussions](https://github.com/RooCodeInc/Roo-Code/discussions):** Ask questions and compare notes with other users.

---

## Local Setup & Development

1. **Clone** the repo:

```sh
git clone <your-crc-fork-url>
```

2. **Install dependencies**:

```sh
pnpm install
```

3. **Run the extension**:

There are several ways to run the CRC extension:

### Development Mode (F5)

For active development, use VS Code's built-in debugging:

Press `F5` (or go to **Run** → **Start Debugging**) in VS Code. This will open a new VS Code window with the CRC extension running.

- Changes to the webview will appear immediately.
- Changes to the core extension will also hot reload automatically.

### Automated VSIX Installation

To build and install the extension as a VSIX package directly into VS Code:

```sh
pnpm install:vsix [-y] [--editor=<command>]
```

This command will:

- Ask which editor command to use (code/cursor/code-insiders) - defaults to `code`
- Uninstall any existing version of the extension.
- Build the latest VSIX package.
- Install the newly built VSIX.
- Prompt you to restart VS Code for changes to take effect.

Options:

- `-y`: Skip all confirmation prompts and use defaults
- `--editor=<command>`: Specify the editor command (for example, `--editor=cursor` or `--editor=code-insiders`)

### Manual VSIX Installation

If you prefer to install the VSIX package manually:

1. First, build the VSIX package:
    ```sh
    pnpm vsix
    ```
2. A `.vsix` file will be generated in the `bin/` directory (for example, `bin/roo-cline-<version>.vsix`).
3. Install it manually using the VS Code CLI:
    ```sh
    code --install-extension bin/roo-cline-<version>.vsix
    ```

---

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing. Check `CHANGELOG.md` for release notes.

---

## Disclaimer

**Please note** that CRC and its contributors do **not** make any representations or warranties regarding any code, models, or other tools provided or made available in connection with CRC, any associated third-party tools, or any resulting outputs. You assume **all risks** associated with the use of any such tools or outputs; such tools are provided on an **"AS IS"** and **"AS AVAILABLE"** basis. Such risks may include, without limitation, intellectual property infringement, cyber vulnerabilities or attacks, bias, inaccuracies, errors, defects, viruses, downtime, property loss or damage, and/or personal injury. You are solely responsible for your use of any such tools or outputs, including the legality, appropriateness, and results thereof.

---

## Contributing

We love community contributions. Get started by reading [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[Apache 2.0](./LICENSE)

---

**Enjoy CRC!** Whether you keep it on a short leash or let it roam autonomously, we can’t wait to see what you build. If you have questions or feature ideas, open an issue or start a discussion on GitHub. Happy coding!
