import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { autoModService } from '../../lib/firebase-admin.ts';

const COMMAND_COOLDOWN_MS = 3_000;
const cooldowns = new Map<string, number>();

function normalizeListInput(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

export const automodConfigCommand = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure AutoMod')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Turns ON all automod systems'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turns OFF everything (no filtering at all)'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Shows what’s active (spam, links, caps, etc.)'))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Resets all settings to default'))
    .addSubcommand((sub) =>
      sub
        .setName('whitelist-role')
        .setDescription('That role bypasses automod')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to whitelist').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unwhitelist-role')
        .setDescription('Remove bypass for a role')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to unwhitelist').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('whitelist-channel')
        .setDescription('Automod won’t work in that channel')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to whitelist').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unwhitelist-channel')
        .setDescription('Re-enable automod in that channel')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to unwhitelist').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('caps-limit')
        .setDescription('If message has too many CAPITAL letters → flagged')
        .addIntegerOption((opt) =>
          opt
            .setName('percent')
            .setDescription('Caps percentage threshold (0-100)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('emoji-limit')
        .setDescription('Limits spam emojis')
        .addIntegerOption((opt) =>
          opt.setName('limit').setDescription('Maximum emojis allowed').setRequired(true).setMinValue(0),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mention-limit')
        .setDescription('Stops mass ping spam')
        .addIntegerOption((opt) =>
          opt.setName('limit').setDescription('Maximum mentions allowed').setRequired(true).setMinValue(0),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('duplicate-detect')
        .setDescription('Detects same message sent repeatedly → spam')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable/disable duplicate detection').setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('badwords')
        .setDescription('Manage banned words')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add banned word')
            .addStringOption((opt) => opt.setName('word').setDescription('Word to ban').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove banned word')
            .addStringOption((opt) => opt.setName('word').setDescription('Word to unban').setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('Show all banned words')),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('link-whitelist')
        .setDescription('Manage allowed domains')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Allow safe domain')
            .addStringOption((opt) => opt.setName('url').setDescription('Domain (e.g. youtube.com)').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove safe domain')
            .addStringOption((opt) => opt.setName('url').setDescription('Domain to remove').setRequired(true)),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('punish')
        .setDescription('Manage penalties')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Define punishment type')
            .addStringOption((opt) =>
              opt
                .setName('type')
                .setDescription('Punishment to apply')
                .setRequired(true)
                .addChoices(
                  { name: 'Warn', value: 'warn' },
                  { name: 'Mute', value: 'mute' },
                  { name: 'Kick', value: 'kick' },
                  { name: 'Ban', value: 'ban' },
                ),
            ),
        )
        .addSubcommand((sub) => sub.setName('view').setDescription('Show current punishment rule')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('logs')
        .setDescription('Toggle logging of automod actions')
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/disable logging').setRequired(true)),
    ),

  async execute(interaction: any) {
    const now = Date.now();
    const cdKey = `${interaction.user?.id ?? 'unknown'}:automod`;
    const last = cooldowns.get(cdKey) ?? 0;
    if (now - last < COMMAND_COOLDOWN_MS) {
      const leftSeconds = Math.ceil((COMMAND_COOLDOWN_MS - (now - last)) / 100) / 10;
      return interaction.reply({ content: `⏳ Cooldown: try again in ${leftSeconds}s.`, ephemeral: true });
    }
    cooldowns.set(cdKey, now);

    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    await interaction.deferReply({ ephemeral: true });

    const settings = await autoModService.getSettings(guildId);

    if (group === 'badwords') {
      const word = normalizeListInput(interaction.options.getString('word'));

      if (subcommand === 'add') {
        if (!word) return interaction.editReply('❌ Word cannot be empty.');
        if (!settings.badWords.includes(word)) {
          await autoModService.updateSettings(guildId, { badWords: [...settings.badWords, word] });
          return interaction.editReply(`✅ Added \`${word}\` to banned words.`);
        }
        return interaction.editReply(`⚠️ \`${word}\` is already in the banned words list.`);
      }

      if (subcommand === 'remove') {
        if (!word) return interaction.editReply('❌ Word cannot be empty.');
        await autoModService.updateSettings(guildId, { badWords: settings.badWords.filter((w) => w !== word) });
        return interaction.editReply(`✅ Removed \`${word}\` from banned words.`);
      }

      if (subcommand === 'list') {
        const embed = new EmbedBuilder()
          .setTitle('🚫 Banned Words')
          .setDescription(settings.badWords.length ? settings.badWords.map((w) => `\`${w}\``).join(', ') : 'No banned words set.')
          .setColor(0xff6321);
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (group === 'link-whitelist') {
      const url = normalizeListInput(interaction.options.getString('url'));
      if (!url) return interaction.editReply('❌ URL/domain cannot be empty.');

      if (subcommand === 'add') {
        if (!settings.linkWhitelist.includes(url)) {
          await autoModService.updateSettings(guildId, { linkWhitelist: [...settings.linkWhitelist, url] });
          return interaction.editReply(`✅ Added \`${url}\` to link whitelist.`);
        }
        return interaction.editReply(`⚠️ \`${url}\` is already whitelisted.`);
      }

      if (subcommand === 'remove') {
        await autoModService.updateSettings(guildId, { linkWhitelist: settings.linkWhitelist.filter((u) => u !== url) });
        return interaction.editReply(`✅ Removed \`${url}\` from link whitelist.`);
      }
    }

    if (group === 'punish') {
      if (subcommand === 'set') {
        const type = interaction.options.getString('type');
        await autoModService.updateSettings(guildId, { punishment: type });
        return interaction.editReply(`✅ Punishment set to: **${String(type).toUpperCase()}**`);
      }
      if (subcommand === 'view') {
        return interaction.editReply(`Current punishment rule: **${settings.punishment.toUpperCase()}**`);
      }
    }

    if (subcommand === 'enable') {
      await autoModService.updateSettings(guildId, { enabled: true });
      return interaction.editReply('✅ AutoMod has been **ENABLED**.');
    }

    if (subcommand === 'disable') {
      await autoModService.updateSettings(guildId, { enabled: false });
      return interaction.editReply('✅ AutoMod has been **DISABLED**.');
    }

    if (subcommand === 'status') {
      const statusEmbed = new EmbedBuilder()
        .setTitle('🤖 AutoMod Status')
        .addFields(
          { name: 'Status', value: settings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Punishment', value: settings.punishment.toUpperCase(), inline: true },
          { name: 'Caps Limit', value: `${settings.capsLimit}%`, inline: true },
          { name: 'Emoji Limit', value: `${settings.emojiLimit}`, inline: true },
          { name: 'Mention Limit', value: `${settings.mentionLimit}`, inline: true },
          { name: 'Duplicate Detect', value: settings.duplicateDetect ? 'ON' : 'OFF', inline: true },
          { name: 'Logging', value: settings.loggingEnabled ? 'ON' : 'OFF', inline: true },
        )
        .setColor(settings.enabled ? 0x00ff00 : 0xff0000)
        .setTimestamp();
      return interaction.editReply({ embeds: [statusEmbed] });
    }

    if (subcommand === 'reset') {
      await autoModService.resetSettings(guildId);
      return interaction.editReply('✅ All AutoMod settings reset to default.');
    }

    if (subcommand === 'whitelist-role') {
      const role = interaction.options.getRole('role');
      if (!settings.whitelistedRoles.includes(role.id)) {
        await autoModService.updateSettings(guildId, { whitelistedRoles: [...settings.whitelistedRoles, role.id] });
        return interaction.editReply(`✅ Role ${role} now bypasses AutoMod.`);
      }
      return interaction.editReply(`⚠️ Role ${role} is already whitelisted.`);
    }

    if (subcommand === 'unwhitelist-role') {
      const role = interaction.options.getRole('role');
      await autoModService.updateSettings(guildId, {
        whitelistedRoles: settings.whitelistedRoles.filter((id) => id !== role.id),
      });
      return interaction.editReply(`✅ Removed whitelist bypass for ${role}.`);
    }

    if (subcommand === 'whitelist-channel') {
      const channel = interaction.options.getChannel('channel');
      if (!settings.whitelistedChannels.includes(channel.id)) {
        await autoModService.updateSettings(guildId, { whitelistedChannels: [...settings.whitelistedChannels, channel.id] });
        return interaction.editReply(`✅ AutoMod will not run in ${channel}.`);
      }
      return interaction.editReply(`⚠️ ${channel} is already whitelisted.`);
    }

    if (subcommand === 'unwhitelist-channel') {
      const channel = interaction.options.getChannel('channel');
      await autoModService.updateSettings(guildId, {
        whitelistedChannels: settings.whitelistedChannels.filter((id) => id !== channel.id),
      });
      return interaction.editReply(`✅ AutoMod re-enabled in ${channel}.`);
    }

    if (subcommand === 'caps-limit') {
      const caps = interaction.options.getInteger('percent');
      await autoModService.updateSettings(guildId, { capsLimit: caps });
      return interaction.editReply(`✅ Caps limit set to **${caps}%**.`);
    }

    if (subcommand === 'emoji-limit') {
      const limit = interaction.options.getInteger('limit');
      await autoModService.updateSettings(guildId, { emojiLimit: limit });
      return interaction.editReply(`✅ Emoji limit set to **${limit}**.`);
    }

    if (subcommand === 'mention-limit') {
      const limit = interaction.options.getInteger('limit');
      await autoModService.updateSettings(guildId, { mentionLimit: limit });
      return interaction.editReply(`✅ Mention limit set to **${limit}**.`);
    }

    if (subcommand === 'duplicate-detect') {
      const enabled = interaction.options.getBoolean('enabled');
      await autoModService.updateSettings(guildId, { duplicateDetect: enabled });
      return interaction.editReply(`✅ Duplicate detection: **${enabled ? 'ON' : 'OFF'}**.`);
    }

    if (subcommand === 'logs') {
      const enabled = interaction.options.getBoolean('enabled');
      await autoModService.updateSettings(guildId, { loggingEnabled: enabled });
      return interaction.editReply(`✅ AutoMod logging: **${enabled ? 'ON' : 'OFF'}**.`);
    }

    return interaction.editReply('✅ Settings updated.');
  },
};

