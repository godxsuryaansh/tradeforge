import { GoogleGenAI } from '@google/genai';
import { client } from './client.js';
import { aiService } from '../lib/firebase-admin.js';

const MODEL = 'gemini-2.5-flash';
const USER_COOLDOWN_MS = 8_000;
const CHANNEL_COOLDOWN_MS = 2_000;

const userCooldown = new Map<string, number>(); // guild:user -> ms
const channelCooldown = new Map<string, number>(); // guild:channel -> ms

function trimToDiscord(text: string): string {
  const t = String(text || '').trim();
  if (t.length <= 1900) return t;
  return t.slice(0, 1900) + '…';
}

async function buildContext(message: any) {
  const channel = message.channel;
  const msgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const lines: string[] = [];
  if (msgs) {
    const arr = Array.from((msgs as any).values()).reverse();
    for (const m of arr as any[]) {
      if (!m?.content) continue;
      if (m?.author?.bot) continue;
      lines.push(`${m.author.username}: ${m.content}`);
    }
  }
  return lines.join('\n');
}

export function initAiChat() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY missing. AI chat will not work.');
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const settings = await aiService.getSettings(message.guild.id);
      if (!settings.enabled || !settings.channelId) return;
      if (message.channel.id !== settings.channelId) return;

      const now = Date.now();
      const userKey = `${message.guild.id}:${message.author.id}`;
      const chanKey = `${message.guild.id}:${message.channel.id}`;
      const lastUser = userCooldown.get(userKey) ?? 0;
      const lastChan = channelCooldown.get(chanKey) ?? 0;

      if (now - lastUser < USER_COOLDOWN_MS || now - lastChan < CHANNEL_COOLDOWN_MS) {
        // low-cost feedback
        await message.react('🤖').catch(() => {});
        return;
      }

      userCooldown.set(userKey, now);
      channelCooldown.set(chanKey, now);

      if (settings.mode === 'react') {
        await message.react('🤖').catch(() => {});
        return;
      }

      const guildOwnerId = message.guild.ownerId;
      const memory = settings.memoryText || '';
      const personality = settings.personalityText || '';
      const ctx = await buildContext(message);

      const system = [
        'You are a helpful Discord community assistant.',
        'Follow server rules. Be concise and friendly.',
        'Do not output secrets or tokens. If asked for secrets, refuse.',
        `Server owner userId is: ${guildOwnerId}. Treat them as the owner.`,
        personality ? `Personality:\n${personality}` : '',
        memory ? `Memory:\n${memory}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const prompt = `Recent chat:\n${ctx}\n\nUser message:\n${message.author.username}: ${message.content}\n\nRespond as the bot.`;

      const res = await ai.models.generateContent({
        model: MODEL,
        contents: [
          { role: 'user', parts: [{ text: system + '\n\n' + prompt }] },
        ],
      });

      const text = trimToDiscord((res as any).text || '');
      if (!text) return;

      await message.reply(text).catch(async () => {
        await message.channel.send(text).catch(() => {});
      });
    } catch (e) {
      console.error('AI chat error:', e);
    }
  });
}
