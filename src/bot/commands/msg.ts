import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.ts';
import { checkCooldown, logModAction } from './mod-utils.ts';

export const msgCommand = {
  data: new SlashCommandBuilder()
    .setName('msg')
    .setDescription('Send a message as the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Ask for text and send it as the bot')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)')),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'msg', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    if (sub !== 'send') return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });

    const hasPerm =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageMessages) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
    if (!hasPerm) return interaction.reply({ content: '❌ You need `Manage Messages`.', ephemeral: true });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const channelId = channel?.id;
    if (!channelId) return interaction.reply({ content: '❌ Invalid channel.', ephemeral: true });

    const modal = new ModalBuilder().setCustomId(`msg_modal_${channelId}`).setTitle('Send Bot Message');
    const text = new TextInputBuilder()
      .setCustomId('msg_text')
      .setLabel('Message text')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1900);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(text));
    await interaction.showModal(modal);
  },
};

export async function handleMsgModal(interaction: any) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('msg_modal_')) return false;
  if (!interaction.inGuild()) return false;

  const channelId = customId.slice('msg_modal_'.length);
  const text = interaction.fields.getTextInputValue('msg_text');
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel || !(channel as any).isTextBased?.()) {
    await interaction.reply({ content: '❌ Channel not found or not text-based.', ephemeral: true });
    return true;
  }

  await (channel as any).send(text);
  await interaction.reply({ content: `✅ Sent message in ${channel}.`, ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle('✉️ /msg sent')
    .addFields(
      { name: 'Actor', value: `${interaction.user} (\`${interaction.user.id}\`)` },
      { name: 'Channel', value: `${channel}` },
      { name: 'Preview', value: text.length > 500 ? text.slice(0, 500) + '…' : text },
    )
    .setColor(0xff6321)
    .setTimestamp();
  await logModAction(interaction.guild, embed).catch(() => {});
  return true;
}

