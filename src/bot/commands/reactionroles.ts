import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { reactionRolesService } from '../../lib/firebase-admin.js';
import { checkCooldown, confirmDangerousAction } from './mod-utils.js';
import { normalizeEmojiInput } from '../reactionroles.js';

function emojiForReact(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const custom = trimmed.match(/^<a?:(\w+):(\d+)>$/);
  if (custom) return `${custom[1]}:${custom[2]}`;
  const idOnly = trimmed.match(/^\d{10,25}$/);
  if (idOnly) return null;
  return trimmed;
}

export const reactionRolesCommand = {
  data: new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Reaction roles system')
    .addSubcommand((sub) => sub.setName('status').setDescription('Show reaction roles status'))
    .addSubcommand((sub) => sub.setName('list').setDescription('List configured reaction roles mappings'))
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure reaction roles (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable reaction roles'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable reaction roles'))
        .addSubcommand((sub) =>
          sub
            .setName('set-message')
            .setDescription('Set the message to watch for reactions')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel containing the message')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            )
            .addStringOption((opt) => opt.setName('message_id').setDescription('Message ID').setRequired(true).setMaxLength(30)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('post')
            .setDescription('Post a new reaction-roles panel message')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel to post panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            )
            .addStringOption((opt) => opt.setName('title').setDescription('Panel title').setMaxLength(80))
            .addStringOption((opt) => opt.setName('description').setDescription('Panel description').setMaxLength(1200)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('sync-reactions')
            .setDescription('Add missing reactions on the configured panel message'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add a reaction role mapping')
            .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji (unicode or custom) or emoji ID').setRequired(true).setMaxLength(64))
            .addRoleOption((opt) => opt.setName('role').setDescription('Role to assign').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a mapping by emoji')
            .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji (same format you added)').setRequired(true).setMaxLength(64)),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'reactionroles', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'status') {
      const settings = await reactionRolesService.getSettings(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setTitle('🎭 Reaction Roles Status')
        .addFields(
          { name: 'Enabled', value: settings.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Channel', value: settings.channelId ? `<#${settings.channelId}>` : 'Not set', inline: true },
          { name: 'Message', value: settings.messageId ? `\`${settings.messageId}\`` : 'Not set', inline: true },
          { name: 'Mappings', value: String(settings.mappings?.length || 0), inline: true },
        )
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (!group && sub === 'list') {
      const settings = await reactionRolesService.getSettings(interaction.guild.id);
      const lines = (settings.mappings || []).map((m) => `• \`${m.emoji}\` → <@&${m.roleId}>`);
      const embed = new EmbedBuilder()
        .setTitle('🎭 Reaction Roles Mappings')
        .setDescription(lines.length ? lines.join('\n') : 'No mappings configured.')
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    if (group === 'config') {
      const settings = await reactionRolesService.getSettings(interaction.guild.id);

      if (sub === 'enable') {
        await reactionRolesService.updateSettings(interaction.guild.id, { enabled: true });
        return interaction.editReply('✅ Reaction roles enabled.');
      }
      if (sub === 'disable') {
        await reactionRolesService.updateSettings(interaction.guild.id, { enabled: false });
        return interaction.editReply('✅ Reaction roles disabled.');
      }
      if (sub === 'set-message') {
        const channel = interaction.options.getChannel('channel');
        const messageId = interaction.options.getString('message_id');
        const ok = await confirmDangerousAction(interaction, `Set reaction-roles message to \`${messageId}\` in ${channel}?`);
        if (!ok) return;
        await reactionRolesService.updateSettings(interaction.guild.id, { channelId: channel.id, messageId });
        return interaction.editReply('✅ Reaction roles message configured.');
      }
      if (sub === 'post') {
        const channel = interaction.options.getChannel('channel');
        const title = interaction.options.getString('title') || 'Reaction Roles';
        const description = interaction.options.getString('description') || 'React to get roles.';

        if (!(settings.mappings || []).length) return interaction.editReply('❌ Add mappings first with `/reactionroles config add`.');

        const lines = settings.mappings.map((m) => `• ${m.emoji} → <@&${m.roleId}>`);
        const embed = new EmbedBuilder()
          .setTitle(`🎭 ${title}`)
          .setDescription(`${description}\n\n${lines.join('\n')}`)
          .setColor(0xff6321)
          .setTimestamp();

        const ok = await confirmDangerousAction(interaction, `Post reaction-roles panel in ${channel}?`);
        if (!ok) return;

        const msg = await (channel as any).send({ embeds: [embed] });
        await reactionRolesService.updateSettings(interaction.guild.id, { channelId: channel.id, messageId: msg.id });

        // Try to add reactions (best-effort)
        for (const m of settings.mappings) {
          const react = emojiForReact(m.emoji);
          if (!react) continue;
          await msg.react(react).catch(() => {});
        }

        return interaction.editReply(`✅ Panel posted. Message ID: \`${msg.id}\``);
      }
      if (sub === 'sync-reactions') {
        if (!settings.channelId || !settings.messageId) return interaction.editReply('❌ Set message first or use `post`.');
        const channel = interaction.guild.channels.cache.get(settings.channelId);
        if (!channel || !(channel as any).isTextBased?.()) return interaction.editReply('❌ Channel not found.');
        const msg = await (channel as any).messages.fetch(settings.messageId).catch(() => null);
        if (!msg) return interaction.editReply('❌ Message not found.');
        for (const m of settings.mappings || []) {
          const react = emojiForReact(m.emoji);
          if (!react) continue;
          await msg.react(react).catch(() => {});
        }
        return interaction.editReply('✅ Reactions synced (best-effort).');
      }
      if (sub === 'add') {
        const emoji = interaction.options.getString('emoji');
        const role = interaction.options.getRole('role');
        const normalized = normalizeEmojiInput(emoji);
        if (!normalized) return interaction.editReply('❌ Invalid emoji.');
        const next = (settings.mappings || []).filter((m) => normalizeEmojiInput(m.emoji) !== normalized);
        next.push({ emoji, roleId: role.id });
        const ok = await confirmDangerousAction(interaction, `Add mapping: \`${emoji}\` → ${role}?`);
        if (!ok) return;
        await reactionRolesService.updateSettings(interaction.guild.id, { mappings: next });
        return interaction.editReply('✅ Mapping added.');
      }
      if (sub === 'remove') {
        const emoji = interaction.options.getString('emoji');
        const normalized = normalizeEmojiInput(emoji);
        const next = (settings.mappings || []).filter((m) => normalizeEmojiInput(m.emoji) !== normalized);
        const ok = await confirmDangerousAction(interaction, `Remove mapping for \`${emoji}\`?`);
        if (!ok) return;
        await reactionRolesService.updateSettings(interaction.guild.id, { mappings: next });
        return interaction.editReply('✅ Mapping removed (if it existed).');
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};
