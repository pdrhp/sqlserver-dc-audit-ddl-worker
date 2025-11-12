import mssql from 'mssql';
import { DatabaseConfig } from '../config/index.js';

export class DatabaseService {
  private static connectionPools: Map<string, any> = new Map();

 
  static async testConnection(config: DatabaseConfig): Promise<boolean> {
    let pool: any = null;

    try {
      console.log(`Testando conexao com ${config.name} (${config.server}:${config.port}/${config.database})`);

      pool = new mssql.ConnectionPool({
        server: config.server,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        options: {
          trustServerCertificate: config.trustServerCertificate,
          enableArithAbort: true,
          connectTimeout: config.connectTimeout,
          requestTimeout: config.requestTimeout,
        },
        pool: config.pool,
      });

      await pool.connect();
      console.log(`Conexao com ${config.name} estabelecida com sucesso`);

      return true;
    } catch (error) {
      console.error(`Erro ao conectar com ${config.name}:`, error);
      return false;
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

 
  static async getConnectionPool(config: DatabaseConfig): Promise<any> {
    const poolKey = `${config.name}-${config.server}-${config.database}`;

    if (this.connectionPools.has(poolKey)) {
      const existingPool = this.connectionPools.get(poolKey)!;
      if (existingPool.connected) {
        return existingPool;
      } else {
        await existingPool.close();
        this.connectionPools.delete(poolKey);
      }
    }

    console.log(`Criando pool de conexoes para ${config.name}`);

    const pool = new mssql.ConnectionPool({
      server: config.server,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        trustServerCertificate: config.trustServerCertificate,
        enableArithAbort: true,
        connectTimeout: config.connectTimeout,
        requestTimeout: config.requestTimeout,
      },
      pool: config.pool,
    });

    await pool.connect();
    this.connectionPools.set(poolKey, pool);

    console.log(`Pool de conexoes criado para ${config.name}`);
    return pool;
  }

  static async closeAllPools(): Promise<void> {
    console.log('Fechando todos os pools de conexao...');

    const closePromises = Array.from(this.connectionPools.values()).map(async (pool) => {
      try {
        await pool.close();
      } catch (error) {
        console.error('Erro ao fechar pool:', error);
      }
    });

    await Promise.all(closePromises);
    this.connectionPools.clear();

    console.log('Todos os pools foram fechados');
  }

  static async validatePermissions(pool: any, config: DatabaseConfig): Promise<void> {
    try {
      console.log(`Validando permissoes no banco ${config.name}`);

      const selectTest = await pool.request().query('SELECT 1 as test');
      if (!selectTest.recordset || selectTest.recordset.length === 0) {
        throw new Error('Falha no teste de SELECT');
      }

      const schemaTest = await pool.request().query(`
        SELECT TOP 1 TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
      `);

      if (!schemaTest.recordset) {
        throw new Error('Falha ao acessar INFORMATION_SCHEMA');
      }

      console.log(`Permissoes validadas para ${config.name}`);
    } catch (error) {
      throw new Error(`Erro na validacao de permissoes para ${config.name}: ${error}`);
    }
  }


  static async tableExists(pool: any, tableName: string, schema: string = 'dbo'): Promise<boolean> {
    try {
      const result = await pool.request()
        .input('schema', mssql.NVarChar, schema)
        .input('table', mssql.NVarChar, tableName)
        .query(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = @schema
            AND TABLE_NAME = @table
            AND TABLE_TYPE = 'BASE TABLE'
        `);

      return result.recordset[0].count > 0;
    } catch (error) {
      console.error(`Erro ao verificar existencia da tabela ${schema}.${tableName}:`, error);
      return false;
    }
  }

  static async createTableIfNotExists(
    pool: any,
    tableName: string,
    createScript: string,
    schema: string = 'dbo'
  ): Promise<void> {
    try {
      const exists = await this.tableExists(pool, tableName, schema);
      if (!exists) {
        console.log(`Criando tabela ${schema}.${tableName}`);
        await pool.request().query(createScript);
        console.log(`Tabela ${schema}.${tableName} criada com sucesso`);
      } else {
        console.log(`Tabela ${schema}.${tableName} ja existe`);
      }
    } catch (error) {
      throw new Error(`Erro ao criar tabela ${schema}.${tableName}: ${error}`);
    }
  }
}
