import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { levelsService } from '../../lib/firebase-admin.ts';
import { checkCooldown, logModAction, confirmDangerousAction } from './mod-utils.ts';

function buildEmbed(title: string, actor: any, fields: { name: string; value: string; inline?: boolean }[], color = 0xff6321) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields({ name: 'Actor', value: `${actor} (\`${actor.id}\`)` }, ...fields)
    .setColor(color)
    .setTimestamp();
}

export const levelsCommand = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Levels system (XP, rewards, leaderboard)')
    .addSubcommand((sub) => sub.setName('me').setDescription('Show your level and XP'))
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Show top levels leaderboard'))
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure levels (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable levels system'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable levels system'))
        .addSubcommand((sub) =>
          sub
            .setName('set-xp')
            .setDescription('Set XP per message')
            .addIntegerOption((opt) => opt.setName('amount').setDescription('XP per message').setRequired(true).setMinValue(0).setMaxValue(1000)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-cooldown')
            .setDescription('Set XP message cooldown seconds')
            .addIntegerOption((opt) => opt.setName('seconds').setDescription('Cooldown seconds').setRequired(true).setMinValue(0).setMaxValue(3600)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-announce')
            .setDescription('Set level-up announce channel')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Announce channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('rewards')
        .setDescription('Level reward roles (admin)')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add a role reward for a level')
            .addIntegerOption((opt) => opt.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(100000))
            .addRoleOption((opt) => opt.setName('role').setDescription('Reward role').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a role reward for a level')
            .addIntegerOption((opt) => opt.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(100000)),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('List configured level rewards')),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'level', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'me') {
      const state = await levelsService.getUserState(interaction.guild.id, interaction.user.id);
      const embed = new EmbedBuilder()
        .setTitle('🟧 Your Level')
        .addFields(
          { name: 'Level', value: String(state.level || 0), inline: true },
          { name: 'XP', value: String(state.xp || 0), inline: true },
        )
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (!group && sub === 'leaderboard') {
      const top = await levelsService.getTopUsers(interaction.guild.id, 10);
      if (!top.length) return interaction.editReply('No leaderboard data yet. Start chatting to earn XP.');

      const lines: string[] = [];
      for (let i = 0; i < top.length; i++) {
        const entry = top[i];
        const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
        const name = member ? member.user.tag : `<@${entry.userId}>`;
        lines.push(`**#${i + 1}** ${name} — Level **${entry.level}** (${entry.xp} XP)`);
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Levels Leaderboard')
        .setDescription(lines.join('\n'))
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    if (group === 'config') {
      if (sub === 'enable') {
        await levelsService.updateSettings(interaction.guild.id, { enabled: true });
        await logModAction(interaction.guild, buildEmbed('✅ Levels Enabled', interaction.user, [], 0x00aa00));
        return interaction.editReply('✅ Levels enabled.');
      }
      if (sub === 'disable') {
        await levelsService.updateSettings(interaction.guild.id, { enabled: false });
        await logModAction(interaction.guild, buildEmbed('🛑 Levels Disabled', interaction.user, [], 0xff0000));
        return interaction.editReply('✅ Levels disabled.');
      }
      if (sub === 'set-xp') {
        const amount = interaction.options.getInteger('amount');
        await levelsService.updateSettings(interaction.guild.id, { xpPerMessage: amount });
        await logModAction(interaction.guild, buildEmbed('⚙️ Levels XP Updated', interaction.user, [{ name: 'XP/msg', value: String(amount) }]));
        return interaction.editReply(`✅ XP per message set to **${amount}**.`);
      }
      if (sub === 'set-cooldown') {
        const seconds = interaction.options.getInteger('seconds');
        await levelsService.updateSettings(interaction.guild.id, { messageCooldownMs: seconds * 1000 });
        await logModAction(interaction.guild, buildEmbed('⚙️ Levels Cooldown Updated', interaction.user, [{ name: 'Cooldown', value: `${seconds}s` }]));
        return interaction.editReply(`✅ Cooldown set to **${seconds}s**.`);
      }
      if (sub === 'set-announce') {
        const channel = interaction.options.getChannel('channel');
        await levelsService.updateSettings(interaction.guild.id, { announceChannelId: channel.id });
        await logModAction(interaction.guild, buildEmbed('📣 Levels Announce Channel', interaction.user, [{ name: 'Channel', value: `${channel}` }]));
        return interaction.editReply(`✅ Level-up announcements set to ${channel}.`);
      }
    }

    if (group === 'rewards') {
      const settings = await levelsService.getSettings(interaction.guild.id);

      if (sub === 'list') {
        const lines = (settings.rewardRoles || [])
          .sort((a, b) => Number(a.level) - Number(b.level))
          .map((r) => `Level **${r.level}** → <@&${r.roleId}>`);
        const embed = new EmbedBuilder()
          .setTitle('🎁 Level Rewards')
          .setDescription(lines.length ? lines.join('\n') : 'No rewards configured.')
          .setColor(0xff6321)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'add') {
        const level = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');
        const next = (settings.rewardRoles || []).filter((r) => Number(r.level) !== level);
        next.push({ level, roleId: role.id });
        const ok = await confirmDangerousAction(interaction, `Add reward: Level **${level}** → ${role}?`);
        if (!ok) return;
        await levelsService.updateSettings(interaction.guild.id, { rewardRoles: next });
        await logModAction(interaction.guild, buildEmbed('🎁 Level Reward Added', interaction.user, [{ name: 'Level', value: String(level), inline: true }, { name: 'Role', value: `${role}`, inline: true }]));
        return interaction.editReply(`✅ Reward set: Level **${level}** → ${role}`);
      }

      if (sub === 'remove') {
        const level = interaction.options.getInteger('level');
        const next = (settings.rewardRoles || []).filter((r) => Number(r.level) !== level);
        const ok = await confirmDangerousAction(interaction, `Remove reward for Level **${level}**?`);
        if (!ok) return;
        await levelsService.updateSettings(interaction.guild.id, { rewardRoles: next });
        await logModAction(interaction.guild, buildEmbed('🧹 Level Reward Removed', interaction.user, [{ name: 'Level', value: String(level) }]));
        return interaction.editReply(`✅ Removed reward for Level **${level}**.`);
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};
