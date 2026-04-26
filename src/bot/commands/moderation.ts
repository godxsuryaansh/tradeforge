import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.ts';
import { checkCooldown, confirmDangerousAction, logModAction, canActOnTarget, botCanActOnTarget } from './mod-utils.ts';
import { modService } from '../../lib/firebase-admin.ts';

function buildEmbed(title: string, actor: any, fields: { name: string; value: string; inline?: boolean }[], color = 0xff6321) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields({ name: 'Actor', value: `${actor} (\`${actor.id}\`)` }, ...fields)
    .setColor(color)
    .setTimestamp();
}

export const banCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption((option) => option.setName('target').setDescription('The user to ban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'ban', 5_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Ban ${target}?`);
    if (!ok) return;

    try {
      const actorMember = await interaction.guild.members.fetch(interaction.user.id);
      const botMember = await interaction.guild.members.fetchMe();
      const targetMember = await interaction.guild.members.fetch(target.id);

      const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
      if (deny) return interaction.editReply(deny);

      await interaction.guild.members.ban(target, { reason });
      await logModAction(interaction.guild, buildEmbed('🔨 Ban', interaction.user, [{ name: 'Target', value: `${target} (\`${target.id}\`)` }, { name: 'Reason', value: reason }], 0xff0000));
      return interaction.editReply(`✅ Banned **${target.tag}**. Reason: ${reason}`);
    } catch (err: any) {
      console.error('Ban Error:', err);
      return interaction.editReply(`❌ Failed to ban member: ${err?.message ?? 'unknown error'}`);
    }
  },
};

export const kickCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption((option) => option.setName('target').setDescription('The user to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'kick', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Kick ${target}?`);
    if (!ok) return;

    try {
      const actorMember = await interaction.guild.members.fetch(interaction.user.id);
      const botMember = await interaction.guild.members.fetchMe();
      const targetMember = await interaction.guild.members.fetch(target.id);

      const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
      if (deny) return interaction.editReply(deny);

      await targetMember.kick(reason);
      await logModAction(interaction.guild, buildEmbed('👢 Kick', interaction.user, [{ name: 'Target', value: `${target} (\`${target.id}\`)` }, { name: 'Reason', value: reason }], 0xffa500));
      return interaction.editReply(`✅ Kicked **${target.tag}**. Reason: ${reason}`);
    } catch (err: any) {
      console.error('Kick Error:', err);
      return interaction.editReply(`❌ Failed to kick member: ${err?.message ?? 'unknown error'}`);
    }
  },
};

export const clearCommand = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Purge messages')
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('Number of messages to clear').setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'clear', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const amount = interaction.options.getInteger('amount');
    await interaction.deferReply({ ephemeral: true });

    const ok = await confirmDangerousAction(interaction, `Clear **${amount}** messages in ${interaction.channel}?`);
    if (!ok) return;

    try {
      await interaction.channel.bulkDelete(amount);
      await logModAction(interaction.guild, buildEmbed('🧹 Clear', interaction.user, [{ name: 'Channel', value: `${interaction.channel}` }, { name: 'Amount', value: `${amount}` }]));
      return interaction.editReply(`✅ Cleared **${amount}** messages.`);
    } catch (err: any) {
      console.error('Clear Error:', err);
      return interaction.editReply(`❌ Failed to clear messages: ${err?.message ?? 'unknown error'}`);
    }
  },
};

export const warnCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption((option) => option.setName('target').setDescription('User to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'warn', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ ephemeral: true });

    try {
      await modService.addWarning(interaction.guild.id, target.id);
      const count = await modService.getWarningCount(interaction.guild.id, target.id);

      await logModAction(interaction.guild, buildEmbed('⚠️ Warn', interaction.user, [{ name: 'Target', value: `${target} (\`${target.id}\`)` }, { name: 'Reason', value: reason }, { name: 'Total Warnings', value: `${count}` }]));
      return interaction.editReply(`⚠️ Warned **${target.tag}**. Reason: ${reason}\nTotal warnings: **${count}**`);
    } catch (err: any) {
      console.error('Warn Error:', err);
      return interaction.editReply(`❌ Failed to warn member: ${err?.message ?? 'unknown error'}`);
    }
  },
};

