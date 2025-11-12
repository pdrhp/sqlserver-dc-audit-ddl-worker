import { Client, GatewayIntentBits, EmbedBuilder, WebhookClient } from 'discord.js';
import { config } from '../config/index.js';

export interface DDLChange {
  id: number;
  databaseName: string;
  serverName: string;
  schemaName?: string;
  objectName: string;
  objectType: string;
  ddlOperation: string;
  ddlStatement?: string;
  loginName?: string;
  userName?: string;
  hostName?: string;
  startTime: Date;
}

export class DiscordService {
  private client?: Client;
  private webhookClient?: WebhookClient;
  private isConnected = false;

  constructor() {
    this.initializeDiscord();
  }


  private validateAndNormalizeWebhookUrl(url: string): string | null {
    try {
      const trimmedUrl = url.trim();
      
      let normalizedUrl = trimmedUrl.replace('discordapp.com', 'discord.com');
      
      const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
      
      if (!webhookPattern.test(normalizedUrl)) {
        console.error('Formato de URL do webhook invalido');
        console.error(`   Formato esperado: https://discord.com/api/webhooks/ID/TOKEN`);
        console.error(`   URL recebida: ${normalizedUrl.substring(0, 50)}...`);
        return null;
      }
      
      return normalizedUrl;
    } catch (error) {
      console.error('Erro ao validar URL do webhook:', error);
      return null;
    }
  }

 
  private async initializeDiscord(): Promise<void> {
    try {
      console.log('Inicializando servico Discord...');

      if (config.discord.webhookUrl && config.discord.webhookUrl.trim() !== '') {
        try {
          const validatedUrl = this.validateAndNormalizeWebhookUrl(config.discord.webhookUrl);
          
          if (!validatedUrl) {
            console.error('URL do webhook invalida - pulando webhook');
            console.log('Tentando usar bot Discord...');
          } else {
            console.log('URL do webhook validada, conectando...');
            this.webhookClient = new WebhookClient({ url: validatedUrl });
            this.isConnected = true;
            console.log('Discord webhook inicializado com sucesso');
            return;
          }
        } catch (webhookError) {
          console.error('Erro ao inicializar webhook Discord:', webhookError);
          console.log('Tentando usar bot Discord...');
        }
      }

      if (config.discord.token && config.discord.token.trim() !== '' &&
          config.discord.channelId && config.discord.channelId.trim() !== '') {
        this.client = new Client({
          intents: [GatewayIntentBits.Guilds]
        });

        this.client.once('ready', () => {
          console.log(`Discord bot conectado como ${this.client?.user?.tag}`);
          this.isConnected = true;
        });

        this.client.on('error', (error) => {
          console.error('Erro no Discord bot:', error);
          this.isConnected = false;
        });

        await this.client.login(config.discord.token.trim());
        return;
      }

      console.log('Discord nao configurado - notificacoes desabilitadas');
      this.isConnected = false;

    } catch (error) {
      console.error('Erro ao inicializar Discord:', error);
      this.isConnected = false;
    }
  }


  async notifyDDLChange(change: DDLChange): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const embed = this.createDDLEmbed(change);

      if (this.webhookClient) {
        await this.webhookClient.send({
          embeds: [embed],
          username: 'SQL DDL Auditor',
          avatarURL: 'https://i.imgur.com/AfFp7pu.png' 
        });
      } else if (this.client && config.discord.channelId) {
        const channel = await this.client.channels.fetch(config.discord.channelId);
        if (channel && 'send' in channel) {
          await (channel as any).send({ embeds: [embed] });
        }
      }

      console.log(`Notificacao Discord enviada para ${change.ddlOperation} ${change.objectType} ${change.objectName}`);

    } catch (error) {
      console.error('Erro ao enviar notificacao Discord:', error);
    }
  }

 
  private createDDLEmbed(change: DDLChange): EmbedBuilder {
    const { main, operation, object } = this.getDDLEmbedConfig(change.ddlOperation, change.objectType);

    const embed = new EmbedBuilder()
      .setColor(main)
      .setTitle(`${operation} ${change.ddlOperation} ${object} - ${change.databaseName}`)
      .setDescription(`**${change.objectType}** \`${change.schemaName ? change.schemaName + '.' : ''}${change.objectName}\``)
      .setTimestamp(change.startTime)
      .setFooter({
        text: `Server: ${change.serverName}`,
        iconURL: 'https://i.imgur.com/1Q9Z9ZQ.png'
      });

    embed.addFields(
      {
        name: 'Usuario',
        value: change.userName || change.loginName || 'Sistema',
        inline: true
      },
      {
        name: 'Data/Hora',
        value: change.startTime.toLocaleString('pt-BR'),
        inline: true
      },
      {
        name: 'Database',
        value: change.databaseName,
        inline: true
      }
    );

    if (change.ddlStatement && change.ddlStatement.length <= 1000) {
      embed.addFields({
        name: 'Comando SQL',
        value: `\`\`\`sql\n${change.ddlStatement}\n\`\`\``,
        inline: false
      });
    } else if (change.ddlStatement && change.ddlStatement.length > 1000) {
      embed.addFields({
        name: 'Comando SQL',
        value: 'Comando muito longo para exibir',
        inline: false
      });
    }

    return embed;
  }

 
  private getDDLEmbedConfig(operation: string, objectType: string): { main: number; operation: string; object: string } {
    const configs = {
      CREATE_TABLE: { main: 0x00FF00, operation: '[CREATE]', object: 'TABLE' },
      ALTER_TABLE: { main: 0xFFFF00, operation: '[ALTER]', object: 'TABLE' },
      DROP_TABLE: { main: 0xFF0000, operation: '[DROP]', object: 'TABLE' },

      CREATE_INDEX: { main: 0x00FF00, operation: '[CREATE]', object: 'INDEX' },
      ALTER_INDEX: { main: 0xFFFF00, operation: '[ALTER]', object: 'INDEX' },
      DROP_INDEX: { main: 0xFF0000, operation: '[DROP]', object: 'INDEX' },

      CREATE_VIEW: { main: 0x00FF00, operation: '[CREATE]', object: 'VIEW' },
      ALTER_VIEW: { main: 0xFFFF00, operation: '[ALTER]', object: 'VIEW' },
      DROP_VIEW: { main: 0xFF0000, operation: '[DROP]', object: 'VIEW' },

      CREATE_PROCEDURE: { main: 0x00FF00, operation: '[CREATE]', object: 'PROCEDURE' },
      ALTER_PROCEDURE: { main: 0xFFFF00, operation: '[ALTER]', object: 'PROCEDURE' },
      DROP_PROCEDURE: { main: 0xFF0000, operation: '[DROP]', object: 'PROCEDURE' },

      CREATE_FUNCTION: { main: 0x00FF00, operation: '[CREATE]', object: 'FUNCTION' },
      ALTER_FUNCTION: { main: 0xFFFF00, operation: '[ALTER]', object: 'FUNCTION' },
      DROP_FUNCTION: { main: 0xFF0000, operation: '[DROP]', object: 'FUNCTION' },

      CREATE_TRIGGER: { main: 0x00FF00, operation: '[CREATE]', object: 'TRIGGER' },
      ALTER_TRIGGER: { main: 0xFFFF00, operation: '[ALTER]', object: 'TRIGGER' },
      DROP_TRIGGER: { main: 0xFF0000, operation: '[DROP]', object: 'TRIGGER' },

      CREATE_SCHEMA: { main: 0x00FF00, operation: '[CREATE]', object: 'SCHEMA' },
      ALTER_SCHEMA: { main: 0xFFFF00, operation: '[ALTER]', object: 'SCHEMA' },
      DROP_SCHEMA: { main: 0xFF0000, operation: '[DROP]', object: 'SCHEMA' },

      default: { main: 0x0099FF, operation: '[DDL]', object: 'OBJECT' }
    };

    const key = `${operation}_${objectType}` as keyof typeof configs;
    return configs[key] || configs.default;
  }

 
  async notifySystemError(error: Error, context: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('[ERRO] Sistema DDL Auditor')
        .setDescription(`**Contexto:** ${context}`)
        .addFields({
          name: 'Erro',
          value: error.message.length > 1000 ? error.message.substring(0, 1000) + '...' : error.message,
          inline: false
        })
        .setTimestamp()
        .setFooter({
          text: 'SQL DDL Audit Worker',
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        });

      if (this.webhookClient) {
        await this.webhookClient.send({
          embeds: [embed],
          username: 'SQL DDL Auditor - Sistema',
          avatarURL: 'https://i.imgur.com/AfFp7pu.png'
        });
      } else if (this.client && config.discord.channelId) {
        const channel = await this.client.channels.fetch(config.discord.channelId);
        if (channel && 'send' in channel) {
          await (channel as any).send({ embeds: [embed] });
        }
      }

      console.log('Notificacao de erro enviada para Discord');

    } catch (notifyError) {
      console.error('Erro ao enviar notificacao de erro para Discord:', notifyError);
    }
  }

 
  async notifySystemStatus(status: string, details?: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('[STATUS] Sistema DDL Auditor')
        .setDescription(status)
        .setTimestamp()
        .setFooter({
          text: 'SQL DDL Audit Worker',
          iconURL: 'https://i.imgur.com/AfFp7pu.png'
        });

      if (details) {
        embed.addFields({
          name: 'Detalhes',
          value: details,
          inline: false
        });
      }

      if (this.webhookClient) {
        await this.webhookClient.send({
          embeds: [embed],
          username: 'SQL DDL Auditor - Sistema',
          avatarURL: 'https://i.imgur.com/AfFp7pu.png'
        });
      } else if (this.client && config.discord.channelId) {
        const channel = await this.client.channels.fetch(config.discord.channelId);
        if (channel && 'send' in channel) {
          await (channel as any).send({ embeds: [embed] });
        }
      }

    } catch (error) {
      console.error('Erro ao enviar notificacao de status para Discord:', error);
    }
  }

 
  async close(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      console.log('Discord bot desconectado');
    }

    if (this.webhookClient) {
      this.webhookClient.destroy();
      console.log('Discord webhook desconectado');
    }

    this.isConnected = false;
  }

 
  getStatus(): { isConnected: boolean; type: 'bot' | 'webhook' | 'none' } {
    if (this.webhookClient) {
      return { isConnected: this.isConnected, type: 'webhook' };
    } else if (this.client) {
      return { isConnected: this.isConnected, type: 'bot' };
    } else {
      return { isConnected: false, type: 'none' };
    }
  }
}


export const discordService = new DiscordService();
