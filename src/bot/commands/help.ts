import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.ts';

const HELP_COOLDOWN = 5000; // 5 seconds
const helpCooldowns = new Map<string, number>();

const categories = {
  HOME: {
    title: '🛡️ TradeForge Help Center',
    description: 'Welcome to the TradeForge Support Hub. Use the buttons below to navigate through our command categories.\n\n**Select a category to get started:**',
    color: 0x000000,
  },
  TRADE: {
    emoji: '🤝',
    title: '🤝 Trading Commands',
    description: 'Manage your trades and escrow panels.',
    commands: [
      '`/setup-trade-panel` - Deploy the main trading interface',
      '`/deal create` - Initiate a new escrow deal',
      '`/deal cancel` - Cancel an active deal',
      '`/deal status` - Check the progress of a trade'
    ]
  },
  MODERATION: {
    emoji: '🛡️',
    title: '🛡️ Moderation Commands',
    description: 'Maintain order within the server.',
    commands: [
      '`/ban`, `/kick`, `/warn`, `/clear` - Basic mod tools',
      '`/mass ban/kick/role` - Perform actions on many users',
      '`/timeout` - Temporarily restrict messaging',
      '`/ch lock-all/unlock-all` - Server-wide lockdowns',
      '`/ch nuke/hide/show` - Specific channel controls',
      '`/mod jail/unjail` - Restrict user access',
      '`/mod role-all` - Give role to everyone',
      '`/reactionroles status/list/config` - Reaction roles panels'
    ]
  },
  AUTOMOD: {
    emoji: '🤖',
    title: '🤖 AutoMod System',
    description: 'Configure automated security filters.',
    commands: [
      '`/automod enable/disable` - Core control',
      '`/automod caps-limit`, `/automod emoji-limit` - Content filters',
      '`/automod mention-limit`, `/automod duplicate-detect` - Spam filters',
      '`/automod badwords add/remove/list` - Blacklist words',
      '`/automod punish set/view` - Define active penalties',
      '`/automod status` - View current settings'
    ]
  },
  TICKETS: {
    emoji: '🎫',
    title: '🎫 Ticket System',
    description: 'Manage support and inquiry tickets.',
    commands: [
      '`/setup-ticket-panel` - Deploy the support panel',
      '`/ticket create` - Manually open a support request',
      '`/ticket close` - Archive and delete a ticket',
      '`/ticket add-user` - Invite a user to a ticket'
    ]
  },
  PROFILES: {
    emoji: '👤',
    title: '👤 Profile Services',
    description: 'Manage your trading identity and reputation.',
    commands: [
      '`/profile view` - View your profile (orange card)',
      '`/profile user <member>` - View someone else\'s profile',
      '`/vouch <user>` - Give a vouch to a trusted trader',
      '`/addvouchimage` - Add proof images to your gallery'
    ]
  },
  UTILITY: {
    emoji: '⚙️',
    title: '⚙️ Utility Commands',
    description: 'General tools and information.',
    commands: [
      '`/ping` - Check bot latency',
      '`/serverinfo` - Display guild information',
      '`/userinfo` - Display member information',
      '`/msg send [channel]` - Send a message as the bot (modal)',
      '`/remind` - Set a personal notification',
      '`/poll create/end` - Polls (buttons)',
      '`/economy balance/daily/pay` - Core economy',
      '`/economy deposit/withdraw` - Bank system',
      '`/economy rob` - Rob (risky)',
      '`/economy panel send` - Post economy panel (buttons)',
      '`/economy shop view/panel` - Shop (select menu)',
      '`/economy shop add/remove/list/set-stock` - Shop admin',
      '`/economy msg_drop_msg enable/disable/status` - Message earnings toggle',
      '`/economy manage add/remove/set` - Admin balance controls',
      '`/economy destroy` - Owner-only economy wipe',
      '`/giveaway create/end/reroll/edit/delete` - Giveaway system',
      '`/fun 8ball/coinflip/roll/choose` - Fun commands',
      '`/ai-chat enable/disable/status` - AI chat in a channel',
      '`/ai-memory set/add/view/clear` - AI memory',
      '`/ai-personality set/view/clear` - AI personality'
    ]
  }
};

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Access the TradeForge interactive help center'),

  async execute(interaction: any) {
    const userId = interaction.user.id;
    const now = Date.now();
    
    if (helpCooldowns.has(userId)) {
      const expirationTime = helpCooldowns.get(userId)! + HELP_COOLDOWN;
      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return interaction.reply({ 
          content: `⚠️ Slow down! You can use this command again in **${timeLeft.toFixed(1)}s**.`, 
          ephemeral: true 
        });
      }
    }

    helpCooldowns.set(userId, now);

    const getHomeEmbed = () => {
      return new EmbedBuilder()
        .setTitle(categories.HOME.title)
        .setDescription(categories.HOME.description)
        .addFields(
          { name: '🤝 Trade', value: 'Escrow & Deals', inline: true },
          { name: '🛡️ Moderation', value: 'User management', inline: true },
          { name: '🤖 AutoMod', value: 'Automated filters', inline: true },
          { name: '🎫 Tickets', value: 'Support system', inline: true },
          { name: '👤 Profiles', value: 'Trade rep', inline: true },
          { name: '⚙️ Utility', value: 'Bot status', inline: true }
        )
        .setColor(0xFF6321) // Orange
        .setFooter({ text: 'TradeForge • Interactive Help System' })
        .setTimestamp();
    };

    const getButtons = (active?: string) => {
      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('help_TRADE').setLabel('Trade').setEmoji('🤝').setStyle(active === 'TRADE' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_MODERATION').setLabel('Mod').setEmoji('🛡️').setStyle(active === 'MODERATION' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_AUTOMOD').setLabel('AutoMod').setEmoji('🤖').setStyle(active === 'AUTOMOD' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('help_TICKETS').setLabel('Tickets').setEmoji('🎫').setStyle(active === 'TICKETS' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_PROFILES').setLabel('Profiles').setEmoji('👤').setStyle(active === 'PROFILES' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('help_UTILITY').setLabel('Utility').setEmoji('⚙️').setStyle(active === 'UTILITY' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );

      const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('help_HOME').setLabel('Home').setEmoji('🏠').setStyle(ButtonStyle.Success)
      );

      return [row1, row2, row3];
    };

    const response = await interaction.reply({
      embeds: [getHomeEmbed()],
      components: getButtons(),
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 60 seconds
    });

    collector.on('collect', async (i: any) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: '❌ Only the command user can interact with this menu.', ephemeral: true });
      }

      const categoryId = i.customId.replace('help_', '');
      
      if (categoryId === 'HOME') {
        await i.update({
          embeds: [getHomeEmbed()],
          components: getButtons()
        });
        return;
      }

      const cat = (categories as any)[categoryId];
      const categoryEmbed = new EmbedBuilder()
        .setTitle(`${cat.emoji} ${cat.title}`)
        .setDescription(`${cat.description}\n\n${cat.commands.join('\n')}`)
        .setColor(0x000000) // Black for sleek look
        .setFooter({ text: 'TradeForge • Category: ' + categoryId })
        .setTimestamp();

      await i.update({
        embeds: [categoryEmbed],
        components: getButtons(categoryId)
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch (e) {
        // Ignore errors if message was deleted
      }
    });
  }
};
