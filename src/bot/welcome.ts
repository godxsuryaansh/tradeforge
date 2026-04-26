import { EmbedBuilder, ChannelType } from 'discord.js';
import { client } from './client.js';
import { welcomeService, autoRoleService } from '../lib/firebase-admin.js';
import { logModAction } from './commands/mod-utils.js';

function applyTemplate(template: string, ctx: { user: string; server: string; memberCount: string }) {
  return template
    .replaceAll('{user}', ctx.user)
    .replaceAll('{server}', ctx.server)
    .replaceAll('{memberCount}', ctx.memberCount);
}

function findChannel(guild: any, channelId: string | null) {
  if (!channelId) return null;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return null;
  if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) return null;
  return ch;
}

export function initWelcomeAndGoodbye() {
  client.on('guildMemberAdd', async (member) => {
    try {
      // Auto role (E) piggybacked here for reliable member add
      const autoRoleSettings = await autoRoleService.getSettings(member.guild.id);
      if (autoRoleSettings.enabled && autoRoleSettings.roleIds.length) {
        for (const roleId of autoRoleSettings.roleIds) {
          const role = member.guild.roles.cache.get(roleId);
          if (role) await member.roles.add(role).catch(() => {});
        }
      }

      const settings = await welcomeService.getSettings(member.guild.id);
      if (!settings.enabled) return;

      const channel = findChannel(member.guild, settings.channelId);
      if (!channel) return;

      const text = applyTemplate(settings.welcomeTemplate, {
        user: `${member}`,
        server: member.guild.name,
        memberCount: String(member.guild.memberCount),
      });

      const embed = new EmbedBuilder()
        .setTitle('🟧 Welcome')
        .setDescription(text)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor(0xff6321)
        .setTimestamp();

      await (channel as any).send({ embeds: [embed] });
    } catch (e) {
      console.error('Welcome error:', e);
    }
  });

  client.on('guildMemberRemove', async (member) => {
    try {
      const settings = await welcomeService.getSettings(member.guild.id);
      if (!settings.enabled) return;

      const channel = findChannel(member.guild, settings.channelId);
      if (!channel) return;

      const text = applyTemplate(settings.goodbyeTemplate, {
        user: `${member.user}`,
        server: member.guild.name,
        memberCount: String(member.guild.memberCount),
      });

      const embed = new EmbedBuilder()
        .setTitle('🟧 Goodbye')
        .setDescription(text)
        .setColor(0xff6321)
        .setTimestamp();

      await (channel as any).send({ embeds: [embed] });
    } catch (e) {
      console.error('Goodbye error:', e);
    }
  });

  // Log when welcome system is active but missing channel, etc. (lightweight)
  client.on('ready', async () => {
    for (const [, guild] of client.guilds.cache) {
      const settings = await welcomeService.getSettings(guild.id);
      if (!settings.enabled) continue;
      const channel = findChannel(guild, settings.channelId);
      if (!channel) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Welcome System')
          .setDescription('Welcome is enabled but the configured channel is missing or invalid.')
          .setColor(0xffa500)
          .setTimestamp();
        await logModAction(guild, embed).catch(() => {});
      }
    }
  });
}

