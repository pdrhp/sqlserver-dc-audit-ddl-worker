import { config } from './config/index.js';
import { ValidationService } from './services/validation.js';
import { DatabaseService } from './services/database.js';
import { pollingWorker } from './services/polling-worker.js';
import { discordService } from './services/discord.js';

async function main() {
  try {
    console.log('Iniciando SQL Server DDL Audit Worker...');

    console.log(`Bancos monitorados: ${config.monitoredDatabases.length}`);
    console.log(`Intervalo de polling: ${config.audit.pollingInterval}s`);
    console.log(`Discord configurado: ${config.discord.channelId ? 'Channel ID' : 'Webhook'}`);

    console.log('Configuracao validada com sucesso!');

    await ValidationService.validateAllDatabases();

    console.log('Sistema pronto para iniciar operacoes!');

    const discordStatus = discordService.getStatus();
    const statusMessage = `Sistema DDL Auditor inicializado com sucesso!\n\n**Status:**\n• Bancos monitorados: ${config.monitoredDatabases.length}\n• Polling interval: ${config.audit.pollingInterval}s\n• Discord: ${discordStatus.isConnected ? `[OK] ${discordStatus.type}` : '[OFFLINE] Nao configurado'}`;

    await discordService.notifySystemStatus('Sistema Online', statusMessage);

    await pollingWorker.start();

    console.log('Sistema totalmente operacional!');

  } catch (error) {
    console.error('Erro na inicializacao:', error);

    if (error instanceof Error) {
      await discordService.notifySystemError(error, 'Falha na inicialização do sistema');
    }

    process.exit(1);
  }
}

async function gracefulShutdown(signal: string) {
  console.log(`\nRecebido ${signal}, encerrando...`);

  try {
    await discordService.notifySystemStatus('Sistema Encerrando', 'Shutdown graceful iniciado');

    await pollingWorker.stop();

    await discordService.close();

    await DatabaseService.closeAllPools();

    console.log('Shutdown concluido com sucesso');
  } catch (error) {
    console.error('Erro durante shutdown:', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

main().catch(console.error);
