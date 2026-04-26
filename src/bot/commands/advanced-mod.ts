import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type GuildMember } from 'discord.ts';
import { checkCooldown, confirmDangerousAction, logModAction, canActOnTarget, botCanActOnTarget } from './mod-utils.ts';
import { modService } from '../../lib/firebase-admin.ts';
import { EmbedBuilder } from 'discord.ts';

function parseIds(input: string): string[] {
  return input
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildEmbed(title: string, actor: any, fields: { name: string; value: string; inline?: boolean }[], color = 0xff6321) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields({ name: 'Actor', value: `${actor} (\`${actor.id}\`)` }, ...fields)
    .setColor(color)
    .setTimestamp();
}

async function resolveJailRole(guild: any) {
  const settings = await modService.getSettings(guild.id);
  const jailRoleId = settings.jailRoleId;
  return (
    (jailRoleId ? guild.roles.cache.get(jailRoleId) : null) ||
    guild.roles.cache.find((r: any) => r.name.toLowerCase() === 'jailed' || r.name.toLowerCase() === 'jail') ||
    null
  );
}

async function assertActable(interaction: any, targetMember: GuildMember): Promise<string | null> {
  const actorMember = await interaction.guild.members.fetch(interaction.user.id);
  const botMember = await interaction.guild.members.fetchMe();
  return canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
}

export const massCommand = {
  data: new SlashCommandBuilder()
    .setName('mass')
    .setDescription('Bulk moderation actions')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban multiple users')
        .addStringOption((opt) => opt.setName('ids').setDescription('User IDs separated by space').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Kick multiple users')
        .addStringOption((opt) => opt.setName('ids').setDescription('User IDs separated by space').setRequired(true)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('role')
        .setDescription('Mass role management')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Give role to many')
            .addRoleOption((opt) => opt.setName('role').setDescription('Role to add').setRequired(true))
            .addStringOption((opt) => opt.setName('ids').setDescription('User IDs separated by space').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove role from many')
            .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true))
            .addStringOption((opt) => opt.setName('ids').setDescription('User IDs separated by space').setRequired(true)),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'mass', 12_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const ids = parseIds(interaction.options.getString('ids'));

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Run mass action **${group ? `${group} ${subcommand}` : subcommand}** on **${ids.length}** users?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;

    for (const id of ids) {
      try {
        if (group === 'role') {
          const role = interaction.options.getRole('role');
          const member = await interaction.guild.members.fetch(id);
          if (subcommand === 'add') await member.roles.add(role);
          else await member.roles.remove(role);
        } else if (subcommand === 'ban') {
          await interaction.guild.members.ban(id);
        } else if (subcommand === 'kick') {
          const member = await interaction.guild.members.fetch(id);
          await member.kick();
        }
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(
      interaction.guild,
      buildEmbed('🧰 Mass Action', interaction.user, [{ name: 'Action', value: group ? `${group} ${subcommand}` : subcommand }, { name: 'Result', value: `✅ ${success} / ❌ ${fail}` }], 0xffa500),
    );

    return interaction.editReply(`✅ Processed mass action: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const channelModCommand = {
  data: new SlashCommandBuilder()
    .setName('ch')
    .setDescription('Channel control tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) => sub.setName('hide').setDescription('Make channel invisible'))
    .addSubcommand((sub) => sub.setName('show').setDescription('Make channel visible'))
    .addSubcommand((sub) => sub.setName('nuke').setDescription('Recreate the channel and purge messages'))
    .addSubcommand((sub) => sub.setName('lock-all').setDescription('Lock all channels'))
    .addSubcommand((sub) => sub.setName('unlock-all').setDescription('Unlock all channels')),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'ch', 6_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (subcommand === 'nuke') {
      const ok = await confirmDangerousAction(interaction, `NUKE ${interaction.channel}? This deletes the channel and recreates it.`);
      if (!ok) return;

      const channel: any = interaction.channel;
      const position = channel.position;
      const parentId = channel.parentId;
      const name = channel.name;

      const newChannel = await channel.clone({ name, reason: `Nuked by ${interaction.user.tag}` });
      if (parentId) await newChannel.setParent(parentId);
      await newChannel.setPosition(position);
      await channel.delete(`Nuked by ${interaction.user.tag}`);
      await newChannel.send('☢️ Channel nuked.');

      await logModAction(interaction.guild, buildEmbed('☢️ /ch nuke', interaction.user, [{ name: 'Channel', value: `#${name}` }], 0xff0000));
      return interaction.editReply(`✅ Nuked: ${newChannel}`);
    }

    if (subcommand === 'hide') {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      await logModAction(interaction.guild, buildEmbed('🙈 /ch hide', interaction.user, [{ name: 'Channel', value: `${interaction.channel}` }]));
      return interaction.editReply('✅ Channel visibility: **HIDDEN**');
    }

    if (subcommand === 'show') {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
      await logModAction(interaction.guild, buildEmbed('👁️ /ch show', interaction.user, [{ name: 'Channel', value: `${interaction.channel}` }]));
      return interaction.editReply('✅ Channel visibility: **VISIBLE**');
    }

    if (subcommand === 'lock-all') {
      const ok = await confirmDangerousAction(interaction, 'Lock ALL text channels for @everyone?');
      if (!ok) return;

      const touched: string[] = [];
      interaction.guild.channels.cache.forEach(async (ch: any) => {
        if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
          try {
            await ch.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
            touched.push(ch.id);
          } catch {
            // ignore
          }
        }
      });

      await modService.updateSettings(interaction.guild.id, { lockdownEnabled: true, lockdownChannels: touched });
      await logModAction(interaction.guild, buildEmbed('🔒 /ch lock-all', interaction.user, [{ name: 'Channels', value: `${touched.length}` }], 0xff0000));
      return interaction.editReply('🔒 **Server LOCKDOWN enabled.**');
    }

    if (subcommand === 'unlock-all') {
      const ok = await confirmDangerousAction(interaction, 'Unlock ALL text channels for @everyone?');
      if (!ok) return;

      const settings = await modService.getSettings(interaction.guild.id);
      const channels = settings.lockdownChannels || [];
      for (const id of channels) {
        const ch = interaction.guild.channels.cache.get(id);
        if (!ch) continue;
        try {
          await (ch as any).permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
        } catch {
          // ignore
        }
      }
      await modService.updateSettings(interaction.guild.id, { lockdownEnabled: false, lockdownChannels: [] });
      await logModAction(interaction.guild, buildEmbed('🔓 /ch unlock-all', interaction.user, [], 0x00aa00));
      return interaction.editReply('🔓 **Server LOCKDOWN removed.**');
    }
  },
};

export const highModCommand = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('High-level moderation tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('role-all')
        .setDescription('Give role to EVERYONE')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to give everyone').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('jail')
        .setDescription('Jail a user')
        .addUserOption((opt) => opt.setName('target').setDescription('Target user').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unjail')
        .setDescription('Unjail a user')
        .addUserOption((opt) => opt.setName('target').setDescription('Target user').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('voice-kick')
        .setDescription('Remove user from voice')
        .addUserOption((opt) => opt.setName('target').setDescription('Target user').setRequired(true)),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'mod', 6_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (subcommand === 'role-all') {
      const role = interaction.options.getRole('role');
      const ok = await confirmDangerousAction(interaction, `Add ${role} to **EVERYONE** in this server?`);
      if (!ok) return;

      const members = await interaction.guild.members.fetch();
      let success = 0;
      let fail = 0;
      for (const [, m] of members) {
        try {
          await m.roles.add(role);
          success++;
        } catch {
          fail++;
        }
      }
      await logModAction(interaction.guild, buildEmbed('🌍 /mod role-all', interaction.user, [{ name: 'Role', value: `${role}` }, { name: 'Result', value: `✅ ${success} / ❌ ${fail}` }], 0xff0000));
      return interaction.editReply(`✅ Started adding role ${role} to **${members.size}** members.`);
    }

    if (subcommand === 'jail' || subcommand === 'unjail') {
      const target = interaction.options.getUser('target');
      const member = await interaction.guild.members.fetch(target.id);
      const deny = await assertActable(interaction, member);
      if (deny) return interaction.editReply(deny);

      const jailRole = await resolveJailRole(interaction.guild);
      if (!jailRole) return interaction.editReply('❌ No jail role configured. Use `/setjail <role>` first.');

      const ok = await confirmDangerousAction(interaction, `${subcommand === 'jail' ? 'Jail' : 'Unjail'} ${target}?`);
      if (!ok) return;

      if (subcommand === 'jail') await member.roles.add(jailRole);
      else await member.roles.remove(jailRole);

      await logModAction(interaction.guild, buildEmbed(`⛓️ /mod ${subcommand}`, interaction.user, [{ name: 'Target', value: `${target}` }, { name: 'Role', value: `${jailRole}` }], subcommand === 'jail' ? 0xff0000 : 0x00aa00));
      return interaction.editReply(`✅ ${subcommand === 'jail' ? 'Jailed' : 'Unjailed'} ${target}.`);
    }

    if (subcommand === 'voice-kick') {
      const target = interaction.options.getUser('target');
      const member = await interaction.guild.members.fetch(target.id);
      if (!member.voice.channel) return interaction.editReply('❌ User is not in a voice channel.');

      const ok = await confirmDangerousAction(interaction, `Disconnect ${target} from voice?`);
      if (!ok) return;

      await member.voice.disconnect();
      await logModAction(interaction.guild, buildEmbed('🎤 /mod voice-kick', interaction.user, [{ name: 'Target', value: `${target}` }]));
      return interaction.editReply(`✅ Kicked **${target.tag}** from voice.`);
    }
  },
};

// Kept for backwards compatibility in case other code imports it, but it is NOT registered in src/bot/index.ts.
export const timeoutCommand = {
  data: new SlashCommandBuilder()
    .setName('timeout_legacy')
    .setDescription('Legacy timeout command (not registered)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction: any) {
    return interaction.reply({ content: 'This legacy command is not registered.', ephemeral: true });
  },
};
