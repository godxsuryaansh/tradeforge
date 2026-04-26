import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { autoRoleService } from '../../lib/firebase-admin.js';
import { checkCooldown, confirmDangerousAction } from './mod-utils.js';

export const autoRoleCommand = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Auto role on join')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show autorole status'))
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure autorole (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable autorole'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable autorole'))
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add a role to be assigned on join')
            .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a role from autorole list')
            .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'autorole', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'status') {
      const settings = await autoRoleService.getSettings(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setTitle('🧩 AutoRole Status')
        .addFields(
          { name: 'Enabled', value: settings.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Roles', value: settings.roleIds.length ? settings.roleIds.map((id) => `<@&${id}>`).join(' ') : 'None', inline: false },
        )
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    if (group === 'config') {
      const settings = await autoRoleService.getSettings(interaction.guild.id);
      if (sub === 'enable') {
        await autoRoleService.updateSettings(interaction.guild.id, { enabled: true });
        return interaction.editReply('✅ Autorole enabled.');
      }
      if (sub === 'disable') {
        await autoRoleService.updateSettings(interaction.guild.id, { enabled: false });
        return interaction.editReply('✅ Autorole disabled.');
      }
      if (sub === 'add') {
        const role = interaction.options.getRole('role');
        const roleIds = Array.from(new Set([...settings.roleIds, role.id]));
        const ok = await confirmDangerousAction(interaction, `Add ${role} to autorole list?`);
        if (!ok) return;
        await autoRoleService.updateSettings(interaction.guild.id, { roleIds });
        return interaction.editReply(`✅ Added ${role} to autorole list.`);
      }
      if (sub === 'remove') {
        const role = interaction.options.getRole('role');
        const roleIds = settings.roleIds.filter((id) => id !== role.id);
        const ok = await confirmDangerousAction(interaction, `Remove ${role} from autorole list?`);
        if (!ok) return;
        await autoRoleService.updateSettings(interaction.guild.id, { roleIds });
        return interaction.editReply(`✅ Removed ${role} from autorole list.`);
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

