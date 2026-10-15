# WhatsApp Bridge 0.9.0 — teste no macOS

Requer Obsidian 1.13.1 ou superior. Use um vault de teste e um áudio sem dados privados. Não é necessário instalar nada no Mac de quem apenas desenvolve ou envia o pacote.

## Atualizar

Desative o plugin, extraia `whatsapp-bridge-0.9.0.zip` e substitua apenas `main.js`, `manifest.json` e `styles.css` em `<vault>/.obsidian/plugins/whatsapp-bridge/`. Preserve `data.json`, as notas, mídias, índices e credenciais. Reative o plugin e confirme a versão 0.9.0.

## Banco local do WhatsApp

1. Em **Fonte das mensagens**, selecione **Banco local do WhatsApp (macOS)**.
2. Deixe **Caminho do ChatStorage.sqlite** vazio para usar a detecção automática.
3. Clique em **Testar leitura**. O teste não grava notas.
4. Habilite download de áudio e importe uma janela curta. Confirme que áudios ainda presentes no cache aparecem no vault e no `Audio Index.md`.
5. Confirme que pareamento, coletor e logout do wacli ficam desabilitados neste modo. Volte para **wacli** e verifique que a sessão e os caminhos anteriores foram preservados.

## Continuidade do WhatsApp Local Sync

1. Faça uma cópia do vault, sincronize uma última vez e desative o WhatsApp Local Sync. Não apague ainda sua pasta em `.obsidian/plugins`.
2. Em **Compatibilidade de armazenamento**, clique em **Adotar WhatsApp Local Sync**. Confira a quantidade de conversas adotadas.
3. Use **Testar leitura** e depois **Importar agora**. Verifique que uma nota antiga recebe apenas mensagens posteriores ao último cursor e mantém nome, frontmatter, cabeçalhos diários e caminho.
4. Ative áudio, imagens, vídeos, documentos e figurinhas conforme desejado e clique em **Importar mídias anteriores**. Confirme que nenhum texto antigo é duplicado, que as mídias aparecem nas seções históricas das notas originais e que os índices referenciam conversa, remetente e horário.
5. Repita a importação de mídia e confirme que arquivos, blocos e entradas não são duplicados.

## Outras mídias

1. Teste cada opção separadamente: imagens, vídeos, documentos e figurinhas.
2. Confirme as subpastas `Media/Images`, `Media/Videos`, `Media/Documents` e `Media/Stickers`.
3. Confirme que imagens, vídeos e figurinhas usam embed; documentos devem aparecer como links com nome.
4. Confira os mesmos registros em `Media Index.md` e repita a importação para validar a deduplicação.

## Preparar as ferramentas

1. Instale whisper.cpp e FFmpeg fora do Obsidian. Se já usa Homebrew, execute no Terminal: `brew install whisper.cpp ffmpeg`. O plugin não instala ferramentas nem altera permissões. As instruções oficiais ficam em https://github.com/ggml-org/whisper.cpp e https://ffmpeg.org/download.html.
2. Abra https://huggingface.co/ggerganov/whisper.cpp/tree/main e baixe `ggml-small.bin` para Downloads. Para português, use um modelo sem `.en` no nome. Baixe o arquivo binário, não a página HTML. Modelos do Faster-Whisper para Windows não servem aqui.
3. Mantenha o modelo e as bibliotecas das ferramentas nos seus locais. Em Macs Intel, confirme a disponibilidade de binários compatíveis ou siga a compilação descrita pelo projeto; não use binários ARM.

## Configurar no plugin

1. Abra Configurações → WhatsApp Bridge → Provedor de transcrição e escolha **whisper.cpp (macOS)**.
2. Clique em **Configurar Whisper local**. A janela fica aberta durante a preparação.
3. Use **Localizar executáveis do Homebrew**, ou selecione `whisper-cli` e `ffmpeg` com **Procurar**, arrastando para os campos correspondentes ou colando caminhos completos.
4. No seletor do Finder, pressione **Cmd+Shift+G** e digite `/opt/homebrew/bin` (normalmente Apple Silicon) ou `/usr/local/bin` (normalmente Intel) para localizar os executáveis.
5. Selecione o arquivo `ggml-small.bin` no campo **Modelo GGML**. Use **Validar e salvar**. A validação verifica as ferramentas e o cabeçalho do modelo, sem transcrever ainda.
6. Escolha o idioma e use **Transcrever pendentes** para um áudio já baixado. Confira a transcrição no índice e na nota. Para transcrever novos áudios automaticamente, ative download e transcrição.

## Conferir

- Procurar, arrastar e colar caminhos com espaços funcionam nos três campos.
- Selecionar modelo HTML, pasta ou executável incorreto apresenta erro.
- A conversão usa FFmpeg; a transcrição usa whisper.cpp. O áudio não é enviado à OpenAI e não há download automático de modelo.
- **Transcrever pendentes** ignora transcrições concluídas; **Reprocessar todos** substitui os blocos sem duplicar mensagens.
- **Parar processamento** cancela conversão ou transcrição e preserva resultados anteriores.
- Configurações do Windows e OpenAI continuam preservadas. A opção Local escolhe a implementação do sistema atual.

Os testes automatizados cobrem argumentos, validação, cancelamento, limpeza de temporários e reprocessamento. A conversão real Ogg/Opus → WAV foi verificada no Mac. Ainda é necessário validar a interface do Obsidian e a transcrição com um modelo real no computador de teste.

Ao reportar falhas, informe arquitetura do Mac, versões do macOS, Obsidian, whisper.cpp e plugin, nome do modelo e mensagem de erro. Não envie áudios privados, chaves, credenciais ou bancos.
