import mssql from 'mssql';
import { config, DatabaseConfig } from '../config/index.js';
import { DatabaseService } from './database.js';
import { discordService, DDLChange } from './discord.js';

export interface AuditEvent {
  id: number;
  databaseName: string;
  serverName: string;
  schemaName?: string;
  objectName: string;
  objectType: string;
  ddlOperation: string;
  ddlStatement?: string;
  eventData: any;
  loginName?: string;
  userName?: string;
  hostName?: string;
  applicationName?: string;
  spid?: number;
  startTime: Date;
  processed: boolean;
  processedAt?: Date;
  retryCount: number;
  createdAt: Date;
}

export class PollingWorker {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private readonly maxRetries = config.audit.maxRetries;
  private readonly retryDelay = config.audit.retryDelay * 1000; 

 
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Worker de polling ja esta em execucao');
      return;
    }

    console.log(`Iniciando worker de polling - intervalo: ${config.audit.pollingInterval}s`);
    this.isRunning = true;

    await this.pollAllDatabases();

    this.intervalId = setInterval(async () => {
      try {
        await this.pollAllDatabases();
      } catch (error) {
        console.error('Erro no ciclo de polling:', error);
      }
    }, config.audit.pollingInterval * 1000);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Parando worker de polling...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    console.log('Worker de polling parado');
  }

  private async pollAllDatabases(): Promise<void> {
    const startTime = new Date();
    console.log(`[${startTime.toISOString()}] Iniciando ciclo de polling`);

    try {
      for (const dbConfig of config.monitoredDatabases) {
        try {
          await this.pollDatabase(dbConfig);
        } catch (error) {
          console.error(`Erro ao processar banco ${dbConfig.name}:`, error);
        }
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log(`[${endTime.toISOString()}] Ciclo de polling concluido em ${duration}ms`);

    } catch (error) {
      console.error('Erro critico no ciclo de polling:', error);
    }
  }

  private async pollDatabase(dbConfig: DatabaseConfig): Promise<void> {
    console.log(`Verificando mudancas no banco ${dbConfig.name}`);

    const localPool = await DatabaseService.getConnectionPool(dbConfig);
    const auditPool = await DatabaseService.getConnectionPool(config.auditDatabase);

    try {
      const changes = await this.getUnprocessedChanges(localPool, dbConfig);

      if (changes.length === 0) {
        console.log(`Nenhuma mudanca pendente no banco ${dbConfig.name}`);
        return;
      }

      console.log(`Encontradas ${changes.length} mudancas no banco ${dbConfig.name}`);

      for (const change of changes) {
        try {
          await this.processChange(change, auditPool, localPool, dbConfig);
        } catch (error) {
          console.error(`Erro ao processar mudanca ${change.id} no banco ${dbConfig.name}:`, error);

          await this.markChangeError(localPool, change.id, error);
        }
      }

    } catch (error) {
      throw new Error(`Falha ao verificar banco ${dbConfig.name}: ${error}`);
    }
  }

  private async getUnprocessedChanges(pool: any, dbConfig: DatabaseConfig): Promise<AuditEvent[]> {
    try {
      const result = await pool.request()
        .query(`
          SELECT TOP (${config.audit.batchSize})
            id,
            event_type as ddlOperation,
            object_type as objectType,
            object_name as objectName,
            schema_name as schemaName,
            ddl_statement as ddlStatement,
            event_data as eventData,
            login_name as loginName,
            user_name as userName,
            host_name as hostName,
            application_name as applicationName,
            spid,
            start_time as startTime,
            processed,
            processed_at as processedAt,
            retry_count as retryCount,
            created_at as createdAt
          FROM local_ddl_audit
          WHERE processed = 0
            AND (retry_count < ${this.maxRetries} OR retry_count IS NULL)
            AND object_name NOT LIKE 'temp_test_trigger_%'
          ORDER BY created_at ASC
        `);

      return result.recordset.map((row: any) => ({
        id: row.id,
        databaseName: dbConfig.name,
        serverName: dbConfig.server,
        schemaName: row.schemaName,
        objectName: row.objectName,
        objectType: row.objectType,
        ddlOperation: row.ddlOperation,
        ddlStatement: row.ddlStatement,
        eventData: row.eventData,
        loginName: row.loginName,
        userName: row.userName,
        hostName: row.hostName,
        applicationName: row.applicationName,
        spid: row.spid,
        startTime: row.startTime,
        processed: false,
        processedAt: row.processedAt,
        retryCount: row.retryCount || 0,
        createdAt: row.createdAt,
      }));
    } catch (error) {
      throw new Error(`Erro ao buscar mudancas nao processadas: ${error}`);
    }
  }

  private async processChange(
    change: AuditEvent,
    auditPool: any,
    localPool: any,
    dbConfig: DatabaseConfig
  ): Promise<void> {
    console.log(`Processando mudanca ${change.id} (${change.ddlOperation} ${change.objectType} ${change.objectName})`);

    try {
      await this.insertIntoAuditDatabase(change, auditPool);

      await this.markChangeProcessed(localPool, change.id);

      await this.sendDiscordNotification(change);

      console.log(`Mudanca ${change.id} processada com sucesso`);

    } catch (error) {
      console.error(`Erro ao processar mudanca ${change.id}:`, error);
      throw error;
    }
  }

  private async sendDiscordNotification(change: AuditEvent): Promise<void> {
    try {
      const ddlChange: DDLChange = {
        id: change.id,
        databaseName: change.databaseName,
        serverName: change.serverName,
        schemaName: change.schemaName,
        objectName: change.objectName,
        objectType: change.objectType,
        ddlOperation: change.ddlOperation,
        ddlStatement: change.ddlStatement,
        loginName: change.loginName,
        userName: change.userName,
        hostName: change.hostName,
        startTime: change.startTime
      };

      await discordService.notifyDDLChange(ddlChange);
    } catch (error) {
      console.error('Erro ao enviar notificacao Discord:', error);
    }
  }

  private async insertIntoAuditDatabase(change: AuditEvent, auditPool: any): Promise<void> {
    try {
      await auditPool.request()
        .input('databaseName', change.databaseName)
        .input('serverName', change.serverName)
        .input('schemaName', change.schemaName)
        .input('objectName', change.objectName)
        .input('objectType', change.objectType)
        .input('ddlOperation', change.ddlOperation)
        .input('ddlStatement', change.ddlStatement)
        .input('eventData', change.eventData)
        .input('loginName', change.loginName)
        .input('userName', change.userName)
        .input('hostName', change.hostName)
        .input('applicationName', change.applicationName)
        .input('spid', change.spid)
        .input('startTime', change.startTime)
        .query(`
          INSERT INTO schema_audit_log (
            database_name, server_name, schema_name, object_name, object_type,
            ddl_operation, ddl_statement, event_data, login_name, user_name,
            host_name, application_name, spid, start_time, processed
          ) VALUES (
            @databaseName, @serverName, @schemaName, @objectName, @objectType,
            @ddlOperation, @ddlStatement, @eventData, @loginName, @userName,
            @hostName, @applicationName, @spid, @startTime, 1
          )
        `);
    } catch (error) {
      throw new Error(`Erro ao inserir no banco de auditoria: ${error}`);
    }
  }

  private async markChangeProcessed(localPool: any, changeId: number): Promise<void> {
    try {
      await localPool.request()
        .input('changeId', changeId)
        .input('processedAt', new Date())
        .query(`
          UPDATE local_ddl_audit
          SET processed = 1,
              processed_at = @processedAt,
              retry_count = 0
          WHERE id = @changeId
        `);
    } catch (error) {
      throw new Error(`Erro ao marcar mudanca como processada: ${error}`);
    }
  }

  private async markChangeError(localPool: any, changeId: number, error: any): Promise<void> {
    try {
      await localPool.request()
        .input('changeId', changeId)
        .input('errorMessage', error.message || String(error))
        .query(`
          UPDATE local_ddl_audit
          SET retry_count = ISNULL(retry_count, 0) + 1,
              error_message = @errorMessage
          WHERE id = @changeId
        `);
    } catch (updateError) {
      console.error(`Erro ao marcar mudanca ${changeId} com erro:`, updateError);
    }
  }

  getStatus(): { isRunning: boolean; pollingInterval: number; monitoredDatabases: number } {
    return {
      isRunning: this.isRunning,
      pollingInterval: config.audit.pollingInterval,
      monitoredDatabases: config.monitoredDatabases.length,
    };
  }
}

export const pollingWorker = new PollingWorker();
