import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { client, registerCommands } from './client.js';
import { profileCommand, editProfileCommand } from './commands/profile.js';
import { banCommand, kickCommand, clearCommand, warnCommand } from './commands/moderation.js';
import { tradeCommand } from './commands/trade.js';
import { setupProfilePanelCommand, setupTicketPanelCommand } from './commands/setup.js';
import { vouchCommand, addVouchImageCommand } from './commands/vouch.js';
import { helpCommand } from './commands/help.js';
import { automodConfigCommand } from './commands/automod-config.js';
import { massCommand, channelModCommand, highModCommand } from './commands/advanced-mod.js';
import { memeCommand } from './commands/meme.js';
import { levelsCommand } from './commands/levels.js';
import { welcomeCommand } from './commands/welcome.js';
import { invitesCommand } from './commands/invites.js';
import { autoResponderCommand } from './commands/autoresponder.js';
import { autoRoleCommand } from './commands/autorole.js';
import { stickyCommand } from './commands/sticky.js';
import { reactionRolesCommand } from './commands/reactionroles.js';
import { vouchesCommand } from './commands/vouches.js';
import { giveawayCommand } from './commands/giveaway.js';
import { funCommand } from './commands/fun.js';
import { economyCommand } from './commands/economy.js';
import { pollCommand } from './commands/poll.js';
import { aiChatCommand, aiMemoryCommand, aiPersonalityCommand } from './commands/ai.js';
import { msgCommand, handleMsgModal } from './commands/msg.js';
import {
  massbanCommand,
  masskickCommand,
  massroleCommand,
  massmuteCommand,
  massunmuteCommand,
  forceroleCommand,
  roleallCommand,
  deroleallCommand,
  hidechannelCommand,
  showchannelCommand,
  lockallCommand,
  unlockallCommand,
  slowmodeallCommand,
  nukeCommand,
  clonechannelCommand,
  resetchannelCommand,
  warnremoveCommand,
  warnsetCommand,
  warnresetCommand,
  timeoutCommandExact,
  untimeoutCommand,
  jailCommand,
  unjailCommand,
  setjailCommand,
  voicekickCommand,
  voicemuteCommand,
  voiceunmuteCommand,
  voicebanCommand,
  voiceunbanCommand,
} from './commands/legacy-advanced.js';
import { initAutoMod } from './automod.js';
import { startMemeScheduler } from './meme.js';
import { initLevels } from './levels.js';
import { initWelcomeAndGoodbye } from './welcome.js';
import { initInviteTracker } from './invites.js';
import { initAutoResponder } from './autoresponder.js';
import { initStickyMessages } from './sticky.js';
import { initReactionRoles } from './reactionroles.js';
import { userService } from '../lib/firebase-admin.js';
import { initGiveawayButtons, startGiveawayScheduler } from './giveaway.js';
import { initEconomy } from './economy.js';
import { initEconomyUi } from './economy-ui.js';
import { initPollButtons } from './poll.js';
import { initAiChat } from './ai-chat.js';

const ticketCommand = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Open a support ticket'),
    async execute(interaction: any) {
        // Reuse logic for both slash command and button
        const isButton = interaction.isButton?.();
        
        try {
            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle('🎫 Support Ticket')
                .setDescription(`Hello ${interaction.user}, a staff member will be with you shortly.`)
                .setColor(0xFF6321);

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
                );

            await channel.send({ embeds: [embed], components: [row] });
            
            if (isButton) {
                await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
            }
        } catch (err) {
            console.error('Ticket Creation Error:', err);
            if (isButton || interaction.deferred) {
                await interaction.editReply({ content: '❌ Failed to create ticket. Make sure I have permissions to create channels.' });
            } else {
                await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
            }
        }
    }
};

const commands = [
  profileCommand,
  editProfileCommand,
  vouchCommand,
  addVouchImageCommand,
  banCommand,
  kickCommand,
  clearCommand,
  warnCommand,
  setupProfilePanelCommand,
  setupTicketPanelCommand,
  helpCommand,
  automodConfigCommand,
  memeCommand,
  levelsCommand,
  welcomeCommand,
  invitesCommand,
  autoResponderCommand,
  autoRoleCommand,
  stickyCommand,
  reactionRolesCommand,
  vouchesCommand,
  giveawayCommand,
  funCommand,
  economyCommand,
  pollCommand,
  aiChatCommand,
  aiMemoryCommand,
  aiPersonalityCommand,
  msgCommand,
  massCommand,
  channelModCommand,
  highModCommand,
  // Exact moderation commands requested
  massbanCommand,
  masskickCommand,
  massroleCommand,
  massmuteCommand,
  massunmuteCommand,
  forceroleCommand,
  roleallCommand,
  deroleallCommand,
  hidechannelCommand,
  showchannelCommand,
  lockallCommand,
  unlockallCommand,
  slowmodeallCommand,
  nukeCommand,
  clonechannelCommand,
  resetchannelCommand,
  warnremoveCommand,
  warnsetCommand,
  warnresetCommand,
  timeoutCommandExact,
  untimeoutCommand,
  setjailCommand,
  jailCommand,
  unjailCommand,
  voicekickCommand,
  voicemuteCommand,
  voiceunmuteCommand,
  voicebanCommand,
  voiceunbanCommand,
  ticketCommand,
  tradeCommand
];

export async function initBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN not found. Bot will not start.');
    return;
  }

  // Map commands
  for (const cmd of commands) {
    (client as any).commands.set(cmd.data.name, cmd);
  }

  initAutoMod();
  initLevels();
  initWelcomeAndGoodbye();
  initInviteTracker();
  initAutoResponder();
  initStickyMessages();
  initReactionRoles();
  initGiveawayButtons();
  initEconomy();
  initEconomyUi();
  initPollButtons();
  initAiChat();
  
  // Test Firestore Connection
  try {
    await userService.getProfile('connection-test');
    console.log('✅ Firestore connection verified.');
  } catch (err) {
    console.error('❌ Firestore connection failed:', err.message);
  }

  client.on('error', (error) => {
    console.error('Discord Client Error:', error);
  });

  client.on('ready', () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
    registerCommands(commands.map(c => c.data.toJSON()));
    startMemeScheduler(client);
    startGiveawayScheduler();
  });

  client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = (client as any).commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.editReply({ content: 'There was an error while executing this command!' });
        }
      }
    } else if (interaction.isButton()) {
      try {
          if (interaction.customId === 'view_my_profile') {
            await profileCommand.execute(interaction);
          } else if (interaction.customId === 'create_profile') {
              const modal = new ModalBuilder()
                .setCustomId('create_profile_modal')
                .setTitle('Create Your Trade Profile');

              const bioInput = new TextInputBuilder()
                .setCustomId('profile_bio')
                .setLabel("Tell us about your trading style")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("e.g. 5 years Roblox buying experience...")
                .setMaxLength(500)
                .setRequired(true);

              const gameInput = new TextInputBuilder()
                .setCustomId('profile_game')
                .setLabel("Main Game")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Roblox / Free Fire")
                .setRequired(true);

              const styleInput = new TextInputBuilder()
                .setCustomId('profile_style')
                .setLabel("Trading Style")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Buyer / Seller / Both")
                .setRequired(true);

              modal.addComponents(
                  new ActionRowBuilder<TextInputBuilder>().addComponents(bioInput),
                  new ActionRowBuilder<TextInputBuilder>().addComponents(gameInput),
                  new ActionRowBuilder<TextInputBuilder>().addComponents(styleInput)
              );

              await interaction.showModal(modal);
          } else if (interaction.customId === 'view_other_profile_modal') {
              const modal = new ModalBuilder()
                .setCustomId('view_other_profile_id_modal')
                .setTitle('View Another Trader');

              const idInput = new TextInputBuilder()
                .setCustomId('target_user_id')
                .setLabel("User ID")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Enter the Discord User ID")
                .setRequired(true);

              modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(idInput));
              await interaction.showModal(modal);
          } else if (interaction.customId === 'edit_profile_btn') {
              await editProfileCommand.execute(interaction);
          } else if (interaction.customId.startsWith('view_vouches_')) {
              await interaction.deferReply({ ephemeral: true });
              const userId = interaction.customId.split('_')[2];
              const vouches = await userService.getVouches(userId);
              
              if (vouches.length === 0) {
                  return interaction.editReply({ content: 'This user has no vouches yet.' });
              }

              const embeds = vouches.slice(0, 5).map(v => {
                  const emb = new EmbedBuilder()
                    .setAuthor({ name: `Vouch from ID: ${v.fromUserId}` })
                    .setDescription(v.message)
                    .setFooter({ text: `Date: ${new Date(v.timestamp).toLocaleDateString()}` })
                    .setColor(0xFFD700);
                  if (v.imageURL) emb.setImage(v.imageURL);
                  return emb;
              });

              await interaction.editReply({ 
                  content: `Showing latest ${embeds.length} vouches.`, 
                  embeds 
              });
          } else if (interaction.customId.startsWith('view_images_')) {
              await interaction.deferReply({ ephemeral: true });
              const userId = interaction.customId.split('_')[2];
              const profile = await userService.getProfile(userId);
              
              if (!profile || !profile.vouchImages || profile.vouchImages.length === 0) {
                  return interaction.editReply({ content: 'This user has no proof images in their gallery.' });
              }

              const embeds = profile.vouchImages.slice(-5).map((img, i) => {
                  return new EmbedBuilder()
                    .setTitle(`Proof Image #${i + 1}`)
                    .setImage(img)
                    .setColor(0xFF6321);
              });

              await interaction.editReply({ 
                  content: `Showing latest ${embeds.length} proof images.`, 
                  embeds 
              });
          } else if (interaction.customId === 'open_ticket') {
              await ticketCommand.execute(interaction);
          } else if (interaction.customId === 'close_ticket') {
              await interaction.channel?.delete();
          } else if (interaction.customId.startsWith('accept_trade')) {
              const parts = interaction.customId.split('_');
              const initiatorId = parts[2];
              const partnerId = parts[3];

              if (interaction.user.id !== partnerId) {
                  return interaction.reply({ content: "Only the invited partner can accept this trade!", ephemeral: true });
              }
              
              await interaction.update({ content: '✅ Trade Accepted! Opening escrow channel...', components: [], embeds: [] });
              
              const channel = await (interaction.guild as any).channels.create({
                  name: `escrow-${interaction.user.username}-${initiatorId.substring(0,4)}`,
                  type: ChannelType.GuildText,
                  permissionOverwrites: [
                      { id: interaction.guild!.id, deny: [PermissionFlagsBits.ViewChannel] },
                      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                      { id: initiatorId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                  ]
              });

              const escrowEmbed = new EmbedBuilder()
                .setTitle('🤝 Trade Escrow')
                .setDescription(`Participants: <@${initiatorId}> & <@${partnerId}>\n\nPlease list the items you are trading. This channel is private.`)
                .setColor(0xFF6321);

              await channel.send({ content: `<@${initiatorId}> <@${partnerId}>`, embeds: [escrowEmbed] });
          }
      } catch (err) {
          console.error('Button Interaction Error:', err);
      }
    } else if (interaction.isModalSubmit()) {
        try {
            if (interaction.customId === 'create_profile_modal') {
                await interaction.deferReply({ ephemeral: true });
                const bio = interaction.fields.getTextInputValue('profile_bio');
                const game = interaction.fields.getTextInputValue('profile_game');
                const style = interaction.fields.getTextInputValue('profile_style');

                await userService.createProfile(interaction.user.id, interaction.user.username, bio, game, style);
                await interaction.editReply({ content: '✅ Profile created successfully! You can now start trading and earning vouches.' });
            } else if (interaction.customId === 'edit_profile_modal') {
                await interaction.deferReply({ ephemeral: true });
                const bio = interaction.fields.getTextInputValue('edit_bio');
                const game = interaction.fields.getTextInputValue('edit_game');
                const style = interaction.fields.getTextInputValue('edit_style');

                await userService.updateProfile(interaction.user.id, {
                    bio,
                    mainGame: game,
                    tradingStyle: style
                });
                await interaction.editReply({ content: '✅ Profile updated successfully!' });
            } else if (interaction.customId === 'view_other_profile_id_modal') {
                const targetId = interaction.fields.getTextInputValue('target_user_id');
                try {
                    const targetUser = await client.users.fetch(targetId);
                    await profileCommand.execute(interaction, targetUser);
                } catch (e) {
                    await interaction.reply({ content: '❌ Invalid User ID or user not found.', ephemeral: true });
                }
            } else if (await handleMsgModal(interaction)) {
                return;
            }
        } catch (err) {
            console.error('Modal Submit Error:', err);
        }
    }
  });

  try {
    await client.login(token);
  } catch (err) {
    console.error('Failed to login to Discord:', err);
  }
}
