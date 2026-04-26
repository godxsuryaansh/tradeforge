import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { giveawayService } from '../../lib/firebase-admin.js';
import { checkCooldown, confirmDangerousAction, logModAction } from './mod-utils.js';
import { endGiveaway, postGiveaway } from '../giveaway.js';

function parseDurationMs(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  const m = trimmed.match(/^(\d+)\s*([smhd])$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(4);
}

export const giveawayCommand = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway system')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a giveaway')
        .addStringOption((opt) => opt.setName('prize').setDescription('Prize name').setRequired(true).setMaxLength(200))
        .addStringOption((opt) => opt.setName('duration').setDescription('Duration like 10m, 2h, 1d').setRequired(true))
        .addIntegerOption((opt) =>
          opt.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(20),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to post giveaway')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit a giveaway')
        .addStringOption((opt) => opt.setName('id').setDescription('Giveaway ID').setRequired(true))
        .addStringOption((opt) => opt.setName('prize').setDescription('New prize').setMaxLength(200))
        .addIntegerOption((opt) => opt.setName('winners').setDescription('New winners count').setMinValue(1).setMaxValue(20))
        .addStringOption((opt) => opt.setName('extend').setDescription('Extend by duration like 10m, 2h, 1d')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a giveaway (marks ended)')
        .addStringOption((opt) => opt.setName('id').setDescription('Giveaway ID').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a giveaway now')
        .addStringOption((opt) => opt.setName('id').setDescription('Giveaway ID').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reroll')
        .setDescription('Pick new winners for an ended giveaway')
        .addStringOption((opt) => opt.setName('id').setDescription('Giveaway ID').setRequired(true)),
    ),

  async execute(interaction: any) {
    try {
      const cd = checkCooldown(interaction.user.id, 'giveaway', 4_000);
      if (cd) return interaction.reply({ content: cd, ephemeral: true });
      if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });

      const isMod =
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageMessages);
      if (!isMod) return interaction.editReply('❌ You need mod permissions.');

      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        const prize = interaction.options.getString('prize');
        const duration = interaction.options.getString('duration');
        const winnersCount = interaction.options.getInteger('winners');
        const channel = interaction.options.getChannel('channel');
        const ms = parseDurationMs(duration);
        if (!ms) return interaction.editReply('❌ Invalid duration. Use `10m`, `2h`, `1d`, etc.');

        const giveawayId = newId();
        const endsAt = new Date(Date.now() + ms).toISOString();
        const giveaway = {
          giveawayId,
          channelId: channel.id,
          messageId: null,
          prize,
          winnersCount,
          endsAt,
          ended: false,
          winners: [],
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        };

        await giveawayService.createGiveaway(interaction.guild.id, giveaway as any);
        await postGiveaway(interaction.guild, channel.id, giveaway);

        const embed = new EmbedBuilder()
          .setTitle('🎉 Giveaway Created')
          .setDescription(
            `Prize: **${prize}**\nWinners: **${winnersCount}**\nEnds: <t:${Math.floor(Date.parse(endsAt) / 1000)}:R>\nID: \`${giveawayId}\``,
          )
          .setColor(0xff6321)
          .setTimestamp();
        await logModAction(interaction.guild, embed).catch(() => {});
        return interaction.editReply(`✅ Giveaway created in ${channel}. ID: \`${giveawayId}\``);
      }

      const giveawayId = interaction.options.getString('id');
      const g = await giveawayService.getGiveaway(interaction.guild.id, giveawayId);
      if (!g) return interaction.editReply('❌ Giveaway not found.');

      if (sub === 'edit') {
        if (g.ended) return interaction.editReply('❌ Giveaway already ended.');
        const patch: any = {};
        const prize = interaction.options.getString('prize');
        const winners = interaction.options.getInteger('winners');
        const extend = interaction.options.getString('extend');
        if (prize) patch.prize = prize;
        if (winners) patch.winnersCount = winners;
        if (extend) {
          const ms = parseDurationMs(extend);
          if (!ms) return interaction.editReply('❌ Invalid extend duration. Use `10m`, `2h`, `1d`.');
          patch.endsAt = new Date(Date.parse(g.endsAt) + ms).toISOString();
        }

        const ok = await confirmDangerousAction(interaction, `Edit giveaway \`${giveawayId}\`?`);
        if (!ok) return;

        await giveawayService.updateGiveaway(interaction.guild.id, giveawayId, patch);
        return interaction.editReply('✅ Giveaway updated.');
      }

      if (sub === 'delete') {
        const ok = await confirmDangerousAction(interaction, `Delete giveaway \`${giveawayId}\`? (This marks it ended)`);
        if (!ok) return;
        await giveawayService.deleteGiveaway(interaction.guild.id, giveawayId);
        return interaction.editReply('✅ Giveaway deleted (marked ended).');
      }

      if (sub === 'end') {
        const ok = await confirmDangerousAction(interaction, `End giveaway \`${giveawayId}\` now?`);
        if (!ok) return;
        await endGiveaway(interaction.guild, giveawayId, `Manual end by ${interaction.user.tag}`);
        return interaction.editReply('✅ Giveaway ended.');
      }

      if (sub === 'reroll') {
        if (!g.ended) return interaction.editReply('❌ Giveaway is not ended yet.');
        const ok = await confirmDangerousAction(interaction, `Reroll winners for \`${giveawayId}\`?`);
        if (!ok) return;

        await giveawayService.updateGiveaway(interaction.guild.id, giveawayId, { ended: false, winners: [] });
        await endGiveaway(interaction.guild, giveawayId, `Reroll by ${interaction.user.tag}`);
        return interaction.editReply('✅ Rerolled winners.');
      }

      return interaction.editReply('❌ Unknown subcommand.');
    } catch (e: any) {
      console.error('Giveaway command error:', e);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply(`❌ Error: ${e?.message ?? 'unknown error'}`);
      }
      return interaction.reply({ content: `❌ Error: ${e?.message ?? 'unknown error'}`, ephemeral: true });
    }
  },
};
