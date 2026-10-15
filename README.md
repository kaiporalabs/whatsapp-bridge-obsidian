# WhatsApp Bridge

An independent Obsidian desktop plugin, currently in beta **0.9.0**. Imports messages and optional media into Markdown notes from **wacli** or the local WhatsApp Desktop database on macOS. It can adopt the note paths and incremental state created by WhatsApp Local Sync.

## Requirements

- Obsidian desktop **1.13.1 or newer** on Windows, macOS, or Linux.
- A WhatsApp account and either WhatsApp Desktop on macOS or **wacli 0.19.0**, installed separately.
- Optional cloud transcription requires Obsidian **1.13.1 or newer**, an OpenAI API account and key, and usage-based charges from the provider. Importing messages does not require OpenAI.

## Install the plugin

The ZIP generated in `dist` contains a `whatsapp-bridge` folder with `main.js`, `manifest.json`, and `styles.css`. Copy this folder into `<vault>/.obsidian/plugins/` and enable the plugin under **Community plugins**. Node.js is not required to use the packaged plugin.

See [TESTE-WINDOWS.md](TESTE-WINDOWS.md) for the Windows installation and testing guide, currently available in Portuguese.

## Choose the message source

The default source remains **wacli**, including after upgrades. It provides a separate synchronized session and is the supported source on Windows and Linux.

On macOS, select **WhatsApp local database** to read the `ChatStorage.sqlite` maintained by the installed WhatsApp Desktop application. The standard Group Container path is detected automatically; an advanced absolute-path override is available. The plugin invokes the system SQLite reader with read-only mode and never authenticates, starts a collector or removes credentials in this mode. Open WhatsApp Desktop periodically so its local history and media cache remain current.

Direct database access currently supports macOS only. The Microsoft Store databases observed on Windows use a different non-SQLite/session-segregated format, so Windows continues to use wacli.

See [docs/MIGRATION-WHATSAPP-LOCAL-SYNC.md](docs/MIGRATION-WHATSAPP-LOCAL-SYNC.md) before replacing WhatsApp Local Sync. The adoption action copies its validated per-chat cursors and existing note paths before Bridge continues the archive.

## Set up the wacli connector

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

## Media

Images, videos, documents and stickers have independent opt-in switches and remain disabled after installation or upgrade. The default media root is `Media`; files are separated into `Images`, `Videos`, `Documents` and `Stickers`. A configurable per-file limit protects the vault from unexpectedly large downloads.

Images, videos and stickers are embedded in their conversation note. Documents are added as named links. `Media Index.md` records the media type, conversation, chat ID, sender, sent time, file path and status. Stable keys based on account, conversation and message ID make repeated imports idempotent.

With wacli, the same read-only media download command is used for each enabled type. With the local macOS database, only files still present in WhatsApp Desktop's `Message/Media` cache can be copied. Database metadata does not guarantee that WhatsApp retained the underlying file.

## Audio and transcription

Audio downloads are disabled by default. With wacli, the plugin retrieves each audio message using `media download --read-only`. With the local macOS database, it copies audio that is still present in WhatsApp Desktop's `Message/Media` cache. Audio metadata can remain in the database after WhatsApp removes the cached file; those items are marked as failed in the index and may be retried later or obtained through wacli. Successful files are written through the vault API and embedded in the conversation note. The default audio folder is `Media/Audio` inside the account folder.

Each account has a stable `Audio Index.md` file. Entries record the conversation, chat ID, sender, sent time, file path, processing status, and transcript when available. A key combining the account, conversation, and message ID allows subsequent imports to update the same entry without duplicating it.

In WhatsApp Local Sync compatibility mode, **Import past media** performs a separate media-only database query. It does not send historical text through the note importer. Enabled cached files are placed under the adopted root folder, linked or embedded in the original conversation notes, and recorded in `Audio Index.md` or `Media Index.md`. Repeating the action is safe because indexes and note blocks use stable message keys.

Automatic transcription is disabled by default and requires audio downloads to be enabled. Choose a **Transcription provider**:

- **OpenAI** (the existing default): uses `gpt-4o-mini-transcribe`. Select an API key through Obsidian SecretStorage; it is not stored in `data.json`. Audio is uploaded to OpenAI and API charges may apply.
- **Faster-Whisper-XXL (Windows)**: runs locally on CPU using INT8, without uploading audio to OpenAI. Select **Set up local Whisper**, open the official download page, save the Windows x86-64 Faster-Whisper-XXL archive in Downloads, and extract the **entire** package with a compatible extractor such as 7-Zip. Keep all extracted files together. Browse for, drag, or paste the path to `faster-whisper-xxl.exe`, then validate. Validation executes `--help` and checks the required command options. The plugin does not download, install, move, or update the program.

On Windows, the local program can download missing models from Hugging Face into its `_models` directory on first use. This requires internet access, disk space and time. The default is `medium`; smaller models reduce memory use, while larger models require more resources. Each local transcription has a one-hour timeout. See the [upstream instructions](https://github.com/Purfview/whisper-standalone-win). Model quality and CPU performance should be tested on the target computer.

On **macOS**, Local uses **whisper.cpp with FFmpeg**, separately from the Windows provider. Install both outside Obsidian (Homebrew users can run `brew install whisper.cpp ffmpeg` in Terminal). Download a multilingual GGML model such as `ggml-small.bin` from the [model repository](https://huggingface.co/ggerganov/whisper.cpp/tree/main) into Downloads. In **Set up local Whisper**, browse, drag or paste the paths to `whisper-cli`, `ffmpeg` and the model. **Find Homebrew executables** checks `/opt/homebrew/bin` and `/usr/local/bin`. In the macOS picker, Cmd+Shift+G opens these folders directly. Keep Homebrew libraries and downloaded models in place.

**Validate and save** runs `whisper-cli --help`, `ffmpeg -version` and checks the model header; it does not perform a full transcription. FFmpeg converts each audio into temporary 16-bit, mono, 16 kHz WAV before whisper.cpp runs. Conversion has a five-minute timeout; transcription has a one-hour timeout. Metal acceleration is left enabled where supported by the hardware/build; Intel compatibility depends on the installed binaries. The plugin downloads no model and uploads no audio for this provider. Temporary input, WAV and transcript files are removed after completion or failure. Both processes can be cancelled with **Stop processing**. Setup and testing instructions: [macOS test guide](TESTE-MAC.md).

macOS paths are stored separately from Windows paths, so configuring one does not overwrite the other. A model ending in `.en` is English-only; Faster-Whisper models are not interchangeable with whisper.cpp GGML models. Linux local transcription is not implemented.

Both providers support automatic language detection, Portuguese, and English. Upgrades retain OpenAI as the default, existing settings, downloaded audio, and transcripts.

**Transcribe pending** processes downloaded files in the current account's `Audio Index.md` that have no successful transcript. **Reprocess all** also replaces successful transcripts, but only after a new transcription succeeds. Both buttons ask for confirmation, use the selected provider, and work even with automatic download/transcription disabled. They read the existing index regardless of the history window; they do not query WhatsApp or download audio again. Files absent from the index are not discovered automatically. Keep the configured account and destination folder consistent with the index you want to process.

Results are saved to the index and matching message blocks without duplicating messages. A failed retry preserves the previous transcript. Missing files and processing errors appear in the index. **Stop processing** interrupts the local process; an active OpenAI request must finish before cancellation takes effect. Already completed results remain saved. The maximum audio size applies to reprocessing too.

## Features

- Selects wacli or the local macOS WhatsApp Desktop database without changing the generated note format.
- Queries `messages list` using `execFile`, without a shell, with `--read-only` and `WACLI_READONLY=1`; direct mode invokes `/usr/bin/sqlite3` with `-readonly`.
- Imports text and media indicators; optionally downloads images, videos, documents, stickers and audio; optionally transcribes audio; filters group and personal conversations; skips statuses, broadcasts, and channels.
- Creates one note per conversation with a stable path derived from its JID, under the selected destination and account identifier.
- Deduplicates by account, JID, and message ID using HTML markers in notes, without relying on a separately saved cursor.
- Rechecks the selected history window for delayed or backfilled messages. Older messages discovered later are appended with explicit UTC timestamps.
- Supports periodic imports while Obsidian is open, defaulting to one minute for new installations. Existing settings are preserved during upgrades.
- Tests local reads without writing notes; malformed responses are not treated as empty message lists.

## Beta limitations

The plugin does not update edited message text or remove imported messages or files after deletion in WhatsApp. Media absent from the local WhatsApp cache cannot be recovered by direct database mode; wacli may still download it from the linked account. Notes are an import archive rather than a complete mirror of later changes. Triage, calendar integration, and message sending are not included.

The default history window is seven days, not the entire account history. Queries are limited to 10,000 rows and 32 MB of output. Reaching the row limit aborts the import before notes are written; reduce the history window and try again. Lossless pagination is a planned improvement.

Use a different account identifier when switching accounts: the plugin does not infer account identity from credentials. Changing the destination folder or account identifier creates a different destination. Keep the `wa-bridge` markers in notes to prevent duplicates. Do not run simultaneous imports into the same destination from different computers. A deleted note can only be rebuilt from messages available within the current history window.

## Accounts, network access, and privacy

wacli is an independent, unofficial connector. Your browser accesses GitHub to download it. wacli connects to WhatsApp for pairing, synchronization, and optional audio downloads. Stop external collectors before starting the plugin's collector for the same session.

Credentials and source databases are kept outside the vault to avoid syncing them with notes. The macOS direct source reads WhatsApp's Group Container. Default wacli locations are `~/.wacli` on macOS/Windows and `~/.local/state/wacli` on Linux, or the path selected in settings. Earlier versions may use `WhatsAppBridge/accounts` under LocalAppData on Windows or Library/Application Support on macOS, or `whatsapp-bridge/accounts` under XDG_DATA_HOME or `~/.local/share` on Linux. Existing paths are preserved.

Audio files pass through a system temporary directory before being copied into the vault; the plugin attempts to remove that directory after completion or failure. Notes and audio files in the vault are readable and subject to vault synchronization and access by other plugins. The plugin does not implement telemetry. Do not include credentials, databases, private audio, or real conversation notes in issue reports.

Optional OpenAI transcription sends audio to the API and may incur usage charges. Review the provider's terms and privacy information before enabling it. The API key remains in SecretStorage. Local transcription instead copies audio into a temporary directory and executes the selected local tools without a shell; temporary audio and output are removed after completion or failure. On Windows, Faster-Whisper-XXL manages its own model downloads and cache. On macOS, the user supplies an existing GGML model. Message import works without either transcription provider.

## Development

Requires Node.js 20+ and npm. Run `npm ci`, then `npm run build`, `npm test`, or `npm run package`. The package command generates a ZIP and SHA-256 checksum in `dist`. TypeScript source is in `src`; synthetic tests are in `tests`.

Tests cover imports, external executable validation, audio indexing, QR events, process ownership, and revocation handling. They do not replace real account pairing or testing the drag-and-drop interface in Obsidian.

The message contract consulted on September 29, 2026 uses JSON `data.messages` with `ChatJID`, `MsgID`, `Timestamp`, `FromMe`, `ChatName`, `SenderName`, `SenderJID`, `Text`, and `DisplayText`. References: [message CLI](https://wacli.sh/messages.html), [integrations](https://wacli.sh/integrations.html), [query implementation](https://github.com/openclaw/wacli/blob/main/cmd/wacli/messages_read.go), and [types](https://github.com/openclaw/wacli/blob/main/internal/store/types.go). Compatibility must also be validated with real binaries and accounts.

## Project status and licensing

This project is distributed as a beta through GitHub. CI builds and tests on Windows and macOS. Additional real-world testing is needed before submission to the Obsidian community directory, alongside the pagination and reconciliation improvements described above.

Licensed under [MIT](LICENSE). Bundled dependency notices are included in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) and embedded in `main.js`.

## Connector references

- [Authentication, QR format, and events](https://wacli.sh/auth.html).
- [wacli 0.19.0 release](https://github.com/openclaw/wacli/releases/tag/v0.19.0).
- [NDJSON events](https://github.com/openclaw/wacli/blob/main/internal/out/events.go).
- [Connection states](https://github.com/openclaw/wacli/blob/main/internal/app/sync_events.go).
