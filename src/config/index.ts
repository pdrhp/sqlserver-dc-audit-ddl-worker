import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

export interface DatabaseConfig {
  name: string;
  server: string;
  port: number;
  database: string;
  username: string;
  password: string;
  trustServerCertificate?: boolean;
  connectTimeout?: number;
  requestTimeout?: number;
  pool?: {
    max: number;
    min: number;
    idleTimeoutMillis: number;
  };
}

export interface DiscordConfig {
  token: string;
  channelId: string;
  webhookUrl?: string;
}

export interface AuditConfig {
  pollingInterval: number; // em segundos
  maxRetries: number;
  retryDelay: number; // em segundos
  batchSize: number;
}

export class Config {
  // Configurações do Discord
  public readonly discord: DiscordConfig;

  // Configurações de auditoria
  public readonly audit: AuditConfig;

  // Configurações dos bancos de dados monitorados
  public readonly monitoredDatabases: DatabaseConfig[];

  // Configuração do banco central de auditoria
  public readonly auditDatabase: DatabaseConfig;

  constructor() {
    this.discord = this.loadDiscordConfig();
    this.audit = this.loadAuditConfig();
    this.monitoredDatabases = this.loadMonitoredDatabases();
    this.auditDatabase = this.loadAuditDatabaseConfig();

    this.validateConfig();
  }

  private loadDiscordConfig(): DiscordConfig {
    const token = process.env.DISCORD_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    // Permitir webhook sem token
    if (!webhookUrl && !token) {
      throw new Error('DISCORD_TOKEN ou DISCORD_WEBHOOK_URL deve ser definido');
    }

    if (!webhookUrl && !channelId) {
      throw new Error('DISCORD_CHANNEL_ID é obrigatório quando usando bot');
    }

    return {
      token: token || '',
      channelId: channelId || '',
      webhookUrl: webhookUrl || '',
    };
  }

  private loadAuditConfig(): AuditConfig {
    return {
      pollingInterval: parseInt(process.env.AUDIT_POLLING_INTERVAL || '10', 10),
      maxRetries: parseInt(process.env.AUDIT_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.AUDIT_RETRY_DELAY || '5', 10),
      batchSize: parseInt(process.env.AUDIT_BATCH_SIZE || '50', 10),
    };
  }

  private loadMonitoredDatabases(): DatabaseConfig[] {
    const databasesJson = process.env.MONITORED_DATABASES;

    if (!databasesJson) {
      throw new Error('MONITORED_DATABASES é obrigatório');
    }

    try {
      const databases = JSON.parse(databasesJson);

      if (!Array.isArray(databases) || databases.length === 0) {
        throw new Error('MONITORED_DATABASES deve ser um array não vazio');
      }

      return databases.map((db: any) => this.validateDatabaseConfig(db));
    } catch (error) {
      throw new Error(`Erro ao parsear MONITORED_DATABASES: ${error}`);
    }
  }

  private loadAuditDatabaseConfig(): DatabaseConfig {
    const config: DatabaseConfig = {
      name: 'audit',
      server: process.env.AUDIT_DB_SERVER || 'localhost',
      port: parseInt(process.env.AUDIT_DB_PORT || '1433', 10),
      database: process.env.AUDIT_DB_NAME || 'SchemaAudit',
      username: process.env.AUDIT_DB_USERNAME || '',
      password: process.env.AUDIT_DB_PASSWORD || '',
      trustServerCertificate: process.env.AUDIT_DB_TRUST_CERT === 'true',
      connectTimeout: parseInt(process.env.AUDIT_DB_CONNECTION_TIMEOUT || '30000', 10),
      requestTimeout: parseInt(process.env.AUDIT_DB_REQUEST_TIMEOUT || '30000', 10),
      pool: {
        max: parseInt(process.env.AUDIT_DB_POOL_MAX || '10', 10),
        min: parseInt(process.env.AUDIT_DB_POOL_MIN || '1', 10),
        idleTimeoutMillis: parseInt(process.env.AUDIT_DB_POOL_IDLE_TIMEOUT || '30000', 10),
      },
    };

    return this.validateDatabaseConfig(config);
  }

  private validateDatabaseConfig(config: any): DatabaseConfig {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Nome do banco é obrigatório');
    }

    if (!config.server || typeof config.server !== 'string') {
      throw new Error(`Servidor é obrigatório para o banco ${config.name}`);
    }

    if (!config.database || typeof config.database !== 'string') {
      throw new Error(`Nome do banco de dados é obrigatório para ${config.name}`);
    }

    if (!config.username || typeof config.username !== 'string') {
      throw new Error(`Username é obrigatório para o banco ${config.name}`);
    }

    if (!config.password || typeof config.password !== 'string') {
      throw new Error(`Password é obrigatório para o banco ${config.name}`);
    }

    return {
      name: config.name,
      server: config.server,
      port: config.port || 1433,
      database: config.database,
      username: config.username,
      password: config.password,
      trustServerCertificate: config.trustServerCertificate ?? true,
      connectTimeout: config.connectTimeout || 30000,
      requestTimeout: config.requestTimeout || 30000,
      pool: config.pool || {
        max: 10,
        min: 1,
        idleTimeoutMillis: 30000,
      },
    };
  }

  private validateConfig(): void {
    // Validações adicionais podem ser implementadas aqui
    if (this.audit.pollingInterval < 1) {
      throw new Error('AUDIT_POLLING_INTERVAL deve ser maior que 0');
    }

    if (this.audit.batchSize < 1) {
      throw new Error('AUDIT_BATCH_SIZE deve ser maior que 0');
    }
  }

  // Método utilitário para obter configuração de um banco específico
  public getDatabaseConfig(databaseName: string): DatabaseConfig | undefined {
    return this.monitoredDatabases.find(db => db.name === databaseName);
  }
}

// Instância singleton da configuração
export const config = new Config();
