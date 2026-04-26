import { ChannelType, EmbedBuilder } from 'discord.js';
import { client } from './client.ts';
import { levelsService } from '../lib/firebase-admin.ts';
import { logModAction } from './commands/mod-utils.ts';

function levelFromXp(xp: number): number {
  // Simple curve: level^2 * 100 XP
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

export async function initLevels() {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const settings = await levelsService.getSettings(message.guild.id);
      if (!settings.enabled) return;

      const state = await levelsService.getUserState(message.guild.id, message.author.id);

      const now = Date.now();
      const last = state.lastMessageAt ? Date.parse(state.lastMessageAt) : 0;
      if (last && now - last < settings.messageCooldownMs) return;

      const newXp = (state.xp || 0) + Math.max(0, Math.floor(settings.xpPerMessage || 0));
      const oldLevel = state.level || levelFromXp(state.xp || 0);
      const newLevel = levelFromXp(newXp);

      await levelsService.setUserState(message.guild.id, message.author.id, {
        xp: newXp,
        level: newLevel,
        lastMessageAt: new Date(now).toISOString(),
      });

      if (newLevel <= oldLevel) return;

      // Reward roles
      const rewards = (settings.rewardRoles || []).filter((r) => Number(r.level) === newLevel);
      if (rewards.length) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) {
          for (const reward of rewards) {
            const role = message.guild.roles.cache.get(reward.roleId);
            if (role) await member.roles.add(role).catch(() => {});
          }
        }
      }

      // Announce
      const announceChannel =
        (settings.announceChannelId && message.guild.channels.cache.get(settings.announceChannelId)) ||
        null;

      const embed = new EmbedBuilder()
        .setTitle('🟧 Level Up!')
        .setDescription(`${message.author} reached **Level ${newLevel}**!`)
        .setColor(0xff6321)
        .setTimestamp();

      if (announceChannel && (announceChannel as any).isTextBased?.() && announceChannel.type === ChannelType.GuildText) {
        await (announceChannel as any).send({ embeds: [embed] }).catch(() => {});
      } else {
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }

      if (settings.loggingEnabled) {
        const log = new EmbedBuilder()
          .setTitle('📈 Level Up Log')
          .addFields(
            { name: 'User', value: `${message.author} (\`${message.author.id}\`)` },
            { name: 'New Level', value: String(newLevel), inline: true },
            { name: 'XP', value: String(newXp), inline: true },
          )
          .setColor(0x00aa00)
          .setTimestamp();
        await logModAction(message.guild, log).catch(() => {});
      }
    } catch (e) {
      console.error('Levels error:', e);
    }
  });
}

