export type Locale='en'|'pt';

const en={
  intro:'Connect WhatsApp and import conversations without using the terminal. The collector runs while Obsidian is open.',
  install:'1. Install connector', installDesc:(v:string)=>`Looks for a compatible wacli ${v} in PATH. If unavailable, downloads it from openclaw/wacli on GitHub and verifies SHA-256. The connector is independent and unofficial.`,
  downloading:'Downloading…', reinstall:'Reinstall wacli', download:'Download and install wacli',
  connect:'2. Connect WhatsApp', connectDesc:'Starts pairing and keeps receiving messages after scanning. On your phone: WhatsApp → Linked devices → Link a device.', showQr:'Show QR code',
  pointQr:'Scan this code from WhatsApp Linked devices.', qrAlt:'QR code to link WhatsApp', qrError:'Could not render the QR code. Stop the collector and try again.',
  sync:'3. Synchronization', syncDesc:'If the account is already linked, select Start. Stop only ends the process started by this plugin and preserves the link.', start:'Start', stop:'Stop',
  auto:'Start collector when Obsidian opens', autoDesc:'Enable after the first pairing. No service runs while Obsidian is closed.',
  destination:'Destination folder', destinationDesc:'Messages are stored as Markdown in this vault.',
  groupFolder:'Groups folder', groupFolderDesc:'Subfolder used for group conversations. Existing notes are not moved.',
  personalFolder:'Personal chats folder', personalFolderDesc:'Subfolder used for personal conversations. Existing notes are not moved.',
  interval:'Import every (minutes)', intervalDesc:'1 is recommended; 0 disables automatic import. Collection and import are separate steps.',
  importing:'Import', importNow:'Import now', test:'Test local read', advanced:'Advanced options',
  executable:'wacli executable', executableDesc:'Filled by compatible PATH detection or the installer. An absolute path to a manually installed binary is also accepted.',
  store:'Data folder', storeDesc:'The local session and messages stay outside the vault. Do not use WhatsApp Desktop LocalState.',
  source:'Account identifier', sourceDesc:'Use another identifier and another data folder for a second account. Stop the collector before changing it.',
  ownName:'Your name', ownNameDesc:'Label for messages sent by you.', days:'History days', daysDesc:'1–3650. Limit of 10,000 messages per query.', groups:'Groups', personal:'Personal conversations',
  privacy:'The QR code is temporary and generated locally. The plugin does not send messages. The connector stores its session and local database; import queries are read-only.'
  ,logout:'Disconnect WhatsApp',logoutDesc:'Invalidates this linked device and removes its local session credentials. Imported notes and the local message database are preserved.',logoutButton:'Disconnect and remove credentials',logoutTitle:'Disconnect WhatsApp?',logoutConfirm:'This revokes the linked device and removes the credentials used by this plugin. A new QR code will be required to reconnect.',cancel:'Cancel',disconnected:'WhatsApp disconnected. Local credentials were removed.'
};
const pt:typeof en={
  intro:'Conecte seu WhatsApp e importe conversas sem usar o terminal. O coletor funciona enquanto o Obsidian estiver aberto.',
  install:'1. Instalar o conector', installDesc:v=>`Procura um wacli ${v} compatível no PATH. Se não estiver disponível, baixa do projeto openclaw/wacli no GitHub e verifica SHA-256. O conector é independente e não oficial.`,
  downloading:'Baixando…', reinstall:'Reinstalar wacli', download:'Baixar e instalar wacli',
  connect:'2. Conectar WhatsApp', connectDesc:'Inicia o pareamento e, após escanear, continua recebendo mensagens. No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo.', showQr:'Mostrar QR code',
  pointQr:'Aponte a câmera pelo menu Dispositivos conectados do WhatsApp.', qrAlt:'QR code para vincular WhatsApp', qrError:'Falha ao renderizar QR. Pare o coletor e tente conectar novamente.',
  sync:'3. Sincronização', syncDesc:'Se a conta já estiver conectada, use Iniciar. Parar encerra somente o processo iniciado por este plugin e preserva o vínculo.', start:'Iniciar', stop:'Parar',
  auto:'Iniciar coletor ao abrir Obsidian', autoDesc:'Ative depois do primeiro pareamento. Não inicia serviços com o Obsidian fechado.',
  destination:'Pasta de destino', destinationDesc:'As mensagens ficam em Markdown neste vault.',
  groupFolder:'Pasta de grupos', groupFolderDesc:'Subpasta usada para conversas em grupo. Notas existentes não são movidas.',
  personalFolder:'Pasta de conversas pessoais', personalFolderDesc:'Subpasta usada para conversas pessoais. Notas existentes não são movidas.',
  interval:'Importar a cada (minutos)', intervalDesc:'1 é recomendado; 0 desativa importação automática. O coletor e a importação são etapas separadas.',
  importing:'Importação', importNow:'Importar agora', test:'Testar leitura', advanced:'Opções avançadas',
  executable:'Executável wacli', executableDesc:'Preenchido pela detecção de uma versão compatível no PATH ou pelo instalador. Também aceita caminho absoluto para um binário instalado manualmente.',
  store:'Pasta de dados', storeDesc:'A sessão e as mensagens locais ficam fora do vault. Não use LocalState do WhatsApp Desktop.',
  source:'Identificador da conta', sourceDesc:'Use outro identificador e outra pasta de dados para uma segunda conta. Pare o coletor antes de alterar.',
  ownName:'Seu nome', ownNameDesc:'Rótulo das mensagens enviadas por você.', days:'Dias de histórico', daysDesc:'1–3650. Limite de 10.000 mensagens por consulta.', groups:'Grupos', personal:'Conversas pessoais',
  privacy:'O QR code é temporário e gerado localmente. O plugin não envia mensagens. O conector grava a sessão e a base local; as consultas de importação são somente leitura.'
  ,logout:'Desconectar WhatsApp',logoutDesc:'Invalida este dispositivo vinculado e remove as credenciais da sessão local. As notas importadas e o banco local de mensagens são preservados.',logoutButton:'Desconectar e apagar credenciais',logoutTitle:'Desconectar o WhatsApp?',logoutConfirm:'Isso revoga o dispositivo vinculado e remove as credenciais usadas por este plugin. Será necessário ler um novo QR code para reconectar.',cancel:'Cancelar',disconnected:'WhatsApp desconectado. As credenciais locais foram removidas.'
};
export function language(value:string):Locale{return value.toLowerCase().startsWith('pt')?'pt':'en';}
export function messages(value:string){return language(value)==='pt'?pt:en;}
