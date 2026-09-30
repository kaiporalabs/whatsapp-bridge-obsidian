# Changelog

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
