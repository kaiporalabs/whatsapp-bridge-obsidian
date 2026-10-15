# Changelog

## 0.9.1

- Publishes `main.js`, `manifest.json` and `styles.css` as direct GitHub Release assets required by Obsidian.
- Removes unsupported ZIP and checksum assets from the release workflow.
- Removes a redundant type assertion and an unused SQLite string helper.
- Validates SQLite JSON rows as unknown objects before assigning them to the internal row type.
- Makes settings callbacks return `void` explicitly to satisfy Obsidian's lint rules without changing UI behavior.

## 0.9.0

- Adds opt-in import for images, videos, documents and stickers from wacli and the local macOS WhatsApp cache.
- Adds separate settings for each media category, a configurable media root, and a per-file size limit up to 2048 MB. All new categories remain disabled during upgrades.
- Embeds images, videos and stickers in conversation notes and adds documents as named links.
- Adds `Media Index.md` with stable keys, conversation, sender, timestamp, type, file path and processing status while preserving the existing audio index and transcription workflow.
- Extends WhatsApp Local Sync compatibility with an audio-and-media-only historical scan that never sends old text through the note importer.
- Maps current macOS database message types and file extensions, and preserves document titles where available.
- Adds real-cache validation and regression tests for type selection, paths, indexes, embeds and idempotency.

## 0.8.0

- Adds an explicit WhatsApp Local Sync adoption flow that reads its `data.json` from the current vault and copies validated note paths and per-conversation `Z_PK` cursors.
- Continues new text in the existing WhatsApp Local Sync notes and format without reimporting text at or below the adopted cursor.
- Preserves and updates the existing `_Conversation Index.md` layout while keeping the old plugin data untouched.
- Adds a separate historical audio action that queries audio rows only, copies files still present in the WhatsApp Desktop cache, appends indexed audio blocks to the original conversation notes, and never runs the text import path.
- Keeps adoption reversible: switching back to the Bridge structure retains the copied legacy state for later use.
- Adds regression coverage for cursor continuation, existing note paths, historical audio isolation, and invalid legacy state.

## 0.7.0

- Adds a message-source selector while preserving wacli as the upgrade-safe default.
- Adds read-only access to the WhatsApp Desktop `ChatStorage.sqlite` database on macOS, with automatic standard-path detection.
- Imports text and audio metadata from the local database using the same note format, deduplication markers and account folders as the wacli source.
- Reads audio already present in the WhatsApp Desktop cache and keeps the existing audio index and transcription pipeline. Missing cached files are reported per item without stopping message import.
- Disables wacli pairing, collector and logout actions while the local database source is selected.
- Records the storage differences with WhatsApp Local Sync as groundwork for a later guided note migration.

## 0.6.0

- Adds macOS local transcription using whisper.cpp with FFmpeg conversion to 16 kHz mono PCM WAV.
- Adds a bilingual setup window for executables and GGML models, including Browse, drag-and-drop, pasted paths, Homebrew path discovery and validation.
- Keeps Windows Faster-Whisper-XXL settings separate; existing OpenAI settings and reprocessing behavior are preserved.
- Supports cancellation during conversion and transcription and cleans temporary audio and output after success or failure.
- Adds automated Mac pipeline regression tests and a macOS testing guide. Native FFmpeg conversion was checked; full whisper.cpp and Obsidian UI testing remain pending.

## 0.5.1

- Fixes Electron loading for file path resolution: uses Obsidian's CommonJS module loader instead of native dynamic import.
- Applies to both Browse and file drops in the wacli and local Whisper setup windows; preserves legacy file paths and manual path entry.
- Adds regression coverage for files without the legacy `path` field and verifies the bundled Electron import. Native Windows verification remains required.

## 0.5.0

- Adds optional local Faster-Whisper-XXL transcription on Windows alongside OpenAI, preserving existing settings and defaults.
- Adds external download guidance, executable browsing and drag-and-drop validation; the plugin does not install the dependency.
- Adds local model selection and explains first-use model downloads, CPU processing and OpenAI upload costs.
- Adds confirmed pending/all reprocessing of already indexed downloads, independent of the import history window and automatic transcription setting.
- Preserves successful transcripts on retry failures, saves progress per file, and supports stopping local transcription.
- Fixes literal dollar sequences in transcript replacements and adds regression tests for local execution, cleanup, cancellation and legacy indexes.
- Native Faster-Whisper-XXL execution and the picker still require testing in Windows Obsidian.

## 0.4.4

- Accepts quoted paths copied from Windows Explorer and saves the normalized executable path.
- Adds a Browse button for selecting the extracted wacli executable; rejects other filenames and archives.
- Handles file drops before the input's default handler, supports text path drops, and shows validation progress.

## 0.4.3

- Requires Obsidian 1.13.1 to match the APIs used by settings and SecretStorage.
- Migrates all settings and connection controls to declarative definitions; replaces deprecated destructive buttons.
- Validates saved settings and collector JSON before using their fields.
- Handles drag-and-drop promises explicitly and releases connection listeners when settings rows are removed.

## 0.4.2

- Regenerates the npm lockfile from a clean environment, including cross-platform optional dependencies.
- Uses Obsidian settings headings, searchable setting definitions, and requestUrl for multipart transcription requests.
- Uses window timers, replaces the Electron require call with a dynamic import, and cleans up regular expressions and unused imports.


## 0.4.1

- Substitui instalação automática por download externo guiado e seleção do executável, sem mover ou instalar arquivos.
- Preserva sessões e caminhos anteriores; valida wacli 0.19.0 antes de salvar a seleção.
- Corrige Obsidian mínimo para 1.8.7 e mantém transcrição condicionada à versão 1.11.4.
- Inclui licenças no bundle e documenta contas, custos opcionais e arquivos externos.

## 0.4.0

- Adiciona download opt-in de mensagens de áudio pelo wacli em modo somente leitura.
- Incorpora os áudios nas notas das conversas usando o player do Obsidian.
- Mantém `Audio Index.md` por conta, com conversa, chat ID, remetente, horário, arquivo e estado de processamento.
- Adiciona transcrição opt-in com OpenAI, chave no SecretStorage do Obsidian e idioma configurável.
- Mantém download e transcrição desativados durante atualizações e instalações novas.

## 0.3.1

- Adiciona logout com confirmação, revogação do dispositivo vinculado e remoção das credenciais locais.
- Preserva as notas importadas e o banco local de mensagens durante o logout.
- Detecta uma instalação compatível do wacli 0.19.0 no PATH antes de oferecer o download gerenciado.
- Usa inglês como idioma padrão e acompanha o português configurado no Obsidian.
- Sugere `WhatsApp` como destino em instalações novas e preserva destinos existentes durante atualizações.
- Permite configurar separadamente as subpastas de grupos e conversas pessoais.

## 0.2.0

- Adiciona instalação gerenciada do wacli, pareamento por QR code e controle do coletor nas configurações.
- Importa mensagens para notas Markdown com deduplicação e caminhos estáveis.
