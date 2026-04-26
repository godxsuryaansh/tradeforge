import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { userService } from '../../lib/firebase-admin.ts';
import { checkCooldown, confirmDangerousAction, logModAction } from './mod-utils.ts';

function trustBadge(trust: string): string {
  const t = String(trust || '').toUpperCase();
  if (t === 'HIGH') return '🟧 Legendary';
  if (t === 'MEDIUM') return '🟨 Veteran';
  return '⬜ New';
}

function vouchTier(totalVouches: number): string {
  const v = Number(totalVouches || 0);
  if (v >= 50) return '🟧 Arcane';
  if (v >= 20) return '🟨 Elite';
  if (v >= 5) return '🟩 Trusted';
  return '⬜ Unranked';
}

function isGuildOwner(interaction: any): boolean {
  const guildOwnerId = interaction.guild?.ownerId;
  return Boolean(guildOwnerId && interaction.user?.id && guildOwnerId === interaction.user.id);
}

async function renderProfileEmbed(interaction: any, user: any) {
  const profile = await userService.getProfile(user.id);

  if (!profile) {
    const noProfileEmbed = new EmbedBuilder()
      .setTitle('❌ Profile Not Found')
      .setDescription(
        `${user} has not created a TradeForge profile yet.\n\nThey need to click **"Create Profile"** in the profile panel to get started.`,
      )
      .setColor(0xff0000);
    return { embeds: [noProfileEmbed], components: [] as any[] };
  }

  const tier = vouchTier(profile.totalVouches);
  const badge = trustBadge(profile.trustLevel);

  const embed = new EmbedBuilder()
    .setTitle(`🟧 TradeForge Card — ${profile.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(0xff6321)
    .setDescription(profile.bio ? `“${profile.bio}”` : '“No bio set.”')
    .addFields(
      { name: 'Rank', value: `${tier} • ${badge}`, inline: false },
      { name: '✅ Vouches', value: String(profile.totalVouches ?? 0), inline: true },
      { name: '🤝 Deals', value: String(profile.totalDeals ?? 0), inline: true },
      { name: '🛡️ Trust', value: String(profile.trustLevel ?? 'LOW'), inline: true },
      { name: '🎮 Main Game', value: String(profile.mainGame ?? 'Roblox'), inline: true },
      { name: '⚖️ Style', value: String(profile.tradingStyle ?? 'Both'), inline: true },
    )
    .setFooter({ text: `Member since: ${new Date(profile.createdAt).toLocaleDateString()}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`view_vouches_${user.id}`).setLabel('View Vouches').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`view_images_${user.id}`).setLabel('View Images').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`edit_profile_btn`)
      .setLabel('Edit Profile')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(user.id !== interaction.user.id),
  );

  return { embeds: [embed], components: [row] };
}

export const profileCommand = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View and showcase profiles')
    .addSubcommand((sub) => sub.setName('view').setDescription('Show your profile card'))
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Show another user’s profile card')
        .addUserOption((opt) => opt.setName('member').setDescription('User to view').setRequired(true)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('owner')
        .setDescription('Server owner-only profile tools')
        .addSubcommand((sub) =>
          sub
            .setName('set-vouches')
            .setDescription('Set a user vouches count')
            .addUserOption((opt) => opt.setName('member').setDescription('User to edit').setRequired(true))
            .addIntegerOption((opt) =>
              opt.setName('count').setDescription('New vouches count').setRequired(true).setMinValue(0).setMaxValue(100000),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-rank')
            .setDescription('Set a user trust rank')
            .addUserOption((opt) => opt.setName('member').setDescription('User to edit').setRequired(true))
            .addStringOption((opt) =>
              opt
                .setName('rank')
                .setDescription('New rank')
                .setRequired(true)
                .addChoices(
                  { name: 'LOW', value: 'LOW' },
                  { name: 'MEDIUM', value: 'MEDIUM' },
                  { name: 'HIGH', value: 'HIGH' },
                ),
            ),
        ),
    ),

  async execute(interaction: any, targetUser?: any) {
    // Also supports being called by button interactions that pass targetUser.
    const isButton = interaction.isButton?.() || false;
    if (!isButton && !interaction.deferred && !interaction.replied) await interaction.deferReply();

    try {
      let user = targetUser;

      if (!user) {
        const isSlash = interaction.isChatInputCommand?.() || interaction.isCommand?.();
        if (isSlash && interaction.options?.getSubcommand) {
          const group = interaction.options.getSubcommandGroup?.(false);
          const sub = interaction.options.getSubcommand();

          if (group === 'owner') {
            const cd = checkCooldown(interaction.user.id, 'profile_owner', 5_000);
            if (cd) return interaction.editReply({ content: cd });
            if (!interaction.inGuild?.() && !interaction.guild) {
              return interaction.editReply({ content: '❌ Server-only command.' });
            }
            if (!isGuildOwner(interaction)) {
              return interaction.editReply({ content: '❌ Only the server owner can use this.' });
            }

            const member = interaction.options.getUser('member');

            if (sub === 'set-vouches') {
              const count = interaction.options.getInteger('count');
              const ok = await confirmDangerousAction(interaction, `Set vouches for ${member} to **${count}**?`);
              if (!ok) return;

              await userService.updateProfile(member.id, { totalVouches: count });
              await logModAction(
                interaction.guild,
                new EmbedBuilder()
                  .setTitle('🟧 Profile Owner Edit — Vouches')
                  .addFields(
                    { name: 'Owner', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                    { name: 'Target', value: `${member} (\`${member.id}\`)` },
                    { name: 'New Vouches', value: String(count) },
                  )
                  .setColor(0xff6321)
                  .setTimestamp(),
              );

              return interaction.editReply(`✅ Updated vouches for ${member} to **${count}**.`);
            }

            if (sub === 'set-rank') {
              const rank = interaction.options.getString('rank');
              const ok = await confirmDangerousAction(interaction, `Set rank for ${member} to **${rank}**?`);
              if (!ok) return;

              await userService.updateProfile(member.id, { trustLevel: rank });
              await logModAction(
                interaction.guild,
                new EmbedBuilder()
                  .setTitle('🟧 Profile Owner Edit — Rank')
                  .addFields(
                    { name: 'Owner', value: `${interaction.user} (\`${interaction.user.id}\`)` },
                    { name: 'Target', value: `${member} (\`${member.id}\`)` },
                    { name: 'New Rank', value: String(rank) },
                  )
                  .setColor(0xff6321)
                  .setTimestamp(),
              );

              return interaction.editReply(`✅ Updated rank for ${member} to **${rank}**.`);
            }

            return interaction.editReply({ content: '❌ Unknown owner subcommand.' });
          }

          if (sub === 'user') user = interaction.options.getUser('member');
          else user = interaction.user;
        } else {
          user = interaction.user;
        }
      }

      const payload = await renderProfileEmbed(interaction, user);
      if (isButton || interaction.deferred) return interaction.editReply(payload);
      return interaction.reply(payload);
    } catch (err) {
      console.error('Profile Command Error:', err);
      const errorMsg = '❌ Failed to load profile. Please try again later.';
      if (isButton || interaction.deferred) return interaction.editReply({ content: errorMsg });
      return interaction.reply({ content: errorMsg, ephemeral: true });
    }
  },
};

export const editProfileCommand = {
  data: new SlashCommandBuilder().setName('editprofile').setDescription('Edit your trade profile details'),

  async execute(interaction: any) {
    const profile = await userService.getProfile(interaction.user.id);
    if (!profile) {
      return interaction.reply({ content: '❌ You need to create a profile first!', ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId('edit_profile_modal').setTitle('Edit Profile');

    const bioInput = new TextInputBuilder()
      .setCustomId('edit_bio')
      .setLabel('Bio (Describe your trading history)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(profile.bio || '')
      .setMaxLength(500)
      .setRequired(true);

    const gameInput = new TextInputBuilder()
      .setCustomId('edit_game')
      .setLabel('Main Game (Roblox / Free Fire / etc)')
      .setStyle(TextInputStyle.Short)
      .setValue(profile.mainGame || 'Roblox')
      .setRequired(true);

    const styleInput = new TextInputBuilder()
      .setCustomId('edit_style')
      .setLabel('Trading Style (Buyer / Seller / Both)')
      .setStyle(TextInputStyle.Short)
      .setValue(profile.tradingStyle || 'Both')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(bioInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(gameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(styleInput),
    );

    await interaction.showModal(modal);
  },
};
