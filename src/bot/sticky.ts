import { client } from './client.ts';
import { stickyService } from '../lib/firebase-admin.ts';

const counters = new Map<string, number>(); // guild:channel -> count

export function initStickyMessages() {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const key = `${message.guild.id}:${message.channel.id}`;
      const settings = await stickyService.getChannelSettings(message.guild.id, message.channel.id);
      if (!settings.enabled || !settings.message) return;

      const current = (counters.get(key) ?? 0) + 1;
      counters.set(key, current);

      const every = Math.max(1, Math.floor(settings.everyNMessages || 10));
      if (current < every) return;

      counters.set(key, 0);

      // Delete previous sticky if exists
      if (settings.lastStickyMessageId) {
        const prev = await message.channel.messages.fetch(settings.lastStickyMessageId).catch(() => null);
        if (prev) await prev.delete().catch(() => {});
      }

      const stickyMsg = await (message.channel as any).send(settings.message).catch(() => null);
      if (stickyMsg) {
        await stickyService.updateChannelSettings(message.guild.id, message.channel.id, { lastStickyMessageId: stickyMsg.id });
      }
    } catch (e) {
      console.error('Sticky message error:', e);
    }
  });
}

