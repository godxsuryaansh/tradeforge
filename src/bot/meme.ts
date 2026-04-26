import { EmbedBuilder, ChannelType } from 'discord.ts';
import { memeService } from '../lib/firebase-admin.ts';
import { logModAction } from './commands/mod-utils.ts';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

type MemeResult = {
  title: string;
  url: string;
  postLink?: string;
  author?: string;
  source?: string;
};

async function fetchRandomMeme(): Promise<MemeResult> {
  // Public JSON endpoint; keep it simple and SFW-filtered.
  // If the endpoint is down or returns NSFW, we retry a few times.
  const endpoints = [
    'https://meme-api.com/gimme',
    'https://meme-api.com/gimme/memes',
    'https://meme-api.com/gimme/dankmemes',
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const res = await fetch(endpoint, { headers: { 'accept': 'application/json' } });
    if (!res.ok) continue;
    const data: any = await res.json();

    const nsfw = Boolean(data.nsfw);
    const spoiler = Boolean(data.spoiler);
    const url = String(data.url || '');
    const title = String(data.title || 'Meme');
    if (!url || nsfw || spoiler) continue;

    return {
      title,
      url,
      postLink: typeof data.postLink === 'string' ? data.postLink : undefined,
      author: typeof data.author === 'string' ? data.author : undefined,
      source: typeof data.subreddit === 'string' ? data.subreddit : undefined,
    };
  }

  throw new Error('Failed to fetch a safe meme after retries.');
}

export async function postMemeToGuild(guild: any, reason: string) {
  const settings = await memeService.getSettings(guild.id);
  if (!settings.enabled || !settings.channelId) return { posted: false, message: 'Meme auto-post disabled or channel not set.' };

  const channel = guild.channels.cache.get(settings.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return { posted: false, message: 'Configured meme channel is missing or not a text channel.' };
  }

  const meme = await fetchRandomMeme();

  const embed = new EmbedBuilder()
    .setTitle(meme.title)
    .setImage(meme.url)
    .setColor(0xff6321)
    .setTimestamp();

  if (meme.postLink) embed.setURL(meme.postLink);
  if (meme.author || meme.source) {
    embed.setFooter({ text: [meme.source ? `r/${meme.source}` : null, meme.author ? `by ${meme.author}` : null].filter(Boolean).join(' • ') });
  }

  await channel.send({ embeds: [embed] });
  await memeService.updateSettings(guild.id, { lastPostedAt: new Date().toISOString() });

  const logEmbed = new EmbedBuilder()
    .setTitle('📰 Meme Posted')
    .addFields(
      { name: 'Reason', value: reason, inline: true },
      { name: 'Channel', value: `${channel}`, inline: true },
    )
    .setColor(0x00aa00)
    .setTimestamp();
  await logModAction(guild, logEmbed);

  return { posted: true, message: 'Posted.' };
}

export function startMemeScheduler(client: any) {
  // Check every 5 minutes; per-guild logic ensures we only post every 2h.
  const intervalMs = 5 * 60 * 1000;
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        const settings = await memeService.getSettings(guild.id);
        if (!settings.enabled || !settings.channelId) continue;

        const last = settings.lastPostedAt ? Date.parse(settings.lastPostedAt) : 0;
        const due = !last || Date.now() - last >= TWO_HOURS_MS;
        if (!due) continue;

        await postMemeToGuild(guild, 'Scheduled (every 2 hours)');
      } catch (e) {
        console.error('Meme scheduler error:', e);
      }
    }
  }, intervalMs);
}

