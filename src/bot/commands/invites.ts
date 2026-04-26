import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { invitesService } from '../../lib/firebase-admin.ts';
import { checkCooldown, logModAction } from './mod-utils.ts';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase-admin.ts';

export const invitesCommand = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite tracker and leaderboard')
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Show top inviters'))
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Show invites for a user')
        .addUserOption((opt) => opt.setName('member').setDescription('User').setRequired(true)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure invite tracking (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable invite tracking'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable invite tracking'))
        .addSubcommand((sub) =>
          sub
            .setName('set-log-channel')
            .setDescription('Set invite log channel')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Text channel for logs')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'invites', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'config') {
      const isAdmin =
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

      if (sub === 'enable') {
        await invitesService.updateSettings(interaction.guild.id, { enabled: true });
        await logModAction(interaction.guild, new EmbedBuilder().setTitle('✅ Invite Tracking Enabled').setColor(0x00aa00).setTimestamp());
        return interaction.editReply('✅ Invite tracking enabled.');
      }
      if (sub === 'disable') {
        await invitesService.updateSettings(interaction.guild.id, { enabled: false });
        await logModAction(interaction.guild, new EmbedBuilder().setTitle('🛑 Invite Tracking Disabled').setColor(0xff0000).setTimestamp());
        return interaction.editReply('✅ Invite tracking disabled.');
      }
      if (sub === 'set-log-channel') {
        const channel = interaction.options.getChannel('channel');
        await invitesService.updateSettings(interaction.guild.id, { logChannelId: channel.id });
        return interaction.editReply(`✅ Invite log channel set to ${channel}.`);
      }
    }

    if (!group && sub === 'user') {
      const member = interaction.options.getUser('member');
      const snap = await getDoc(doc(db, 'guilds', interaction.guild.id, 'inviteStats', member.id));
      const count = snap.exists() ? Number((snap.data() as any).count || 0) : 0;
      return interaction.editReply(`📨 ${member} has **${count}** invites.`);
    }

    if (!group && sub === 'leaderboard') {
      const col = collection(db, 'guilds', interaction.guild.id, 'inviteStats');
      const q = query(col, orderBy('count', 'desc'), limit(10));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return interaction.editReply('No invite stats yet.');

      const lines: string[] = [];
      let i = 1;
      for (const d of snapshot.docs) {
        const userId = d.id;
        const data = d.data() as any;
        const count = Number(data.count || 0);
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        const name = member ? member.user.tag : `<@${userId}>`;
        lines.push(`**#${i++}** ${name} — **${count}** invites`);
      }

      const embed = new EmbedBuilder().setTitle('🏆 Invites Leaderboard').setDescription(lines.join('\n')).setColor(0xff6321).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

