import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { userService } from '../../lib/firebase-admin.ts';

export const tradeCommand = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Start a trade escrow')
    .addUserOption(option => option.setName('partner').setDescription('The user you want to trade with').setRequired(true)),
  
  async execute(interaction: any) {
    await interaction.deferReply();
    try {
      const initiatorProfile = await userService.getProfile(interaction.user.id);
      if (!initiatorProfile) {
        return interaction.editReply({ content: "❌ You need a profile to start trades! Click **'Create Profile'** in the profiles channel." });
      }

      const partner = interaction.options.getUser('partner');
      if (partner.id === interaction.user.id) {
        return interaction.editReply({ content: "❌ You can't trade with yourself!" });
      }

      const partnerProfile = await userService.getProfile(partner.id);
      if (!partnerProfile) {
        return interaction.editReply({ content: `❌ ${partner} does not have a TradeForge profile yet. They must create one before trading.` });
      }

      const embed = new EmbedBuilder()
        .setTitle('🤝 Trade Escrow Request')
        .setDescription(`${interaction.user} wants to start a trade with ${partner}.\n\nBoth parties must accept to open an escrow session.`)
        .setColor(0xFF6321)
        .setFooter({ text: 'TradeForge Secure Escrow' });

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`accept_trade_${interaction.user.id}_${partner.id}`)
            .setLabel('Accept Trade')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`decline_trade`)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ content: `${partner}`, embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Trade Command Error:', err);
      await interaction.editReply({ content: '❌ Failed to start trade session.' });
    }
  }
};
