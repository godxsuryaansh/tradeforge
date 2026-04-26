import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { aiService } from '../../lib/firebase-admin.ts';
import { checkCooldown, confirmDangerousAction, logModAction } from './mod-utils.ts';

function isProbablySecret(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes('discord_token') || t.includes('bot token') || t.includes('gemini_api_key') || t.includes('api key')) return true;
  // crude discord token-like pattern
  if (text.match(/[MN][A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/)) return true;
  return false;
}

export const aiChatCommand = {
  data: new SlashCommandBuilder()
    .setName('ai-chat')
    .setDescription('AI chat (Gemini)')
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Enable AI chat in a channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for AI chat')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('How the bot responds')
            .addChoices({ name: 'Reply', value: 'reply' }, { name: 'React', value: 'react' }),
        ),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable AI chat'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show AI chat status')),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'ai-chat', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (sub !== 'status' && !isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    if (sub === 'status') {
      const s = await aiService.getSettings(interaction.guild.id);
      const ch = s.channelId ? interaction.guild.channels.cache.get(s.channelId) : null;
      const embed = new EmbedBuilder()
        .setTitle('🤖 AI Chat Status')
        .addFields(
          { name: 'Enabled', value: s.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Channel', value: ch ? `${ch}` : 'Not set', inline: true },
          { name: 'Mode', value: s.mode, inline: true },
          { name: 'Memory', value: s.memoryText ? `${Math.min(5000, s.memoryText.length)} chars` : 'Empty', inline: true },
          { name: 'Personality', value: s.personalityText ? `${Math.min(5000, s.personalityText.length)} chars` : 'Empty', inline: true },
        )
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'enable') {
      const channel = interaction.options.getChannel('channel');
      const mode = (interaction.options.getString('mode') as any) || 'reply';
      const ok = await confirmDangerousAction(interaction, `Enable AI chat in ${channel} (mode: ${mode})?`);
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { enabled: true, channelId: channel.id, mode });
      await logModAction(interaction.guild, new EmbedBuilder().setTitle('✅ AI Chat Enabled').setDescription(`Channel: ${channel}\nMode: ${mode}`).setColor(0x00aa00).setTimestamp()).catch(() => {});
      return interaction.editReply(`✅ AI chat enabled in ${channel}.`);
    }

    if (sub === 'disable') {
      const ok = await confirmDangerousAction(interaction, 'Disable AI chat?');
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { enabled: false });
      await logModAction(interaction.guild, new EmbedBuilder().setTitle('🛑 AI Chat Disabled').setColor(0xff0000).setTimestamp()).catch(() => {});
      return interaction.editReply('✅ AI chat disabled.');
    }
  },
};

export const aiMemoryCommand = {
  data: new SlashCommandBuilder()
    .setName('ai-memory')
    .setDescription('Manage AI memory')
    .addSubcommand((sub) =>
      sub.setName('set').setDescription('Replace memory text').addStringOption((opt) => opt.setName('text').setDescription('Memory text').setRequired(true).setMaxLength(4000)),
    )
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('Append to memory').addStringOption((opt) => opt.setName('text').setDescription('Text to append').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand((sub) => sub.setName('view').setDescription('View memory'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Clear memory')),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'ai-memory', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (sub !== 'view' && !isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    const s = await aiService.getSettings(interaction.guild.id);

    if (sub === 'view') {
      const text = s.memoryText || '';
      if (!text) return interaction.editReply('Memory is empty.');
      return interaction.editReply({ content: `**Memory:**\n${text}`.slice(0, 1900) });
    }

    if (sub === 'set') {
      const text = interaction.options.getString('text');
      if (isProbablySecret(text)) return interaction.editReply('❌ Refusing to store secrets/tokens in memory.');
      const ok = await confirmDangerousAction(interaction, 'Replace AI memory text?');
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { memoryText: text });
      return interaction.editReply('✅ Memory updated.');
    }

    if (sub === 'add') {
      const text = interaction.options.getString('text');
      if (isProbablySecret(text)) return interaction.editReply('❌ Refusing to store secrets/tokens in memory.');
      const next = (s.memoryText ? `${s.memoryText}\n` : '') + text;
      const ok = await confirmDangerousAction(interaction, 'Append to AI memory?');
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { memoryText: next.slice(0, 4000) });
      return interaction.editReply('✅ Memory appended.');
    }

    if (sub === 'clear') {
      const ok = await confirmDangerousAction(interaction, 'Clear AI memory?');
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { memoryText: '' });
      return interaction.editReply('✅ Memory cleared.');
    }
  },
};

export const aiPersonalityCommand = {
  data: new SlashCommandBuilder()
    .setName('ai-personality')
    .setDescription('Manage AI personality')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set personality style')
        .addStringOption((opt) => opt.setName('text').setDescription('Personality instruction').setRequired(true).setMaxLength(1500)),
    )
    .addSubcommand((sub) => sub.setName('view').setDescription('View personality'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Clear personality')),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'ai-personality', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (sub !== 'view' && !isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    const s = await aiService.getSettings(interaction.guild.id);

    if (sub === 'view') {
      const text = s.personalityText || '';
      if (!text) return interaction.editReply('Personality is empty.');
      return interaction.editReply({ content: `**Personality:**\n${text}`.slice(0, 1900) });
    }

    if (sub === 'set') {
      const text = interaction.options.getString('text');
      const ok = await confirmDangerousAction(interaction, 'Set AI personality?');
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { personalityText: text });
      return interaction.editReply('✅ Personality updated.');
    }

    if (sub === 'clear') {
      const ok = await confirmDangerousAction(interaction, 'Clear AI personality?');
      if (!ok) return;
      await aiService.updateSettings(interaction.guild.id, { personalityText: '' });
      return interaction.editReply('✅ Personality cleared.');
    }
  },
};

