import mssql from 'mssql';
import { config, DatabaseConfig } from '../config/index.js';
import { DatabaseService } from './database.js';

export class ValidationService {
 
  static async validateAllDatabases(): Promise<void> {
    console.log('Iniciando validacao de todas as configuracoes SQL Server...');

    console.log('Validando banco central de auditoria...');
    await this.validateDatabaseConnection(config.auditDatabase);

    console.log('Validando bancos monitorados...');
    for (const dbConfig of config.monitoredDatabases) {
      await this.validateDatabaseConnection(dbConfig);
    }

    console.log('Todas as validacoes SQL Server concluídas com sucesso!');
  }

  static async validateDatabaseConnection(dbConfig: DatabaseConfig): Promise<void> {
    try {
      console.log(`\n--- Validando ${dbConfig.name} ---`);

      const connected = await DatabaseService.testConnection(dbConfig);
      if (!connected) {
        throw new Error(`Falha na conexao com ${dbConfig.name}`);
      }

      const pool = await DatabaseService.getConnectionPool(dbConfig);

      await DatabaseService.validatePermissions(pool, dbConfig);

      if (dbConfig.name === 'audit') {
        await this.validateAuditDatabase(pool, dbConfig);
      } else {
        await this.validateMonitoredDatabase(pool, dbConfig);
      }

      console.log(`[OK] ${dbConfig.name} validado com sucesso`);

    } catch (error) {
      console.error(`[ERRO] Falha na validacao de ${dbConfig.name}:`, error);
      throw error;
    }
  }

  private static async validateAuditDatabase(pool: any, config: DatabaseConfig): Promise<void> {
    console.log('Validando estrutura do banco de auditoria...');

    const auditTableScript = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='schema_audit_log' AND xtype='U')
      CREATE TABLE schema_audit_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        database_name NVARCHAR(128) NOT NULL,
        server_name NVARCHAR(128) NOT NULL,
        schema_name NVARCHAR(128),
        object_name NVARCHAR(128) NOT NULL,
        object_type NVARCHAR(50) NOT NULL,
        ddl_operation NVARCHAR(20) NOT NULL,
        ddl_statement NVARCHAR(MAX),
        event_data XML,
        login_name NVARCHAR(128),
        user_name NVARCHAR(128),
        host_name NVARCHAR(128),
        application_name NVARCHAR(128),
        spid INT,
        start_time DATETIME2 NOT NULL DEFAULT GETDATE(),
        processed BIT NOT NULL DEFAULT 0,
        processed_at DATETIME2 NULL,
        discord_notified BIT NOT NULL DEFAULT 0,
        discord_notified_at DATETIME2 NULL,
        error_message NVARCHAR(MAX),
        retry_count INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
      );

      -- Índices para otimização
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_schema_audit_log_processed')
      CREATE INDEX IX_schema_audit_log_processed ON schema_audit_log (processed);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_schema_audit_log_database_start_time')
      CREATE INDEX IX_schema_audit_log_database_start_time ON schema_audit_log (database_name, start_time);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_schema_audit_log_created_at')
      CREATE INDEX IX_schema_audit_log_created_at ON schema_audit_log (created_at);
    `;

    await DatabaseService.createTableIfNotExists(
      pool,
      'schema_audit_log',
      auditTableScript,
      'dbo'
    );

    try {
      await pool.request().query(`
        INSERT INTO schema_audit_log (
          database_name, server_name, object_name, object_type,
          ddl_operation, ddl_statement, login_name, processed
        ) VALUES (
          'test', 'test-server', 'test_table', 'TABLE',
          'CREATE', 'CREATE TABLE test (id INT)', 'test_user', 1
        );

        DELETE FROM schema_audit_log
        WHERE database_name = 'test' AND processed = 1;
      `);
      console.log('Permissoes de INSERT/DELETE validadas no banco de auditoria');
    } catch (error) {
      throw new Error(`Falha nas permissoes DML no banco de auditoria: ${error}`);
    }
  }

  private static async validateMonitoredDatabase(pool: any, config: DatabaseConfig): Promise<void> {
    console.log('Validando estrutura do banco monitorado...');

    const localAuditTableScript = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='local_ddl_audit' AND xtype='U')
      CREATE TABLE local_ddl_audit (
        id INT IDENTITY(1,1) PRIMARY KEY,
        event_type NVARCHAR(100) NOT NULL,
        object_type NVARCHAR(50),
        object_name NVARCHAR(128),
        schema_name NVARCHAR(128),
        ddl_statement NVARCHAR(MAX),
        event_data XML NOT NULL,
        login_name NVARCHAR(128),
        user_name NVARCHAR(128),
        host_name NVARCHAR(128),
        application_name NVARCHAR(128),
        spid INT,
        start_time DATETIME2 NOT NULL DEFAULT GETDATE(),
        processed BIT NOT NULL DEFAULT 0,
        processed_at DATETIME2 NULL,
        error_message NVARCHAR(MAX),
        retry_count INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
      );

      -- Índices para otimização
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_local_ddl_audit_processed')
      CREATE INDEX IX_local_ddl_audit_processed ON local_ddl_audit (processed);

      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_local_ddl_audit_created_at')
      CREATE INDEX IX_local_ddl_audit_created_at ON local_ddl_audit (created_at);
    `;

    await DatabaseService.createTableIfNotExists(
      pool,
      'local_ddl_audit',
      localAuditTableScript,
      'dbo'
    );

    const triggerExists = await this.checkDDLTriggerExists(pool);
    if (!triggerExists) {
      console.log('DDL Trigger nao encontrado. Criando automaticamente...');
      await this.createDDLTrigger(pool, config);
      console.log('DDL Trigger criado com sucesso.');
    } else {
      console.log('DDL Trigger encontrado e validado.');
    }

    await this.testDDLTrigger(pool, config);

    try {
      await pool.request().query(`
        CREATE TABLE #temp_test_permissions (id INT);
        DROP TABLE #temp_test_permissions;
      `);
      console.log('Permissoes DDL validadas no banco monitorado');
    } catch (error) {
      throw new Error(`Falha nas permissoes DDL no banco monitorado: ${error}`);
    }
  }

  private static async checkDDLTriggerExists(pool: any): Promise<boolean> {
    try {
      const result = await pool.request().query(`
        SELECT COUNT(*) as count
        FROM sys.triggers t
        INNER JOIN sys.objects o ON t.object_id = o.object_id
        WHERE o.name = 'ddl_audit_trigger' AND t.is_disabled = 0
      `);

      return result.recordset[0].count > 0;
    } catch (error) {
      console.error('Erro ao verificar existencia do DDL trigger:', error);
      return false;
    }
  }


  private static async createDDLTrigger(pool: any, config: DatabaseConfig): Promise<void> {
    try {
      console.log(`Criando DDL Trigger no banco ${config.name}...`);

      try {
        await pool.request().query('DROP TRIGGER IF EXISTS [ddl_audit_trigger] ON DATABASE;');
      } catch (error) {
      }

      const triggerScript = `
        CREATE TRIGGER [ddl_audit_trigger]
        ON DATABASE
        FOR CREATE_TABLE, ALTER_TABLE, DROP_TABLE,
            CREATE_INDEX, ALTER_INDEX, DROP_INDEX,
            CREATE_SCHEMA, ALTER_SCHEMA, DROP_SCHEMA,
            CREATE_VIEW, ALTER_VIEW, DROP_VIEW,
            CREATE_PROCEDURE, ALTER_PROCEDURE, DROP_PROCEDURE,
            CREATE_FUNCTION, ALTER_FUNCTION, DROP_FUNCTION,
            CREATE_TRIGGER, ALTER_TRIGGER, DROP_TRIGGER
        AS
        BEGIN
            SET NOCOUNT ON;

            DECLARE @data XML;
            DECLARE @schema sysname;
            DECLARE @object sysname;
            DECLARE @type sysname;
            DECLARE @login sysname;
            DECLARE @user sysname;
            DECLARE @host sysname;
            DECLARE @app sysname;
            DECLARE @spid int;
            DECLARE @event_type sysname;
            DECLARE @sql_command nvarchar(max);

            -- Capturar dados do evento
            SET @data = EVENTDATA();
            SET @event_type = @data.value('(/EVENT_INSTANCE/EventType)[1]', 'sysname');
            SET @schema = @data.value('(/EVENT_INSTANCE/SchemaName)[1]', 'sysname');
            SET @object = @data.value('(/EVENT_INSTANCE/ObjectName)[1]', 'sysname');
            SET @type = @data.value('(/EVENT_INSTANCE/ObjectType)[1]', 'sysname');
            SET @login = @data.value('(/EVENT_INSTANCE/LoginName)[1]', 'sysname');
            SET @user = @data.value('(/EVENT_INSTANCE/UserName)[1]', 'sysname');
            SET @host = @data.value('(/EVENT_INSTANCE/HostName)[1]', 'sysname');
            SET @app = @data.value('(/EVENT_INSTANCE/ApplicationName)[1]', 'sysname');
            SET @spid = @data.value('(/EVENT_INSTANCE/SPID)[1]', 'int');
            SET @sql_command = @data.value('(/EVENT_INSTANCE/TSQLCommand)[1]', 'nvarchar(max)');

            -- Inserir na tabela de auditoria local
            INSERT INTO dbo.local_ddl_audit (
                event_type, object_type, object_name, schema_name,
                ddl_statement, event_data, login_name, user_name,
                host_name, application_name, spid, start_time
            )
            VALUES (
                @event_type, @type, @object, @schema,
                @sql_command, @data, @login, @user, @host, @app, @spid, GETDATE()
            );
        END;
      `;

      await pool.request().query(triggerScript);

      await pool.request().query('ENABLE TRIGGER [ddl_audit_trigger] ON DATABASE;');

      console.log(`DDL Trigger criado e habilitado no banco ${config.name}`);

    } catch (error) {
      throw new Error(`Erro ao criar DDL trigger no banco ${config.name}: ${error}`);
    }
  }

  private static async testDDLTrigger(pool: any, config: DatabaseConfig): Promise<void> {
    try {
      console.log(`Testando DDL Trigger no banco ${config.name}...`);

      const testTableName = `temp_test_trigger_${Date.now()}`;

      await pool.request().query(`
        DELETE FROM dbo.local_ddl_audit
        WHERE object_name LIKE 'temp_test_trigger_%'
          AND event_type IN ('CREATE_TABLE', 'DROP_TABLE')
      `);

      await pool.request().query(`
        CREATE TABLE dbo.[${testTableName}] (
          id INT IDENTITY(1,1) PRIMARY KEY,
          test_column VARCHAR(50) DEFAULT 'test'
        );
      `);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const createResult = await pool.request()
        .input('tableName', testTableName)
        .query(`
          SELECT COUNT(*) as count
          FROM dbo.local_ddl_audit
          WHERE object_name = @tableName
            AND event_type = 'CREATE_TABLE'
            AND processed = 0
        `);

      if (createResult.recordset[0].count === 0) {
        throw new Error('DDL Trigger não capturou a operação CREATE TABLE');
      }

      await pool.request().query(`DROP TABLE dbo.[${testTableName}];`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const dropResult = await pool.request()
        .input('tableName', testTableName)
        .query(`
          SELECT COUNT(*) as count
          FROM dbo.local_ddl_audit
          WHERE object_name = @tableName
            AND event_type = 'DROP_TABLE'
            AND processed = 0
        `);

      if (dropResult.recordset[0].count === 0) {
        throw new Error('DDL Trigger não capturou a operação DROP TABLE');
      }

      console.log(`DDL Trigger funcionando corretamente no banco ${config.name}`);

    } catch (error) {
      throw new Error(`Falha no teste do DDL trigger no banco ${config.name}: ${error}`);
    }
  }
}
