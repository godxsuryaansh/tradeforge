import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.ts';
import { welcomeService } from '../../lib/firebase-admin.ts';
import { checkCooldown, logModAction } from './mod-utils.ts';

export const welcomeCommand = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Welcome/goodbye messages')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show welcome system status'))
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure welcome system (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable welcome/goodbye messages'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable welcome/goodbye messages'))
        .addSubcommand((sub) =>
          sub
            .setName('set-channel')
            .setDescription('Set the channel for welcome/goodbye')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Text channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-welcome')
            .setDescription('Set welcome message template')
            .addStringOption((opt) =>
              opt
                .setName('template')
                .setDescription('Use {user} {server} {memberCount}')
                .setRequired(true)
                .setMaxLength(1900),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-goodbye')
            .setDescription('Set goodbye message template')
            .addStringOption((opt) =>
              opt
                .setName('template')
                .setDescription('Use {user} {server} {memberCount}')
                .setRequired(true)
                .setMaxLength(1900),
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('test').setDescription('Send a test welcome message')),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'welcome', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'status') {
      const settings = await welcomeService.getSettings(interaction.guild.id);
      const channel = settings.channelId ? interaction.guild.channels.cache.get(settings.channelId) : null;
      const embed = new EmbedBuilder()
        .setTitle('🟧 Welcome Status')
        .addFields(
          { name: 'Enabled', value: settings.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Channel', value: channel ? `${channel}` : 'Not set', inline: true },
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
        await welcomeService.updateSettings(interaction.guild.id, { enabled: true });
        await logModAction(
          interaction.guild,
          new EmbedBuilder().setTitle('✅ Welcome Enabled').setColor(0x00aa00).setTimestamp(),
        );
        return interaction.editReply('✅ Welcome system enabled.');
      }
      if (sub === 'disable') {
        await welcomeService.updateSettings(interaction.guild.id, { enabled: false });
        await logModAction(
          interaction.guild,
          new EmbedBuilder().setTitle('🛑 Welcome Disabled').setColor(0xff0000).setTimestamp(),
        );
        return interaction.editReply('✅ Welcome system disabled.');
      }
      if (sub === 'set-channel') {
        const channel = interaction.options.getChannel('channel');
        await welcomeService.updateSettings(interaction.guild.id, { channelId: channel.id });
        await logModAction(
          interaction.guild,
          new EmbedBuilder()
            .setTitle('🟧 Welcome Channel Set')
            .addFields({ name: 'Channel', value: `${channel}` })
            .setColor(0xff6321)
            .setTimestamp(),
        );
        return interaction.editReply(`✅ Welcome channel set to ${channel}.`);
      }
      if (sub === 'set-welcome') {
        const template = interaction.options.getString('template');
        await welcomeService.updateSettings(interaction.guild.id, { welcomeTemplate: template });
        return interaction.editReply('✅ Welcome template updated.');
      }
      if (sub === 'set-goodbye') {
        const template = interaction.options.getString('template');
        await welcomeService.updateSettings(interaction.guild.id, { goodbyeTemplate: template });
        return interaction.editReply('✅ Goodbye template updated.');
      }
    }

    if (!group && sub === 'test') {
      const settings = await welcomeService.getSettings(interaction.guild.id);
      if (!settings.channelId) return interaction.editReply('❌ Welcome channel not set.');
      const channel = interaction.guild.channels.cache.get(settings.channelId);
      if (!channel || !(channel as any).isTextBased?.()) return interaction.editReply('❌ Configured welcome channel is invalid.');

      const text = settings.welcomeTemplate
        .replaceAll('{user}', `${interaction.user}`)
        .replaceAll('{server}', interaction.guild.name)
        .replaceAll('{memberCount}', String(interaction.guild.memberCount));

      const embed = new EmbedBuilder().setTitle('🟧 Welcome (Test)').setDescription(text).setColor(0xff6321).setTimestamp();
      await (channel as any).send({ embeds: [embed] });
      return interaction.editReply(`✅ Sent test welcome to ${channel}.`);
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

