import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.ts';
import { memeService } from '../../lib/firebase-admin.ts';
import { checkCooldown, logModAction } from './mod-utils.ts';
import { postMemeToGuild } from '../meme.ts';

function buildEmbed(title: string, actor: any, fields: { name: string; value: string; inline?: boolean }[], color = 0xff6321) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields({ name: 'Actor', value: `${actor} (\`${actor.id}\`)` }, ...fields)
    .setColor(color)
    .setTimestamp();
}

export const memeCommand = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Configure and manage auto-memes')
    .addSubcommand((sub) =>
      sub
        .setName('set-channel')
        .setDescription('Set the channel where memes will be posted')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Text channel for memes')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) => sub.setName('enable').setDescription('Enable automatic meme posting'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable automatic meme posting'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show current meme settings'))
    .addSubcommand((sub) => sub.setName('post').setDescription('Post a meme now')),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'meme', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    // Permission checks
    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    const isMod =
      isAdmin ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ModerateMembers) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageMessages);

    if (sub === 'set-channel') {
      if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server` to do this.');
      const channel = interaction.options.getChannel('channel');
      await memeService.updateSettings(interaction.guild.id, { channelId: channel.id });
      await logModAction(interaction.guild, buildEmbed('🗂️ Meme Channel Set', interaction.user, [{ name: 'Channel', value: `${channel}` }]));
      return interaction.editReply(`✅ Meme channel set to ${channel}.`);
    }

    if (sub === 'enable') {
      if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server` to do this.');
      await memeService.updateSettings(interaction.guild.id, { enabled: true });
      await logModAction(interaction.guild, buildEmbed('✅ Memes Enabled', interaction.user, [] , 0x00aa00));
      return interaction.editReply('✅ Auto-memes enabled.');
    }

    if (sub === 'disable') {
      if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server` to do this.');
      await memeService.updateSettings(interaction.guild.id, { enabled: false });
      await logModAction(interaction.guild, buildEmbed('🛑 Memes Disabled', interaction.user, [], 0xff0000));
      return interaction.editReply('✅ Auto-memes disabled.');
    }

    if (sub === 'status') {
      const settings = await memeService.getSettings(interaction.guild.id);
      const ch = settings.channelId ? interaction.guild.channels.cache.get(settings.channelId) : null;
      const embed = new EmbedBuilder()
        .setTitle('📌 Meme Settings')
        .addFields(
          { name: 'Enabled', value: settings.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Channel', value: ch ? `${ch}` : 'Not set', inline: true },
          { name: 'Last Post', value: settings.lastPostedAt ? `<t:${Math.floor(Date.parse(settings.lastPostedAt) / 1000)}:R>` : 'Never', inline: true },
        )
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'post') {
      if (!isMod) return interaction.editReply('❌ You need mod permissions to do this.');
      try {
        const result = await postMemeToGuild(interaction.guild, `Manual by ${interaction.user.tag}`);
        if (!result.posted) return interaction.editReply(`⚠️ ${result.message}`);
        return interaction.editReply('✅ Meme posted.');
      } catch (e: any) {
        console.error('Meme post error:', e);
        return interaction.editReply(`❌ Failed to post meme: ${e?.message ?? 'unknown error'}`);
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

