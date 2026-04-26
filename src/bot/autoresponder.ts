import { client } from './client.js';
import { autoResponderService } from '../lib/firebase-admin.js';

const userCooldown = new Map<string, number>(); // guild:user -> timestamp
const COOLDOWN_MS = 10_000;

export function initAutoResponder() {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const settings = await autoResponderService.getSettings(message.guild.id);
      if (!settings.enabled) return;

      const key = `${message.guild.id}:${message.author.id}`;
      const last = userCooldown.get(key) ?? 0;
      if (Date.now() - last < COOLDOWN_MS) return;

      const content = (message.content || '').toLowerCase();
      for (const rule of settings.rules || []) {
        const trigger = String(rule.trigger || '').toLowerCase().trim();
        const response = String(rule.response || '').trim();
        if (!trigger || !response) continue;
        if (content.includes(trigger)) {
          userCooldown.set(key, Date.now());
          await message.reply(response).catch(() => {});
          return;
        }
      }
    } catch (e) {
      console.error('Autoresponder error:', e);
    }
  });
}

