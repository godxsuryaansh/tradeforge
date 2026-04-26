import { SlashCommandBuilder, EmbedBuilder } from 'discord.ts';
import { leaderboardService, userService } from '../../lib/firebase-admin.ts';
import { checkCooldown } from './mod-utils.ts';

export const vouchesCommand = {
  data: new SlashCommandBuilder()
    .setName('vouches')
    .setDescription('Vouches leaderboard and lookup')
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Show top vouches leaderboard'))
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Show vouches count for a user')
        .addUserOption((opt) => opt.setName('member').setDescription('User').setRequired(true)),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'vouches', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'user') {
      const member = interaction.options.getUser('member');
      const profile = await userService.getProfile(member.id);
      const count = profile?.totalVouches ?? 0;
      return interaction.editReply(`✅ ${member} has **${count}** vouches.`);
    }

    if (sub === 'leaderboard') {
      const top = await leaderboardService.getTopVouches(10);
      if (!top.length) return interaction.editReply('No vouch data yet.');
      const lines = top.map((p, idx) => `**#${idx + 1}** <@${p.userId}> — **${p.totalVouches ?? 0}** vouches`);
      const embed = new EmbedBuilder().setTitle('🏆 Vouches Leaderboard').setDescription(lines.join('\n')).setColor(0xff6321).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

