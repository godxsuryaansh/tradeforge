import { client } from './client.ts';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.ts';
import { autoModService } from '../lib/firebase-admin.ts';

const messageHistory = new Map<string, { content: string; timestamp: number }>();

function extractHostnames(content: string): string[] {
  const urls = content.match(/\bhttps?:\/\/[^\s<>()]+/gi) || [];
  const hosts: string[] = [];
  for (const rawUrl of urls) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      hosts.push(host.startsWith('www.') ? host.slice(4) : host);
    } catch {
      // ignore
    }
  }
  return hosts;
}

function isHostAllowed(host: string, allowed: string[]): boolean {
  const normalizedAllowed = (allowed || [])
    .map((a) => a.toLowerCase().replace(/^www\./, '').trim())
    .filter(Boolean);
  for (const a of normalizedAllowed) {
    if (host === a) return true;
    if (host.endsWith(`.${a}`)) return true;
  }
  return false;
}

function findLogChannel(message: any) {
  const guild = message.guild;
  if (!guild) return null;

  const byName = (name: string) =>
    guild.channels.cache.find(
      (c: any) => c?.isTextBased?.() && typeof c?.name === 'string' && c.name.toLowerCase() === name,
    );

  return byName('automod-logs') || byName('mod-logs') || null;
}

export function initAutoMod() {
  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const settings = await autoModService.getSettings(message.guild.id);
    if (!settings.enabled) return;

    // Permissions check - skip staff
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    if (settings.whitelistedRoles.some((roleId) => message.member?.roles.cache.has(roleId))) return;
    if (settings.whitelistedChannels.includes(message.channel.id)) return;

    let flagReason: string | null = null;
    const content = message.content ?? '';

    // 1. Badwords
    if (settings.badWords.some((word) => content.toLowerCase().includes(word.toLowerCase()))) {
      flagReason = 'Banned Word Detected';
    }

    // 1b. Link filtering
    if (!flagReason) {
      const hosts = extractHostnames(content);
      if (hosts.length) {
        const anyBlocked = hosts.some((h) => !isHostAllowed(h, settings.linkWhitelist));
        if (anyBlocked) flagReason = 'Unapproved Link';
      }
    }

    // 2. Mention Limit
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (!flagReason && mentions > settings.mentionLimit) {
      flagReason = 'Excessive Mentions';
    }

    // 3. Emoji Limit
    const emojiRegex =
      /<a?:.+?:\d+>|[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{2139}\u{24c2}\u{23e9}-\u{23ef}\u{23f0}\u{23f3}]/gu;
    const emojiCount = (content.match(emojiRegex) || []).length;
    if (!flagReason && emojiCount > settings.emojiLimit) {
      flagReason = 'Emoji Overload';
    }

    // 4. Caps Limit
    const upperCaseCount = (content.match(/[A-Z]/g) || []).length;
    const totalLettersCount = (content.match(/[a-zA-Z]/g) || []).length;
    if (!flagReason && totalLettersCount > 10) {
      const capsPercent = (upperCaseCount / totalLettersCount) * 100;
      if (capsPercent > settings.capsLimit) {
        flagReason = 'Too Many Caps';
      }
    }

    // 5. Duplicate Detection
    if (!flagReason && settings.duplicateDetect) {
      const lastMsg = messageHistory.get(message.author.id);
      if (lastMsg && lastMsg.content === content && Date.now() - lastMsg.timestamp < 5000) {
        flagReason = 'Duplicate Message Spam';
      }
      messageHistory.set(message.author.id, { content, timestamp: Date.now() });
    }

    if (!flagReason) return;

    try {
      await message.delete();

      if (settings.loggingEnabled) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🛡️ AutoMod Action')
          .setDescription(`Filtered message from **${message.author.tag}** in ${message.channel}`)
          .addFields(
            { name: 'Reason', value: flagReason, inline: true },
            { name: 'Action Taken', value: settings.punishment.toUpperCase(), inline: true },
          )
          .setColor(0xff6321)
          .setTimestamp();

        const logChannel = findLogChannel(message);
        if (logChannel) await logChannel.send({ embeds: [logEmbed] });
      }

      // Apply Punishment
      const member = message.member;
      if (!member) return;

      switch (settings.punishment) {
        case 'warn':
          await message.channel
            .send(`⚠️ ${message.author}, watch your language/behavior! [${flagReason}]`)
            .then((m: any) => setTimeout(() => m.delete().catch(() => {}), 3000));
          break;
        case 'mute':
          await member.timeout(10 * 60 * 1000, `AutoMod: ${flagReason}`);
          break;
        case 'kick':
          await member.kick(`AutoMod: ${flagReason}`);
          break;
        case 'ban':
          await member.ban({ reason: `AutoMod: ${flagReason}` });
          break;
      }
    } catch (err) {
      console.error('AutoMod Execution Error:', err);
    }
  });
}

