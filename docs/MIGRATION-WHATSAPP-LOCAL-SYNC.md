# Continue a WhatsApp Local Sync archive

WhatsApp Bridge can adopt the state of WhatsApp Local Sync 1.0.x without moving or rewriting its existing conversation notes.

## Before adoption

1. Run WhatsApp Local Sync one final time if possible.
2. Disable WhatsApp Local Sync so both plugins cannot append to the same notes.
3. Keep `.obsidian/plugins/whatsapp-local-sync/data.json` in the vault until adoption succeeds. Bridge reads this file but does not modify it.
4. Back up the vault as usual before testing a new plugin version.

## Adopt the archive

In WhatsApp Bridge settings, select **Adopt WhatsApp Local Sync**. Bridge validates and copies:

- the root, group and personal folder names;
- every conversation's exact `notePath`;
- every conversation's `lastRowPk`, last date heading, activity time and message count;
- the database override, enabled conversation types, history window and sender label.

Adoption selects the local macOS database source automatically. Existing text is not imported during adoption. On subsequent imports, a text row is appended only when its `ZWAMESSAGE.Z_PK` is greater than the copied cursor for that conversation. New conversations use the original WhatsApp Local Sync filename and frontmatter format. `_Conversation Index.md` continues to use the original paths and is refreshed after successful imports.

Bridge stores its own copy of the adopted state. The original plugin's `data.json` remains unchanged. **Use Bridge structure** switches back without deleting the copied state.

## Add earlier media

Enable the desired audio, image, video, document or sticker categories, then select **Import past media**. This operation queries only rows that have a local media path. It does not read historical text into the note writer and does not reset text cursors.

WhatsApp may retain metadata after removing the actual cached file. Bridge imports selected rows that still have a readable cached file and records them in `Audio Index.md` or `Media Index.md`. Each entry links to the original conversation note and records the chat, sender, timestamp, file and status; audio can also include a transcript.

Audio players and transcripts are appended to **Imported audio history**. Other media is appended to **Imported media history**; images, videos and stickers are embedded, while documents use named links. Stable message keys make retries idempotent. Files use the adopted root plus their configured media folders, without adding Bridge's account-directory layer.

Cloud or local transcription remains optional and follows the same privacy and provider settings as ordinary Bridge audio imports.

## Format differences retained intentionally

Compatibility mode keeps the WhatsApp Local Sync note names, frontmatter, local-time message lines, daily headings and conversation index. Bridge's normal storage mode continues to use its own SHA-256 note paths, UTC blocks and per-message HTML markers. The two layouts remain selectable rather than silently mixing formats.
