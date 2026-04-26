import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder } from 'discord.js';
import { client } from './client.ts';
import { giveawayService } from '../lib/firebase-admin.ts';
import { logModAction } from './commands/mod-utils.ts';

function enterButtonRow(giveawayId: string, disabled: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter_${giveawayId}`)
      .setLabel(disabled ? 'Giveaway Ended' : 'Enter Giveaway')
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function giveawayEmbed(g: any, entryCount?: number) {
  const endsTs = Math.floor(Date.parse(g.endsAt) / 1000);
  const embed = new EmbedBuilder()
    .setTitle('🎉 Giveaway')
    .setColor(0xff6321)
    .addFields(
      { name: 'Prize', value: g.prize, inline: false },
      { name: 'Winners', value: String(g.winnersCount), inline: true },
      { name: 'Ends', value: `<t:${endsTs}:R>`, inline: true },
      { name: 'Entries', value: entryCount !== undefined ? String(entryCount) : '—', inline: true },
    )
    .setFooter({ text: `ID: ${g.giveawayId}` })
    .setTimestamp();

  if (g.ended) {
    embed.addFields({ name: 'Status', value: g.winners?.length ? `Ended • Winners: ${g.winners.map((id: string) => `<@${id}>`).join(' ')}` : 'Ended', inline: false });
  }

  return embed;
}

function pickWinners(entries: string[], count: number): string[] {
  const pool = [...new Set(entries)];
  const winners: string[] = [];
  while (pool.length && winners.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

export async function postGiveaway(guild: any, channelId: string, g: any) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    throw new Error('Invalid giveaway channel.');
  }

  const embed = giveawayEmbed(g, 0);
  const message = await (channel as any).send({ embeds: [embed], components: [enterButtonRow(g.giveawayId, false)] });
  await giveawayService.updateGiveaway(guild.id, g.giveawayId, { messageId: message.id, channelId: channelId });
  return message.id;
}

export async function endGiveaway(guild: any, giveawayId: string, reason: string) {
  const g = await giveawayService.getGiveaway(guild.id, giveawayId);
  if (!g) throw new Error('Giveaway not found.');
  if (g.ended) return { ended: true, winners: g.winners || [] };

  const entries = await giveawayService.listEntries(guild.id, giveawayId);
  const winners = pickWinners(entries, Math.max(1, g.winnersCount || 1));

  await giveawayService.updateGiveaway(guild.id, giveawayId, { ended: true, winners });

  // Edit message
  if (g.channelId && g.messageId) {
    const channel = guild.channels.cache.get(g.channelId);
    if (channel && (channel as any).isTextBased?.()) {
      const msg = await (channel as any).messages.fetch(g.messageId).catch(() => null);
      if (msg) {
        const embed = giveawayEmbed({ ...g, ended: true, winners }, entries.length);
        await msg.edit({ embeds: [embed], components: [enterButtonRow(giveawayId, true)] }).catch(() => {});
      }
    }
  }

  // Announce winners
  if (g.channelId) {
    const channel = guild.channels.cache.get(g.channelId);
    if (channel && (channel as any).isTextBased?.()) {
      const announce = winners.length ? `🎉 Winners: ${winners.map((id) => `<@${id}>`).join(' ')}` : 'No winners (no entries).';
      await (channel as any).send(`🎉 Giveaway ended: **${g.prize}**\n${announce}`).catch(() => {});
    }
  }

  const log = new EmbedBuilder()
    .setTitle('🎉 Giveaway Ended')
    .addFields(
      { name: 'Giveaway', value: `\`${giveawayId}\`` },
      { name: 'Prize', value: g.prize },
      { name: 'Winners', value: winners.length ? winners.map((id) => `<@${id}>`).join(' ') : 'None' },
      { name: 'Reason', value: reason },
    )
    .setColor(0xff6321)
    .setTimestamp();
  await logModAction(guild, log).catch(() => {});

  return { ended: true, winners };
}

export function initGiveawayButtons() {
  client.on('interactionCreate', async (interaction: any) => {
    try {
      if (!interaction.isButton?.()) return;
      if (!interaction.inGuild?.()) return;
      if (!interaction.customId?.startsWith('giveaway_enter_')) return;

      const giveawayId = interaction.customId.split('_')[2];
      const g = await giveawayService.getGiveaway(interaction.guild.id, giveawayId);
      if (!g || g.ended) return interaction.reply({ content: '❌ Giveaway not found or already ended.', ephemeral: true });

      await giveawayService.addEntry(interaction.guild.id, giveawayId, interaction.user.id);
      return interaction.reply({ content: '✅ Entered the giveaway!', ephemeral: true });
    } catch (e) {
      console.error('Giveaway button error:', e);
    }
  });
}

export function startGiveawayScheduler() {
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        const due = await giveawayService.listDueGiveaways(guild.id, 25);
        for (const g of due) {
          await endGiveaway(guild, g.giveawayId, 'Scheduled end');
        }
      } catch (e) {
        console.error('Giveaway scheduler error:', e);
      }
    }
  }, 60_000);
}

