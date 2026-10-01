# WhatsApp Bridge

An independent Obsidian desktop plugin, currently in beta **0.4.4**. Imports messages and optional audio attachments from the local **wacli** store into Markdown notes. It does not use the protected Microsoft Store databases or depend on the WhatsApp Local Sync plugin.

## Requirements

- Obsidian desktop **1.13.1 or newer** on Windows, macOS, or Linux.
- A WhatsApp account and **wacli 0.19.0**, installed separately.
- Optional cloud transcription requires Obsidian **1.13.1 or newer**, an OpenAI API account and key, and usage-based charges from the provider. Importing messages does not require OpenAI.

## Install the plugin

The ZIP generated in `dist` contains a `whatsapp-bridge` folder with `main.js`, `manifest.json`, and `styles.css`. Copy this folder into `<vault>/.obsidian/plugins/` and enable the plugin under **Community plugins**. Node.js is not required to use the packaged plugin.

See [TESTE-WINDOWS.md](TESTE-WINDOWS.md) for the Windows installation and testing guide, currently available in Portuguese.

## Set up the connector

1. Open the plugin settings and select **Set up connector**.
2. In the popup, open the official [wacli 0.19.0 release page](https://github.com/openclaw/wacli/releases/tag/v0.19.0). Download the archive indicated for your platform and save it in **Downloads**.
3. Extract the archive. On Windows, right-click it and select **Extract All**.
4. Click **Browse…** and select the extracted `wacli.exe` (Windows) or `wacli` (macOS/Linux) executable. You can also drag the file into the popup or paste its full path, including paths copied with quotes from Windows Explorer.
5. Select **Validate and use executable**. The popup stays open during the download and displays the validation result.
6. Close the popup and select **Show QR code**. On your phone, open WhatsApp → **Linked devices** → **Link a device**, then scan the code.

Validation runs `wacli --version`; this flow accepts only version 0.19.0. The plugin does not download, install, move, change permissions on, or update dependencies. Keep the executable in the selected location. If your operating system blocks execution, follow the official wacli instructions for your platform.

The plugin also detects a compatible wacli installation in PATH when no executable is configured. Existing executable paths and sessions are preserved during upgrades.

## Settings and synchronization

The interface follows the Obsidian language setting, with English as the default and Portuguese translations available. New installations suggest `WhatsApp` as the destination folder; upgrades preserve the existing destination. Group and personal conversation subfolders are configurable and retain the defaults `Grupos` and `Pessoais`.

The **Start** and **Stop** buttons manage the collector process. **Start collector when Obsidian opens** is disabled by default. Disabling the plugin or closing Obsidian stops its collector. QR codes are generated locally, refreshed from wacli events, and never saved or logged. Pairing expires after three minutes without a connection.

To unlink the account, select **Disconnect and remove credentials**. The action asks for confirmation and runs `wacli auth logout`, preserving imported notes and the local message database.

## Audio and transcription

Audio downloads are disabled by default. When enabled, the plugin retrieves each audio message using `media download --read-only`, writes the file through the vault API, and embeds a player in the conversation note. The default audio folder is `Media/Audio` inside the account folder.

Each account has a stable `Audio Index.md` file. Entries record the conversation, chat ID, sender, sent time, file path, processing status, and transcript when available. A key combining the account, conversation, and message ID allows subsequent imports to update the same entry without duplicating it.

Automatic transcription is disabled by default and requires audio downloads to be enabled. Choose a **Transcription provider**:

- **OpenAI** (the existing default): uses `gpt-4o-mini-transcribe`. Select an API key through Obsidian SecretStorage; it is not stored in `data.json`. Audio is uploaded to OpenAI and API charges may apply.
- **Faster-Whisper-XXL (Windows)**: runs locally on CPU using INT8, without uploading audio to OpenAI. Select **Set up local Whisper**, open the official download page, save the Windows x86-64 Faster-Whisper-XXL archive in Downloads, and extract the **entire** package with a compatible extractor such as 7-Zip. Keep all extracted files together. Browse for, drag, or paste the path to `faster-whisper-xxl.exe`, then validate. Validation executes `--help` and checks the required command options. The plugin does not download, install, move, or update the program.

The local program can download missing models from Hugging Face into its `_models` directory on first use. This requires internet access, disk space and time. The default is `medium`; smaller models reduce memory use, while larger models require more resources. Each local transcription has a one-hour timeout. The integration currently supports Windows only, even though upstream offers other builds. See the [upstream instructions](https://github.com/Purfview/whisper-standalone-win). Model quality and CPU performance should be tested on the target computer.

Both providers support automatic language detection, Portuguese, and English. Upgrades retain OpenAI as the default, existing settings, downloaded audio, and transcripts.

**Transcribe pending** processes downloaded files in the current account's `Audio Index.md` that have no successful transcript. **Reprocess all** also replaces successful transcripts, but only after a new transcription succeeds. Both buttons ask for confirmation, use the selected provider, and work even with automatic download/transcription disabled. They read the existing index regardless of the history window; they do not query WhatsApp or download audio again. Files absent from the index are not discovered automatically. Keep the configured account and destination folder consistent with the index you want to process.

Results are saved to the index and matching message blocks without duplicating messages. A failed retry preserves the previous transcript. Missing files and processing errors appear in the index. **Stop processing** interrupts the local process; an active OpenAI request must finish before cancellation takes effect. Already completed results remain saved. The maximum audio size applies to reprocessing too.

## Features

- Queries `messages list` using `execFile`, without a shell, with `--read-only` and `WACLI_READONLY=1`.
- Imports text and media indicators; optionally downloads and transcribes audio; filters group and personal conversations; skips statuses, broadcasts, and channels.
- Creates one note per conversation with a stable path derived from its JID, under the selected destination and account identifier.
- Deduplicates by account, JID, and message ID using HTML markers in notes, without relying on a separately saved cursor.
- Rechecks the selected history window for delayed or backfilled messages. Older messages discovered later are appended with explicit UTC timestamps.
- Supports periodic imports while Obsidian is open, defaulting to one minute for new installations. Existing settings are preserved during upgrades.
- Tests local reads without writing notes; malformed responses are not treated as empty message lists.

## Beta limitations

The plugin does not import images, videos, or documents, update edited message text, or remove imported messages after deletion in WhatsApp. Notes are an import archive rather than a complete mirror of later changes. Triage, calendar integration, and message sending are not included.

The default history window is seven days, not the entire account history. Queries are limited to 10,000 rows and 32 MB of output. Reaching the row limit aborts the import before notes are written; reduce the history window and try again. Lossless pagination is a planned improvement.

Use a different account identifier when switching accounts: the plugin does not infer account identity from credentials. Changing the destination folder or account identifier creates a different destination. Keep the `wa-bridge` markers in notes to prevent duplicates. Do not run simultaneous imports into the same destination from different computers. A deleted note can only be rebuilt from messages available within the current history window.

## Accounts, network access, and privacy

wacli is an independent, unofficial connector. Your browser accesses GitHub to download it. wacli connects to WhatsApp for pairing, synchronization, and optional audio downloads. Stop external collectors before starting the plugin's collector for the same session.

Credentials and the local database are kept outside the vault to avoid syncing them with notes. Default locations are `~/.wacli` on macOS/Windows and `~/.local/state/wacli` on Linux, or the path selected in settings. Earlier versions may use `WhatsAppBridge/accounts` under LocalAppData on Windows or Library/Application Support on macOS, or `whatsapp-bridge/accounts` under XDG_DATA_HOME or `~/.local/share` on Linux. Existing paths are preserved.

Audio files pass through a system temporary directory before being copied into the vault; the plugin attempts to remove that directory after completion or failure. Notes and audio files in the vault are readable and subject to vault synchronization and access by other plugins. The plugin does not implement telemetry. Do not include credentials, databases, private audio, or real conversation notes in issue reports.

Optional OpenAI transcription sends audio to the API and may incur usage charges. Review the provider's terms and privacy information before enabling it. The API key remains in SecretStorage. Local transcription instead copies audio into a temporary directory and executes the selected Faster-Whisper-XXL binary without a shell; temporary audio and output are removed after completion or failure. The external program manages its own model downloads and cache. Message import works without either transcription provider.

## Development

Requires Node.js 20+ and npm. Run `npm ci`, then `npm run build`, `npm test`, or `npm run package`. The package command generates a ZIP and SHA-256 checksum in `dist`. TypeScript source is in `src`; synthetic tests are in `tests`.

Tests cover imports, external executable validation, audio indexing, QR events, process ownership, and revocation handling. They do not replace real account pairing or testing the drag-and-drop interface in Obsidian.

The message contract consulted on September 29, 2026 uses JSON `data.messages` with `ChatJID`, `MsgID`, `Timestamp`, `FromMe`, `ChatName`, `SenderName`, `SenderJID`, `Text`, and `DisplayText`. References: [message CLI](https://wacli.sh/messages.html), [integrations](https://wacli.sh/integrations.html), [query implementation](https://github.com/openclaw/wacli/blob/main/cmd/wacli/messages_read.go), and [types](https://github.com/openclaw/wacli/blob/main/internal/store/types.go). Compatibility must also be validated with real binaries and accounts.

## Project status and licensing

This project is distributed as a beta through GitHub. CI builds and tests on Windows and macOS. Additional real-world testing is needed before submission to the Obsidian community directory, alongside the pagination and reconciliation improvements described above.

Licensed under [MIT](LICENSE). No code from the earlier plugin was copied. Bundled dependency notices are included in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) and embedded in `main.js`.

## Connector references

- [Authentication, QR format, and events](https://wacli.sh/auth.html).
- [wacli 0.19.0 release](https://github.com/openclaw/wacli/releases/tag/v0.19.0).
- [NDJSON events](https://github.com/openclaw/wacli/blob/main/internal/out/events.go).
- [Connection states](https://github.com/openclaw/wacli/blob/main/internal/app/sync_events.go).
