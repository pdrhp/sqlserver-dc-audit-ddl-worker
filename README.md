# SQL Server DDL Audit Worker

Sistema de auditoria DDL para SQL Server com polling worker Node.js que monitora mudanças de schema (CREATE, ALTER, DROP de tabelas, índices, schemas) e envia notificações Discord em tempo real.

## 🚀 Funcionalidades

- **Monitoramento Contínuo**: Polling worker que verifica mudanças a cada X segundos
- **Múltiplos Bancos**: Suporte simultâneo a vários bancos SQL Server
- **Auditoria Centralizada**: Todas as mudanças armazenadas em banco central
- **Notificações Discord**: Embeds ricos com detalhes das operações DDL
- **Resiliência**: Sistema tolerante a falhas com retry automático
- **Logging Estruturado**: Winston para logging completo
- **Graceful Shutdown**: Encerramento limpo de conexões e workers

## 📋 Pré-requisitos

- Node.js 18+
- SQL Server 2016+ (com permissões para DDL Triggers)
- Bot Discord (opcional para notificações)

## 🛠️ Instalação

### Opção 1: Desenvolvimento Local (Recomendado)

```bash
# Clonar o repositório
git clone <repository-url>
cd sqlserver-dc-audit-ddl-worker

# Instalar dependências
npm install

# Iniciar SQL Server com Docker (banco único com ambos os databases)
docker-compose up -d

# Aguardar o container ficar saudável
docker-compose ps

# Compilar TypeScript
npm run build
```

**O Docker inicializa automaticamente os bancos:**
- ✅ Banco `SchemaAudit` (auditoria central)
- ✅ Banco `TestDB` (monitorado para testes)

**O sistema cria automaticamente quando executado:**
- ✅ Tabelas necessárias em ambos os bancos
- ✅ DDL Triggers nos bancos monitorados
- ✅ Testa funcionamento dos triggers

### Opção 2: Instalação Manual

```bash
# Instalar dependências
npm install

# Compilar TypeScript
npm run build
```

## ⚙️ Configuração

### 1. Arquivo .env

Crie um arquivo `.env` na raiz do projeto:

```env
# Configurações do Discord
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
# OU use webhook (opcional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_url

# Configurações de Auditoria
AUDIT_POLLING_INTERVAL=10
AUDIT_MAX_RETRIES=3
AUDIT_RETRY_DELAY=5
AUDIT_BATCH_SIZE=50

# Configuração do Banco Central de Auditoria
AUDIT_DB_SERVER=localhost
AUDIT_DB_PORT=1433
AUDIT_DB_NAME=SchemaAudit
AUDIT_DB_USERNAME=audit_user
AUDIT_DB_PASSWORD=your_password
AUDIT_DB_TRUST_CERT=true
AUDIT_DB_CONNECTION_TIMEOUT=30000
AUDIT_DB_REQUEST_TIMEOUT=30000
AUDIT_DB_POOL_MAX=10
AUDIT_DB_POOL_MIN=1
AUDIT_DB_POOL_IDLE_TIMEOUT=30000

# Bancos Monitorados (JSON Array)
MONITORED_DATABASES=[
  {
    "name": "production_db",
    "server": "prod-server.database.windows.net",
    "port": 1433,
    "database": "MyAppDB",
    "username": "audit_user",
    "password": "secure_password",
    "trustServerCertificate": false,
    "connectTimeout": 30000,
    "requestTimeout": 30000,
    "pool": {
      "max": 5,
      "min": 1,
      "idleTimeoutMillis": 30000
    }
  }
]
```

### 2. Configuração Automática dos Bancos SQL Server

O sistema configura automaticamente tudo o que é necessário:

#### Banco Central de Auditoria
- ✅ Cria automaticamente a tabela `schema_audit_log`
- ✅ Configura índices para otimização

#### Bancos Monitorados
- ✅ Cria automaticamente a tabela `local_ddl_audit`
- ✅ Cria e configura DDL Triggers
- ✅ Testa funcionamento dos triggers
- ✅ Valida permissões de acesso

**Apenas configure as variáveis de ambiente - o sistema cuida do resto!**

## 🚀 Execução

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start

# Scripts disponíveis
npm run lint          # Executar ESLint
npm run test          # Executar testes
npm run test:coverage # Executar testes com cobertura
```

## 📊 Status do Sistema

O sistema fornece informações detalhadas sobre seu funcionamento:

```
Iniciando SQL Server DDL Audit Worker...
Bancos monitorados: 2
Intervalo de polling: 10s
Discord configurado: Channel ID
Configuracao validada com sucesso!
Criando DDL Trigger no banco production_db...
DDL Trigger criado e habilitado no banco production_db
DDL Trigger funcionando corretamente no banco production_db
Sistema pronto para iniciar operacoes!
Sistema totalmente operacional!
[2025-11-12T10:30:00.000Z] Iniciando ciclo de polling
```

## 🏗️ Arquitetura

### Componentes Principais

- **Config**: Gerenciamento centralizado de configurações
- **DatabaseService**: Pool de conexões e operações SQL
- **ValidationService**: Validação de conectividade e permissões
- **PollingWorker**: Worker principal de monitoramento
- **DiscordService**: Notificações Discord em tempo real

### Fluxo de Dados

1. **DDL Trigger** captura mudança → **local_ddl_audit**
2. **PollingWorker** verifica periodicamente mudanças não processadas
3. **Mudanças** são inseridas no **schema_audit_log** central
4. **DiscordService** envia notificações em tempo real com embeds ricos

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Testes com watch
npm run test:watch

# Cobertura de testes
npm run test:coverage
```

## 📈 Monitoramento

### Métricas de Sucesso

- ✅ Captura de 100% das operações DDL monitoradas
- ✅ Notificações Discord enviadas em < 10 segundos após mudança
- ✅ Sistema resiliente a falhas de rede e reinicializações

### Notificações Discord

O sistema envia embeds ricos para cada mudança DDL detectada:

#### Tipos de Notificação
- **🆕 CREATE** - Verde (0x00FF00) - Criação de objetos
- **✏️ ALTER** - Amarelo (0xFFFF00) - Modificação de objetos
- **🗑️ DROP** - Vermelho (0xFF0000) - Remoção de objetos

#### Emojis por Tipo de Objeto
- 📋 **TABLE** - Tabelas
- 🔍 **INDEX** - Índices
- 👁️ **VIEW** - Views
- ⚙️ **PROCEDURE** - Procedures
- 🔧 **FUNCTION** - Functions
- 🎯 **TRIGGER** - Triggers
- 📁 **SCHEMA** - Schemas

#### Informações Incluídas
- Tipo e nome do objeto modificado
- Operação DDL executada
- Usuário que executou
- Host de origem
- Timestamp da operação
- Comando SQL (se não muito longo)

#### Exemplo de Notificação DDL

```
🆕 CREATE 📋

TABLE dbo.users

👤 Usuário: sa
🖥️ Host: localhost
📅 Data/Hora: 12/11/2025 19:45:30

📝 Comando SQL:
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

Database: TestDB | Server: localhost
```

#### Notificações do Sistema
- 🚀 **Inicialização bem-sucedida**
- 🚨 **Erros críticos**
- 🛑 **Shutdown do sistema**
- ℹ️ **Status e métricas**

### Logs Estruturados

O sistema utiliza Winston para logging estruturado com diferentes níveis:
- `error`: Erros críticos
- `warn`: Avisos e tentativas de retry
- `info`: Operações normais
- `debug`: Detalhes técnicos

## 🚨 Tratamento de Erros

- **Retry automático**: Até 3 tentativas por mudança
- **Failover**: Continua processando outros bancos se um falhar
- **Graceful shutdown**: Fecha conexões adequadamente
- **Dead letter queue**: Mudanças com erro excessivo são marcadas

## 🔒 Segurança

- Usuários dedicados com permissões mínimas
- Conexões criptografadas (TLS)
- Validação de certificados
- Logs não incluem senhas

## 🐳 Docker para Desenvolvimento

O projeto inclui configuração Docker completa para desenvolvimento:

### Container Disponível

- **sqlserver**: SQL Server único com dois bancos:
  - `SchemaAudit` (porta 1433) - Banco central de auditoria
  - `TestDB` (porta 1433) - Banco monitorado com DDL trigger

### Comandos Úteis

```bash
# Iniciar container
docker-compose up -d

# Ver status do container
docker-compose ps

# Ver logs
docker-compose logs -f

# Conectar ao SQL Server
docker exec -it sqlserver /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'YourStrong!Passw0rd'

# Verificar bancos criados
docker exec -it sqlserver /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'YourStrong!Passw0rd' -Q "SELECT name FROM sys.databases"

# Parar container
docker-compose down

# Limpar volumes
docker-compose down -v
```

## 📝 Desenvolvimento

### Estrutura do Projeto

```
src/
├── config/           # Configurações e validação
├── services/         # Serviços principais
│   ├── database.ts   # Operações SQL
│   ├── validation.ts # Validação de setup
│   ├── polling-worker.ts # Worker de polling
│   └── discord.ts    # Notificações Discord
└── index.ts         # Ponto de entrada

docker-compose.yml   # Configuração Docker
init-db/            # Scripts de inicialização SQL
env.development.example # Exemplo de configuração
```

### Scripts NPM

- `build`: Compila TypeScript
- `start`: Executa versão compilada
- `dev`: Compila e executa
- `lint`: Executa ESLint
- `test`: Executa testes Jest

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request


