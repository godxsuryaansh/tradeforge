import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { autoResponderService } from '../../lib/firebase-admin.ts';
import { checkCooldown, confirmDangerousAction, logModAction } from './mod-utils.ts';

export const autoResponderCommand = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Auto responder (keyword replies)')
    .addSubcommand((sub) => sub.setName('list').setDescription('List autoresponder rules'))
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure autoresponder (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable autoresponder'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable autoresponder'))
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add a trigger/response rule')
            .addStringOption((opt) => opt.setName('trigger').setDescription('Trigger text (contains)').setRequired(true).setMaxLength(100))
            .addStringOption((opt) => opt.setName('response').setDescription('Response text').setRequired(true).setMaxLength(1900)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a rule by trigger')
            .addStringOption((opt) => opt.setName('trigger').setDescription('Trigger text').setRequired(true).setMaxLength(100)),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'autoresponder', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'list') {
      const settings = await autoResponderService.getSettings(interaction.guild.id);
      const lines = (settings.rules || []).map((r) => `• \`${r.trigger}\` → ${r.response.length > 60 ? r.response.slice(0, 60) + '…' : r.response}`);
      const embed = new EmbedBuilder()
        .setTitle('🤖 AutoResponder Rules')
        .setDescription(lines.length ? lines.join('\n') : 'No rules configured.')
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    if (group === 'config') {
      if (sub === 'enable') {
        await autoResponderService.updateSettings(interaction.guild.id, { enabled: true });
        await logModAction(interaction.guild, new EmbedBuilder().setTitle('✅ AutoResponder Enabled').setColor(0x00aa00).setTimestamp());
        return interaction.editReply('✅ AutoResponder enabled.');
      }
      if (sub === 'disable') {
        await autoResponderService.updateSettings(interaction.guild.id, { enabled: false });
        await logModAction(interaction.guild, new EmbedBuilder().setTitle('🛑 AutoResponder Disabled').setColor(0xff0000).setTimestamp());
        return interaction.editReply('✅ AutoResponder disabled.');
      }
      if (sub === 'add') {
        const trigger = interaction.options.getString('trigger');
        const response = interaction.options.getString('response');
        const settings = await autoResponderService.getSettings(interaction.guild.id);
        const rules = (settings.rules || []).filter((r) => r.trigger.toLowerCase() !== String(trigger).toLowerCase());
        rules.push({ trigger, response });
        const ok = await confirmDangerousAction(interaction, `Add autoresponder rule for trigger: \`${trigger}\`?`);
        if (!ok) return;
        await autoResponderService.updateSettings(interaction.guild.id, { rules });
        return interaction.editReply('✅ Rule added.');
      }
      if (sub === 'remove') {
        const trigger = interaction.options.getString('trigger');
        const settings = await autoResponderService.getSettings(interaction.guild.id);
        const rules = (settings.rules || []).filter((r) => r.trigger.toLowerCase() !== String(trigger).toLowerCase());
        const ok = await confirmDangerousAction(interaction, `Remove autoresponder rule for trigger: \`${trigger}\`?`);
        if (!ok) return;
        await autoResponderService.updateSettings(interaction.guild.id, { rules });
        return interaction.editReply('✅ Rule removed (if it existed).');
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

