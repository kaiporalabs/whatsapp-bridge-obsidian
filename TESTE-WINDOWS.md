# WhatsApp Bridge 0.4.1 — instalação e teste

Esta versão permite instalar o conector e parear pelo Obsidian. Não é necessário abrir terminal no fluxo normal. Comece em um vault de teste.

## Instalação / atualização

1. Extraia `whatsapp-bridge-0.2.0.zip`.
2. Copie `whatsapp-bridge` para `<vault>/.obsidian/plugins/`.
3. Se estiver atualizando, desative o plugin antes de substituir `main.js`, `manifest.json` e `styles.css`; preserve `data.json` e suas notas.
4. Reabra o Obsidian e habilite WhatsApp Bridge em Community plugins.

## Configurar em três passos

Abra Configurações → WhatsApp Bridge:

2. **Mostrar QR code**: no celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e escaneie o QR exibido. Isso cria um dispositivo vinculado próprio. Aguarde o estado Conectado; o QR desaparece e a coleta continua.
3. **Importar agora**: confira as notas. Em instalações novas, a pasta sugerida é `WhatsApp` e a importação periódica usa intervalo de 1 minuto. Atualizações preservam a pasta anterior.

O plugin segue o idioma configurado no Obsidian: português é traduzido e qualquer outro idioma usa inglês. As pastas de grupos e conversas pessoais podem ser alteradas separadamente. Os padrões existentes `Grupos` e `Pessoais` são preservados.

Se houver um `wacli` 0.19.0 no PATH, o plugin o detecta e utiliza automaticamente. Outras versões não são aceitas como compatíveis e o instalador gerenciado continua disponível.

O botão **Desconectar e apagar credenciais** pede confirmação, encerra o coletor, revoga o dispositivo vinculado e remove as credenciais da sessão local. As notas já importadas e o banco local de mensagens são preservados.

## Teste opcional de áudio

1. Confirme que **Baixar mensagens de áudio** inicia desligado após a atualização.
2. Ative a opção e mantenha a transcrição desligada no primeiro teste.
3. Receba um áudio recente e use **Importar agora**.
4. Verifique o player na nota da conversa, o arquivo em `Media/Audio` e a entrada em `Audio Index.md` com conversa, remetente e horário.
5. Execute a importação novamente e confirme que nem o arquivo nem a entrada são duplicados.

Para testar transcrição, use Obsidian 1.11.4 ou mais recente, selecione uma chave da API OpenAI pelo SecretStorage e ative **Transcrever áudios baixados**. O áudio será enviado à OpenAI. Não use conversas privadas no primeiro teste.

Depois do primeiro pareamento, ative **Iniciar coletor ao abrir Obsidian** se desejar. Em aberturas posteriores, também é possível clicar **Iniciar**, sem escanear novamente. **Parar** encerra a coleta deste plugin e preserva o vínculo. A importação consulta o que já está na base, mesmo com coletor parado.

O coletor gerenciado termina quando o plugin é desativado ou Obsidian é fechado. Não é um serviço permanente do Windows. Se já havia `wacli sync --follow` aberto no terminal, encerre-o antes de usar a gestão integrada.

## Onde ficam os dados

- Windows: `%LOCALAPPDATA%/WhatsAppBridge/`.
- macOS: `~/Library/Application Support/WhatsAppBridge/`.
- Linux: `$XDG_DATA_HOME/whatsapp-bridge/` ou `~/.local/share/whatsapp-bridge/`.

O binário fica em `bin/0.19.0`; uma nova sessão usa `accounts/principal`. Uma base previamente configurada é preservada, inclusive a base padrão do wacli se já existir. Não copie estas pastas para o vault nem as envie para suporte.

Opções avançadas permitem executável manual, pasta de dados, identificador de conta, histórico e filtros. Para outra conta, use **outra pasta de dados e outro identificador**, sempre com coletor parado. Não selecione LocalState do aplicativo WhatsApp Desktop.

## Roteiro de validação

- Instalar pelo botão; o estado deve indicar instalação concluída.
- Exibir QR, fechar/reabrir configurações e verificar que o QR ainda é exibido enquanto válido.
- Parear, aguardar Conectado, importar uma mensagem recebida e uma enviada.
- Conferir grupo, conversa pessoal, acentos, emoji e horários UTC.
- Repetir importação e reiniciar Obsidian: nenhuma duplicação.
- Parar/iniciar coletor: nenhum segundo processo concorrente.
- Ativar iniciar ao abrir, fechar e reabrir Obsidian: coleta deve retomar sem novo QR.
- Desconectar internet e retomar: conferir estado e reconexão.
- Cancelar pareamento via Parar e iniciar novamente: novo QR, sem processo anterior.
- Atualizar o plugin mantendo `data.json` e notas.

## Erros e limites

Falha de download/checksum: tente novamente; o arquivo não é instalado se divergir do hash fixado. ARM64 Windows não tem binário nativo nesta release e recebe orientação para configuração manual; não há seleção silenciosa de outra arquitetura. Sistemas de segurança podem impedir a execução de um binário; o plugin não altera essas proteções.

Vínculo revogado pelo celular: pare a coleta. Para parear novamente nesta versão, escolha uma pasta nova nas opções avançadas e use Mostrar QR code; mantenha o identificador da conta se for a mesma conta. Não há botão de logout que apague credenciais nesta versão.

Uma janela com 10.000 mensagens aborta antes de escrever; diminua os dias. Histórico antigo depende do que o WhatsApp disponibiliza. Mídia é apenas indicada; edições e exclusões posteriores não atualizam notas já importadas. Mensagens atrasadas são acrescentadas ao fim. Não remova os comentários wa-bridge das notas.

## Feedback

Envie versões do Windows, Obsidian e plugin, a etapa que falhou e o texto do estado. Não envie QR code, bancos, credenciais ou mensagens. O download/extração dos arquivos oficiais Mac e Windows foi verificado no Mac; o pareamento real e a execução Windows ainda precisam deste piloto.

## Configurar o conector

É necessária uma conta WhatsApp. Nas configurações, clique em **Configurar conector**. No popup, abra a página oficial do wacli 0.19.0, baixe o arquivo indicado para sua plataforma e salve em **Downloads**. Extraia o arquivo (no Windows: botão direito → Extrair tudo). Arraste o executável extraído `wacli.exe` (Windows) ou `wacli` (Mac/Linux) para o popup; também é possível colar seu caminho completo. Clique em **Validar e usar executável**. A janela permanece aberta durante o download e mostra o resultado da validação. Feche-a e clique em **Mostrar QR code** para parear.

A validação executa `wacli --version`; somente a versão 0.19.0 é aceita nesse fluxo. O plugin não baixa, instala, move, altera permissões ou atualiza dependências. Mantenha o executável no local selecionado. Instalações e sessões configuradas em versões anteriores continuam sendo usadas. Se o sistema bloquear a execução, siga as instruções oficiais do wacli para sua plataforma.

## Contas, rede e arquivos externos

O wacli é um conector independente e não oficial. O navegador acessa GitHub para baixar o conector; o wacli acessa WhatsApp para pareamento, sincronização e download opcional de áudio. As credenciais e a base local ficam fora do vault para evitar que sejam sincronizadas junto às notas: por padrão, `~/.wacli` em Mac/Windows e `~/.local/state/wacli` no Linux, ou o caminho configurado pelo usuário. Versões anteriores podem usar `WhatsAppBridge/accounts` em LocalAppData (Windows), Library/Application Support (Mac), ou `whatsapp-bridge/accounts` em XDG_DATA_HOME/`~/.local/share` (Linux). Esses caminhos são preservados.

Áudios passam por uma pasta temporária do sistema antes de serem copiados para o vault; o plugin tenta removê-la ao concluir ou falhar. As notas e os áudios no vault ficam sujeitos à sincronização e aos demais plugins. Não há telemetria implementada pelo plugin. Não compartilhe credenciais, bancos ou áudios privados em relatos de erro.

A transcrição é opcional e desativada por padrão. Ela envia o arquivo de áudio à API OpenAI e exige uma conta, chave de API e cobrança conforme o uso pelo provedor. Importar mensagens não exige OpenAI. A chave fica no SecretStorage; o recurso requer Obsidian 1.11.4. Consulte as condições e a privacidade do provedor antes de ativar.
