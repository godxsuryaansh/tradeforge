import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.ts';

export const setupProfilePanelCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-profile-panel')
    .setDescription('Setup the profile management panel in the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction: any) {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ TradeForge Profile System')
      .setDescription('Welcome to the **TradeForge Secure Trading Network**.\n\nCreate your professional trading profile to start earning vouches and increasing your trust level.')
      .addFields(
        { name: '✨ Create Profile', value: 'Setup your bio, main game, and trading style.', inline: true },
        { name: '👤 View My Profile', value: 'Check your current stats and trust level.', inline: true },
        { name: '🔍 View Others', value: 'Verify another trader by their ID.', inline: true }
      )
      .setColor(0xFF6321) // Orange
      .setFooter({ text: 'Profiles are required for secure escrow trading.' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_profile')
          .setLabel('Create Profile')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('view_my_profile')
          .setLabel('View My Profile')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('view_other_profile_modal')
          .setLabel('View Other Profile')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};

export const setupTicketPanelCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-ticket-panel')
    .setDescription('Setup the support ticket panel in the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction: any) {
    const embed = new EmbedBuilder()
      .setTitle('🎫 TradeForge Support Center')
      .setDescription('Need help with a trade, have a question, or need to report a user?\n\nClick the button below to open a private support ticket with our staff team.')
      .addFields(
        { name: '🕒 Support Hours', value: '24/7 Availability', inline: true },
        { name: '🛡️ Trust & Safety', value: 'Verified Staff only', inline: true }
      )
      .setColor(0xFF6321) // Orange
      .setFooter({ text: 'Abuse of the ticket system may lead to a ban.' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('Open Support Ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
