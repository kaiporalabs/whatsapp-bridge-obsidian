# WhatsApp Bridge

Plugin Obsidian desktop independente, versão beta **0.4.0**. Importa mensagens e, opcionalmente, áudios da base local do **wacli** para notas Markdown. Não usa os bancos protegidos da Microsoft Store e não depende do plugin WhatsApp Local Sync.

## Primeira instalação

Veja [TESTE-WINDOWS.md](TESTE-WINDOWS.md) para o procedimento completo e roteiro de testes. O ZIP em `dist` inclui a pasta `whatsapp-bridge` com `main.js`, `manifest.json` e `styles.css`. Copie-a para `<vault>/.obsidian/plugins/` e habilite o plugin em Community plugins. Não é preciso Node.js para usar o ZIP.

## Configuração integrada

Em Configurações → WhatsApp Bridge, clique **Baixar e instalar wacli**, depois **Mostrar QR code** e escaneie pelo menu Dispositivos conectados no celular. O pareamento inicia a coleta contínua. Clique **Importar agora** ou use o intervalo de importação (1 minuto em instalações novas).

O plugin detecta primeiro um `wacli` 0.19.0 disponível no PATH. A interface segue o idioma do Obsidian, com inglês como padrão e tradução para português. Novas instalações sugerem a pasta `WhatsApp`; atualizações mantêm o destino anterior. As subpastas de grupos e conversas pessoais são configuráveis e continuam usando `Grupos` e `Pessoais` por padrão.

Para desvincular a conta, use **Desconectar e apagar credenciais** nas configurações. A ação pede confirmação, revoga a sessão do dispositivo vinculado e remove as credenciais locais, preservando as notas e o banco local de mensagens.

## Áudios e transcrição

O download de áudios é desativado por padrão. Quando ativado, o plugin baixa cada mensagem de áudio por uma consulta `media download --read-only`, grava o arquivo pelo API do vault e incorpora o player na nota da conversa. O caminho padrão é `Media/Audio`, dentro da pasta da conta.

Cada conta recebe um arquivo estável `Audio Index.md`. Cada entrada registra conversa, chat ID, remetente, horário de envio, caminho do arquivo, estado do processamento e transcrição quando disponível. A chave combina conta, conversa e ID da mensagem, portanto novas importações atualizam a mesma entrada sem duplicá-la.

A transcrição também é desativada por padrão e depende do download de áudio. Nesta versão, o provedor disponível é a API da OpenAI com `gpt-4o-mini-transcribe`. A chave é selecionada no SecretStorage do Obsidian 1.11.4 ou mais recente e não é gravada no `data.json` do plugin. Ao ativar a transcrição, o arquivo de áudio é enviado à OpenAI. O idioma pode ser automático, português ou inglês.

O conector é baixado do repositório oficial **openclaw/wacli**, versão fixa **0.19.0**, com SHA-256 fixado no código para cada plataforma. A instalação e os dados ficam fora do vault. Suporte automático: Windows x64, macOS Intel/Apple Silicon e Linux x64/ARM64. O plugin não usa shell para executar comandos. Downloads não atualizam automaticamente para outra versão.

Os botões **Iniciar** e **Parar** gerenciam o processo filho; a opção **Iniciar coletor ao abrir Obsidian** é desativada por padrão. Desativar o plugin ou fechar Obsidian encerra seu coletor. O QR code é gerado localmente, atualizado conforme eventos do wacli e não é salvo ou registrado em logs. Pareamento expira após três minutos sem conexão.

O **wacli é uma dependência externa e não oficial**. Seu binário não acompanha o ZIP: é instalado por ação explícita no botão. Pareamento cria um dispositivo vinculado e grava credenciais/base no computador. O plugin executa apenas auth/sync para coleta e consultas read-only para importação, sem ferramentas de envio. Executável e pasta manuais continuam disponíveis em Opções avançadas. Encerre coletores externos antes de iniciar o coletor integrado.

## O que a versão faz

- Consulta `messages list` via `execFile`, sem shell, com `--read-only` e `WACLI_READONLY=1`.
- Importa texto e indicação de mídia; opcionalmente baixa e transcreve áudios; filtra grupos/pessoais; ignora status/broadcast e canais.
- Cria uma nota por conversa com caminho estável derivado do JID, dentro da pasta e identificador de conta escolhidos.
- Deduplica por conta + JID + ID da mensagem, com marcadores HTML nas notas. Não depende de um cursor salvo separadamente.
- Reconsulta a janela de dias para encontrar mensagens atrasadas/backfill dentro dela. Mensagens antigas descobertas depois são acrescentadas ao fim, com horário UTC explícito.
- Intervalo de importação enquanto Obsidian está aberto, padrão de 1 minuto em novas instalações. Configurações de versões anteriores são preservadas. O coletor gerenciado também depende de Obsidian aberto.
- Teste de leitura sem escrever notas; erro de formato não é interpretado como lista vazia.

## Limites da versão de testes

Não importa imagens, vídeos ou documentos, não atualiza textos editados nem remove mensagens já importadas após exclusão no WhatsApp. As notas são um arquivo de importação, não um espelho completo de alterações. Não inclui triagem, calendário ou envio. A janela padrão é de sete dias, não todo o histórico. A consulta tem limite de 10.000 linhas e 32 MB: ao atingir o limite de linhas, a execução aborta antes de escrever; reduza a janela. Paginação sem perdas é uma melhoria planejada.

Use um identificador de conta diferente ao trocar de conta; o plugin não deduz a identidade a partir das credenciais. Mudar pasta ou identificador cria outro destino. Não remova os marcadores `wa-bridge` das notas; eles evitam duplicatas. Não rode importações simultâneas do mesmo destino em máquinas diferentes. Apagar uma nota permite reconstruí-la somente com as mensagens disponíveis na janela atual.

## Privacidade

As notas e os áudios ficam legíveis no vault, sujeitos à sincronização e aos outros plugins instalados. O plugin não grava mensagens, transcrições ou áudio nos logs. A transcrição em nuvem somente é executada após ativação explícita e envia o áudio à OpenAI. O botão de instalação acessa GitHub para baixar o binário; o processo wacli se conecta ao WhatsApp. A base e as credenciais do wacli ficam fora do vault. Não compartilhe `session.db`, `wacli.db`, o diretório do coletor, áudios ou notas reais nos relatos de teste.

## Desenvolvimento

Node.js 20+ e npm. Execute `npm ci`, `npm run build`, `npm test` ou `npm run package`. O último gera o ZIP e SHA-256 em `dist`. Código TypeScript em `src`; testes sintéticos em `tests`. Os testes cobrem importação, instalador, checksum, extração ZIP/TAR, eventos de QR, processo único e revogação; não substituem pareamento real. Nenhum código do plugin anterior foi copiado. Licença MIT.

Contrato consultado em 29/09/2026: JSON `data.messages` com `ChatJID`, `MsgID`, `Timestamp`, `FromMe`, `ChatName`, `SenderName`, `SenderJID`, `Text` e `DisplayText`. Fontes: [CLI de mensagens](https://wacli.sh/messages.html), [integrações](https://wacli.sh/integrations.html), [implementação da consulta](https://github.com/openclaw/wacli/blob/main/cmd/wacli/messages_read.go), [tipos](https://github.com/openclaw/wacli/blob/main/internal/store/types.go). Compatibilidade real com binários e contas deve ser validada no piloto; a documentação atual não substitui esse teste.

## Estado do projeto

Esta é uma versão beta distribuída pelo GitHub. O workflow CI verifica build e testes em Windows e macOS. Antes de uma futura submissão ao catálogo comunitário do Obsidian, ainda serão necessários testes reais adicionais no Windows e macOS, além das melhorias de paginação e reconciliação descritas acima.

## Fontes do fluxo integrado

- https://wacli.sh/auth.html — auth, formato QR e eventos.
- https://github.com/openclaw/wacli/releases/tag/v0.19.0 — binários fixados.
- https://github.com/openclaw/wacli/blob/main/internal/out/events.go — NDJSON.
- https://github.com/openclaw/wacli/blob/main/internal/app/sync_events.go — estados de conexão.

Hashes conferidos contra a API de release do GitHub em 29/09/2026. A verificação detecta download adulterado ou alterado em relação ao artefato fixado, não é uma auditoria de segurança do wacli. Bibliotecas empacotadas têm seus avisos em THIRD-PARTY-NOTICES.txt.
