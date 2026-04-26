import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { userService } from '../../lib/firebase-admin.js';

export const vouchCommand = {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Vouch for a user after a successful trade')
    .addUserOption(option => option.setName('user').setDescription('The user to vouch for').setRequired(true))
    .addStringOption(option => option.setName('message').setDescription('Vouch message').setRequired(true))
    .addAttachmentOption(option => option.setName('proof').setDescription('Image proof of the trade')),
  
  async execute(interaction: any) {
    await interaction.deferReply();
    try {
      const targetUser = interaction.options.getUser('user');
      const message = interaction.options.getString('message');
      const attachment = interaction.options.getAttachment('proof');

      if (targetUser.id === interaction.user.id) {
        return interaction.editReply({ content: "❌ You cannot vouch for yourself!" });
      }

      const targetProfile = await userService.getProfile(targetUser.id);
      if (!targetProfile) {
        return interaction.editReply({ content: `❌ ${targetUser} does not have a TradeForge profile yet.` });
      }

      const imageURL = attachment ? attachment.url : undefined;
      
      // Basic image validation
      if (imageURL && !imageURL.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
          return interaction.editReply({ content: "❌ Proof must be a valid image file (jpg, png, webp, gif)." });
      }

      await userService.addVouch(targetUser.id, interaction.user.id, message, imageURL);

      const embed = new EmbedBuilder()
        .setTitle('⭐ New Vouch Received!')
        .setDescription(`${interaction.user} has vouched for ${targetUser}!`)
        .addFields(
            { name: '💬 Message', value: message }
        )
        .setColor(0xFFD700) // Gold
        .setTimestamp();

      if (imageURL) {
          embed.setImage(imageURL);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Vouch Command Error:', err);
      await interaction.editReply({ content: '❌ Failed to submit vouch.' });
    }
  }
};

export const addVouchImageCommand = {
  data: new SlashCommandBuilder()
    .setName('addvouchimage')
    .setDescription('Add a proof image to your own profile gallery')
    .addAttachmentOption(option => option.setName('image').setDescription('Proof screenshot').setRequired(true)),
  
  async execute(interaction: any) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const attachment = interaction.options.getAttachment('image');
      if (!attachment) return interaction.editReply({ content: '❌ Please provide an image.' });

      // Image validation
      if (!attachment.url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
          return interaction.editReply({ content: "❌ Must be a valid image file." });
      }

      const profile = await userService.getProfile(interaction.user.id);
      if (!profile) {
          return interaction.editReply({ content: '❌ You need a profile to upload images!' });
      }

      await userService.addVouchImage(interaction.user.id, attachment.url);
      await interaction.editReply({ content: '✅ Proof image added to your gallery!' });
    } catch (err) {
      console.error('AddVouchImage Error:', err);
      await interaction.editReply({ content: '❌ Failed to upload image.' });
    }
  }
};
