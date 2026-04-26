import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.ts';
import { client } from './client.ts';
import { pollService } from '../lib/firebase-admin.ts';

function optionRow(pollId: string, startIndex: number, options: string[], disabled: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < 5; i++) {
    const idx = startIndex + i;
    if (idx >= options.length) break;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_vote_${pollId}_${idx}`)
        .setLabel(String(idx + 1))
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(disabled),
    );
  }
  return row;
}

async function renderPollEmbed(guildId: string, poll: any) {
  const votes = await pollService.listVotes(guildId, poll.pollId);
  const counts = new Array(poll.options.length).fill(0);
  for (const v of votes) {
    if (Number.isFinite(v) && v >= 0 && v < counts.length) counts[v]++;
  }

  const lines = poll.options.map((opt: string, idx: number) => `**${idx + 1}.** ${opt} — **${counts[idx]}**`);
  const embed = new EmbedBuilder()
    .setTitle('📊 Poll')
    .setDescription(`**${poll.question}**\n\n${lines.join('\n')}`)
    .setColor(0xff6321)
    .setFooter({ text: `ID: ${poll.pollId}` })
    .setTimestamp();

  if (poll.ended) embed.addFields({ name: 'Status', value: 'Ended', inline: true });
  return embed;
}

export function initPollButtons() {
  client.on('interactionCreate', async (interaction: any) => {
    try {
      if (!interaction.isButton?.()) return;
      if (!interaction.inGuild?.()) return;
      if (!interaction.customId?.startsWith('poll_vote_')) return;

      const parts = interaction.customId.split('_');
      const pollId = parts[2];
      const optionIndex = Number(parts[3]);

      const poll = await pollService.getPoll(interaction.guild.id, pollId);
      if (!poll) return interaction.reply({ content: '❌ Poll not found.', ephemeral: true });
      if (poll.ended) return interaction.reply({ content: '❌ Poll already ended.', ephemeral: true });

      if (!Number.isFinite(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
        return interaction.reply({ content: '❌ Invalid option.', ephemeral: true });
      }

      await pollService.vote(interaction.guild.id, pollId, interaction.user.id, optionIndex);

      // Update embed counts
      const embed = await renderPollEmbed(interaction.guild.id, poll);
      const rows: any[] = [
        optionRow(pollId, 0, poll.options, false),
      ];
      if (poll.options.length > 5) rows.push(optionRow(pollId, 5, poll.options, false));

      await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
      return interaction.reply({ content: `✅ Vote recorded: **${optionIndex + 1}**`, ephemeral: true });
    } catch (e) {
      console.error('Poll button error:', e);
    }
  });
}

export async function buildPollMessage(guildId: string, poll: any) {
  const embed = await renderPollEmbed(guildId, poll);
  const rows: any[] = [optionRow(poll.pollId, 0, poll.options, false)];
  if (poll.options.length > 5) rows.push(optionRow(poll.pollId, 5, poll.options, false));
  return { embeds: [embed], components: rows };
}

export async function endPoll(guildId: string, pollId: string) {
  const poll = await pollService.getPoll(guildId, pollId);
  if (!poll) return null;
  if (poll.ended) return poll;
  await pollService.updatePoll(guildId, pollId, { ended: true, endedAt: new Date().toISOString() });
  return { ...poll, ended: true, endedAt: new Date().toISOString() };
}

