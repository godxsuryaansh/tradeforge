import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.ts';
import { stickyService } from '../../lib/firebase-admin.ts';
import { checkCooldown, confirmDangerousAction } from './mod-utils.ts';

export const stickyCommand = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Sticky messages (repost every N messages)')
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Show sticky status for a channel')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel (defaults to current)').addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure sticky messages (admin)')
        .addSubcommand((sub) =>
          sub
            .setName('enable')
            .setDescription('Enable sticky in a channel')
            .addChannelOption((opt) => opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addIntegerOption((opt) =>
              opt.setName('every').setDescription('Repost every N messages').setRequired(true).setMinValue(1).setMaxValue(200),
            )
            .addStringOption((opt) => opt.setName('message').setDescription('Sticky message text').setRequired(true).setMaxLength(1900)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('disable')
            .setDescription('Disable sticky in a channel')
            .addChannelOption((opt) => opt.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'sticky', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'status') {
      const ch = interaction.options.getChannel('channel') ?? interaction.channel;
      const settings = await stickyService.getChannelSettings(interaction.guild.id, ch.id);
      const embed = new EmbedBuilder()
        .setTitle('📌 Sticky Status')
        .addFields(
          { name: 'Channel', value: `${ch}`, inline: true },
          { name: 'Enabled', value: settings.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Every', value: `${settings.everyNMessages} msgs`, inline: true },
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
      if (sub === 'enable') {
        const channel = interaction.options.getChannel('channel');
        const every = interaction.options.getInteger('every');
        const message = interaction.options.getString('message');
        const ok = await confirmDangerousAction(interaction, `Enable sticky in ${channel} every **${every}** messages?`);
        if (!ok) return;
        await stickyService.updateChannelSettings(interaction.guild.id, channel.id, { enabled: true, everyNMessages: every, message });
        return interaction.editReply(`✅ Sticky enabled in ${channel}.`);
      }
      if (sub === 'disable') {
        const channel = interaction.options.getChannel('channel');
        const ok = await confirmDangerousAction(interaction, `Disable sticky in ${channel}?`);
        if (!ok) return;
        await stickyService.updateChannelSettings(interaction.guild.id, channel.id, { enabled: false });
        return interaction.editReply(`✅ Sticky disabled in ${channel}.`);
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

