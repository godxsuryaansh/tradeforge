import { client } from './client.js';
import { reactionRolesService } from '../lib/firebase-admin.js';

function emojiKeyFromReaction(reaction: any): string | null {
  if (reaction.emoji?.id) return `id:${reaction.emoji.id}`;
  if (reaction.emoji?.name) return `u:${reaction.emoji.name}`;
  return null;
}

function normalizeEmojiInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const custom = trimmed.match(/^<a?:\w+:(\d+)>$/);
  if (custom) return `id:${custom[1]}`;
  const idOnly = trimmed.match(/^\d{10,25}$/);
  if (idOnly) return `id:${trimmed}`;
  return `u:${trimmed}`;
}

export function initReactionRoles() {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (!reaction.message.guild) return;

      const settings = await reactionRolesService.getSettings(reaction.message.guild.id);
      if (!settings.enabled || !settings.channelId || !settings.messageId) return;
      if (reaction.message.channelId !== settings.channelId) return;
      if (reaction.message.id !== settings.messageId) return;

      const key = emojiKeyFromReaction(reaction);
      if (!key) return;

      const mapping = (settings.mappings || []).find((m) => normalizeEmojiInput(m.emoji) === key || m.emoji === key);
      if (!mapping) return;

      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      const role = reaction.message.guild.roles.cache.get(mapping.roleId);
      if (!role) return;
      await member.roles.add(role).catch(() => {});
    } catch (e) {
      console.error('Reaction role add error:', e);
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (!reaction.message.guild) return;

      const settings = await reactionRolesService.getSettings(reaction.message.guild.id);
      if (!settings.enabled || !settings.channelId || !settings.messageId) return;
      if (reaction.message.channelId !== settings.channelId) return;
      if (reaction.message.id !== settings.messageId) return;

      const key = emojiKeyFromReaction(reaction);
      if (!key) return;

      const mapping = (settings.mappings || []).find((m) => normalizeEmojiInput(m.emoji) === key || m.emoji === key);
      if (!mapping) return;

      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      const role = reaction.message.guild.roles.cache.get(mapping.roleId);
      if (!role) return;
      await member.roles.remove(role).catch(() => {});
    } catch (e) {
      console.error('Reaction role remove error:', e);
    }
  });
}

export { normalizeEmojiInput };

