import { client } from './client.js';
import { economyService } from '../lib/firebase-admin.js';

const lastEarn = new Map<string, number>(); // guild:user -> ms

export function initEconomy() {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const settings = await economyService.getSettings(message.guild.id);
      if (!settings.enabled) return;
      if (!settings.messageEarningsEnabled) return;

      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const last = lastEarn.get(key) ?? 0;
      if (now - last < settings.earnCooldownMs) return;
      lastEarn.set(key, now);

      const earn = Math.max(0, Math.floor(settings.earnPerMessage || 0));
      if (!earn) return;

      await economyService.addBalance(message.guild.id, message.author.id, earn, { lastEarnAt: new Date(now).toISOString() });
    } catch (e) {
      console.error('Economy earn error:', e);
    }
  });
}
