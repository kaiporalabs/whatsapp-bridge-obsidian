# WhatsApp Bridge 0.5.1 — teste no Windows

Requer Obsidian 1.13.1 ou superior. Use um vault de teste e áudios sem dados privados. O pacote foi compilado e testado com simulações no Mac; a execução real do Faster-Whisper-XXL e a interface de seleção precisam ser validadas no Windows.

## Atualizar sem perder configurações

1. Desative o plugin no Obsidian.
2. Extraia `whatsapp-bridge-0.5.1.zip`.
3. Copie apenas `main.js`, `manifest.json` e `styles.css` da pasta `whatsapp-bridge` para `<vault>/.obsidian/plugins/whatsapp-bridge/`.
4. Preserve `data.json`, as notas, áudios, índice e credenciais. Reative o plugin.
5. Confirme a versão 0.5.1 e que suas pastas e configurações anteriores foram mantidas. OpenAI continua sendo o provedor padrão.

Nesta correção, teste primeiro **Procurar** e arrastar o executável nas janelas de wacli e Whisper. O caminho completo deve aparecer no campo antes de clicar em **Validar e usar executável**. Se ainda falhar, informe a versão do instalador Electron em Ajuda → Sobre e o erro do console ao reproduzir, removendo dados privados.

Não é necessário parear novamente se a sessão existente funciona.

## Testar Whisper local

1. Abra Configurações → WhatsApp Bridge → Mensagens de áudio.
2. Escolha **Faster-Whisper-XXL (Windows)** em **Provedor de transcrição**.
3. Clique em **Configurar Whisper local**, depois em **Abrir página de download**.
4. Na página oficial do Purfview, baixe o pacote **Faster-Whisper-XXL para Windows x86-64**, salvando em **Downloads**. O popup continua aberto.
5. Extraia o pacote inteiro com um programa compatível com o formato (por exemplo, 7-Zip). Mantenha as subpastas e bibliotecas juntas; não mova só o EXE.
6. Clique em **Procurar** e selecione `faster-whisper-xxl.exe`. Como alternativas, arraste esse arquivo para o popup ou use **Copiar como caminho** no Explorer e cole no campo. Caminhos com espaços e aspas devem funcionar.
7. Clique em **Validar e usar executável**. A validação executa `--help`, verifica as opções necessárias e salva o caminho. Aguarde **Pronto** e feche o popup.
8. Escolha o modelo (`medium` por padrão) e idioma. Para um teste mais leve, use `small`.
9. Use **Transcrever pendentes**, leia a confirmação e continue. Confira a transcrição no `Audio Index.md` e na nota da conversa.

O programa usa a CPU e pode baixar o modelo do Hugging Face no primeiro uso para sua pasta `_models`. Esse download pode ser grande e demorado. Reserve espaço em disco e conexão à internet. O plugin não envia esse áudio à OpenAI quando Whisper local está selecionado. O tempo limite é de uma hora por arquivo. Para novos áudios, habilite **Baixar mensagens de áudio** e **Transcrever áudios baixados**.

## Testar reprocessamento com os dois provedores

- **Transcrever pendentes**: deve processar áudios já baixados sem transcrição concluída, inclusive os anteriores ao período de histórico. Repetir não deve transcrever os concluídos novamente.
- **Reprocessar todos**: deve pedir confirmação e substituir a transcrição nos mesmos blocos, sem duplicar notas ou mensagens. Uma falha deve preservar o texto anterior.
- Os botões usam o índice da conta e pasta de destino atuais, sem consultar WhatsApp ou baixar os áudios novamente. Funcionam mesmo com transcrição automática desativada. Arquivos fora do índice não são descobertos.
- **Parar processamento**: interrompe o Whisper local. Na OpenAI, aguarda a requisição ativa; não inicia o próximo áudio. Resultados anteriores são preservados.
- Para testar **OpenAI**, selecione esse provedor e uma chave pelo SecretStorage do Obsidian. A confirmação informa o envio do áudio à API e possível cobrança, inclusive nas repetições. Não é necessário configurar Whisper.
- Confira falha de arquivo ausente e limite de tamanho. O índice deve registrar o erro e permitir tentar novamente.

## Conector WhatsApp

Se ainda não estiver configurado, use **Configurar conector**. Baixe wacli 0.19.0 pelo navegador em Downloads, extraia e selecione `wacli.exe` usando Procurar, arrastando ou colando o caminho. Clique em **Validar e usar executável**. A validação executa `--version`. Um wacli 0.19.0 compatível no PATH também é detectado quando não há executável configurado.

Use **Mostrar QR code** e escaneie pelo WhatsApp no celular → Dispositivos conectados → Conectar dispositivo. Aguarde Conectado, depois use **Importar agora**. O coletor funciona enquanto Obsidian estiver aberto. **Parar** preserva o vínculo; **Desconectar e apagar credenciais** pede confirmação e executa o logout, preservando notas e o banco de mensagens.

O plugin não baixa, instala, move, atualiza nem altera permissões dos executáveis externos. Ele inicia apenas os programas configurados, sem shell. Mantenha-os nos locais selecionados. Não selecione LocalState do WhatsApp Desktop como pasta de dados.

## Dados e privacidade

Credenciais e banco do wacli ficam fora do vault: por padrão `~/.wacli` no Windows/Mac e `~/.local/state/wacli` no Linux, ou o caminho configurado. Pastas de versões anteriores são preservadas. Não copie essas pastas para o vault nem as envie para suporte.

OpenAI recebe o áudio somente quando selecionada para transcrição. Sua chave permanece no SecretStorage. Whisper local recebe uma cópia temporária do áudio, e o plugin remove essa cópia e a saída ao terminar ou falhar. Os modelos são gerenciados pelo programa externo. Áudios, notas e transcrições salvos no vault ficam sujeitos à sincronização e aos outros plugins. Não há telemetria implementada pelo plugin.

## Feedback

Informe versão do Windows, Obsidian e plugin, modelo escolhido, etapa que falhou e mensagem de erro. Confirme especialmente seleção pelo botão, arrastar, caminho com espaços, primeira transcrição, reprocessamento e cancelamento. Não envie QR code, bancos, credenciais ou áudios privados.
