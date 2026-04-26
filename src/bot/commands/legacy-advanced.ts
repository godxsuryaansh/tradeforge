import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { checkCooldown, confirmDangerousAction, logModAction, canActOnTarget, botCanActOnTarget } from './mod-utils.ts';
import { modService } from '../../lib/firebase-admin.ts';

function parseIds(input: string): string[] {
  return input
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDurationMs(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  const m = trimmed.match(/^(\d+)\s*([smhd])$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

async function ensureVoiceBanRole(guild: any): Promise<any> {
  const settings = await modService.getSettings(guild.id);
  if (settings.voiceBanRoleId) {
    const existing = guild.roles.cache.get(settings.voiceBanRoleId);
    if (existing) return existing;
  }

  let role = guild.roles.cache.find((r: any) => r.name.toLowerCase() === 'voicebanned' || r.name.toLowerCase() === 'voice-banned');
  if (!role) {
    role = await guild.roles.create({
      name: 'VoiceBanned',
      reason: 'Voice ban role used by moderation commands',
    });
  }

  await modService.updateSettings(guild.id, { voiceBanRoleId: role.id });

  // Deny voice connect/speak on all voice channels
  const voiceChannels = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
  for (const [, ch] of voiceChannels) {
    try {
      await ch.permissionOverwrites.edit(role.id, { Connect: false, Speak: false, Stream: false });
    } catch {
      // ignore
    }
  }

  return role;
}

function buildLogEmbed(title: string, actor: any, fields: { name: string; value: string; inline?: boolean }[], color = 0xff6321) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields(
      { name: 'Actor', value: `${actor} (\`${actor.id}\`)`, inline: false },
      ...fields,
    )
    .setColor(color)
    .setTimestamp();
}

export const massbanCommand = {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Ban multiple users at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((opt) => opt.setName('users').setDescription('User IDs separated by space/comma').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'massban', 15_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const ids = parseIds(interaction.options.getString('users'));
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Mass-ban **${ids.length}** users?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await interaction.guild.members.ban(id, { reason });
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(
      interaction.guild,
      buildLogEmbed('⛔ Mass Ban', interaction.user, [
        { name: 'Count', value: `✅ ${success} / ❌ ${fail}` },
        { name: 'Reason', value: reason },
      ], 0xff0000),
    );

    return interaction.editReply(`✅ Massban complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const masskickCommand = {
  data: new SlashCommandBuilder()
    .setName('masskick')
    .setDescription('Kick multiple users at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addStringOption((opt) => opt.setName('users').setDescription('User IDs separated by space/comma').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'masskick', 15_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const ids = parseIds(interaction.options.getString('users'));
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Mass-kick **${ids.length}** users?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const member = await interaction.guild.members.fetch(id);
        await member.kick(reason);
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(
      interaction.guild,
      buildLogEmbed('👢 Mass Kick', interaction.user, [
        { name: 'Count', value: `✅ ${success} / ❌ ${fail}` },
        { name: 'Reason', value: reason },
      ], 0xffa500),
    );

    return interaction.editReply(`✅ Masskick complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const massroleCommand = {
  data: new SlashCommandBuilder()
    .setName('massrole')
    .setDescription('Give/remove role to many users')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Give role to many users')
        .addRoleOption((opt) => opt.setName('role').setRequired(true).setDescription('Role'))
        .addStringOption((opt) => opt.setName('users').setRequired(true).setDescription('User IDs separated by space/comma')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove role from many users')
        .addRoleOption((opt) => opt.setName('role').setRequired(true).setDescription('Role'))
        .addStringOption((opt) => opt.setName('users').setRequired(true).setDescription('User IDs separated by space/comma')),
    ),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'massrole', 12_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    const ids = parseIds(interaction.options.getString('users'));

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `${sub === 'add' ? 'Add' : 'Remove'} ${role} for **${ids.length}** users?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const member = await interaction.guild.members.fetch(id);
        if (sub === 'add') await member.roles.add(role);
        else await member.roles.remove(role);
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(
      interaction.guild,
      buildLogEmbed(`🎭 Mass Role (${sub})`, interaction.user, [
        { name: 'Role', value: `${role} (\`${role.id}\`)` },
        { name: 'Count', value: `✅ ${success} / ❌ ${fail}` },
      ]),
    );

    return interaction.editReply(`✅ Massrole complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const massmuteCommand = {
  data: new SlashCommandBuilder()
    .setName('massmute')
    .setDescription('Mute (timeout) multiple users')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((opt) => opt.setName('users').setDescription('User IDs separated by space/comma').setRequired(true))
    .addIntegerOption((opt) => opt.setName('minutes').setDescription('Timeout duration in minutes').setMinValue(1))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'massmute', 15_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const ids = parseIds(interaction.options.getString('users'));
    const minutes = interaction.options.getInteger('minutes') ?? 10;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Mass-mute **${ids.length}** users for **${minutes}** minutes?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const member = await interaction.guild.members.fetch(id);
        await member.timeout(minutes * 60_000, reason);
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(
      interaction.guild,
      buildLogEmbed('🔇 Mass Mute', interaction.user, [
        { name: 'Duration', value: `${minutes} minutes` },
        { name: 'Count', value: `✅ ${success} / ❌ ${fail}` },
        { name: 'Reason', value: reason },
      ]),
    );

    return interaction.editReply(`✅ Massmute complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const massunmuteCommand = {
  data: new SlashCommandBuilder()
    .setName('massunmute')
    .setDescription('Unmute (remove timeout) multiple users')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((opt) => opt.setName('users').setDescription('User IDs separated by space/comma').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'massunmute', 12_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const ids = parseIds(interaction.options.getString('users'));
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply({ ephemeral: true });
    const ok = await confirmDangerousAction(interaction, `Mass-unmute **${ids.length}** users?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const member = await interaction.guild.members.fetch(id);
        await member.timeout(null, reason);
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(
      interaction.guild,
      buildLogEmbed('🔊 Mass Unmute', interaction.user, [
        { name: 'Count', value: `✅ ${success} / ❌ ${fail}` },
        { name: 'Reason', value: reason },
      ]),
    );

    return interaction.editReply(`✅ Massunmute complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const forceroleCommand = {
  data: new SlashCommandBuilder()
    .setName('forcerole')
    .setDescription('Force assign role (ignores restrictions)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'forcerole', 5_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const targetUser = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    await interaction.deferReply({ ephemeral: true });
    const actorMember = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = await interaction.guild.members.fetchMe();
    const targetMember = await interaction.guild.members.fetch(targetUser.id);

    const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
    if (deny) return interaction.editReply(deny);

    const ok = await confirmDangerousAction(interaction, `Force-add ${role} to ${targetUser}?`);
    if (!ok) return;

    try {
      await targetMember.roles.add(role);
      await logModAction(interaction.guild, buildLogEmbed('🧷 Force Role', interaction.user, [{ name: 'Target', value: `${targetUser} (\`${targetUser.id}\`)` }, { name: 'Role', value: `${role} (\`${role.id}\`)` }]));
      return interaction.editReply(`✅ Added ${role} to ${targetUser}.`);
    } catch (e: any) {
      return interaction.editReply(`❌ Failed to add role: ${e?.message ?? 'unknown error'}`);
    }
  },
};

export const roleallCommand = {
  data: new SlashCommandBuilder()
    .setName('roleall')
    .setDescription('Give role to ALL members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'roleall', 30_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const role = interaction.options.getRole('role');
    await interaction.deferReply({ ephemeral: true });

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

    await logModAction(interaction.guild, buildLogEmbed('🌍 Role All', interaction.user, [{ name: 'Role', value: `${role} (\`${role.id}\`)` }, { name: 'Count', value: `✅ ${success} / ❌ ${fail}` }], 0xff0000));
    return interaction.editReply(`✅ Role-all complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const deroleallCommand = {
  data: new SlashCommandBuilder()
    .setName('deroleall')
    .setDescription('Remove role from everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) => opt.setName('role').setDescription('Role').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'deroleall', 30_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const role = interaction.options.getRole('role');
    await interaction.deferReply({ ephemeral: true });

    const ok = await confirmDangerousAction(interaction, `Remove ${role} from **EVERYONE** in this server?`);
    if (!ok) return;

    const members = await interaction.guild.members.fetch();
    let success = 0;
    let fail = 0;
    for (const [, m] of members) {
      try {
        await m.roles.remove(role);
        success++;
      } catch {
        fail++;
      }
    }

    await logModAction(interaction.guild, buildLogEmbed('🧹 Derole All', interaction.user, [{ name: 'Role', value: `${role} (\`${role.id}\`)` }, { name: 'Count', value: `✅ ${success} / ❌ ${fail}` }], 0xff0000));
    return interaction.editReply(`✅ Derole-all complete: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const hidechannelCommand = {
  data: new SlashCommandBuilder()
    .setName('hidechannel')
    .setDescription('Makes channel invisible to members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'hidechannel', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    try {
      await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      await logModAction(interaction.guild, buildLogEmbed('🙈 Hide Channel', interaction.user, [{ name: 'Channel', value: `${channel}` }]));
      return interaction.editReply(`✅ Hidden: ${channel}`);
    } catch (e: any) {
      return interaction.editReply(`❌ Failed to hide channel: ${e?.message ?? 'unknown error'}`);
    }
  },
};

export const showchannelCommand = {
  data: new SlashCommandBuilder()
    .setName('showchannel')
    .setDescription('Makes channel visible again')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'showchannel', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    try {
      await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
      await logModAction(interaction.guild, buildLogEmbed('👁️ Show Channel', interaction.user, [{ name: 'Channel', value: `${channel}` }]));
      return interaction.editReply(`✅ Visible: ${channel}`);
    } catch (e: any) {
      return interaction.editReply(`❌ Failed to show channel: ${e?.message ?? 'unknown error'}`);
    }
  },
};

export const lockallCommand = {
  data: new SlashCommandBuilder()
    .setName('lockall')
    .setDescription('Locks ALL channels (no messaging)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'lockall', 20_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const ok = await confirmDangerousAction(interaction, 'Lock ALL text channels for @everyone?');
    if (!ok) return;

    const touched: string[] = [];
    for (const [, ch] of interaction.guild.channels.cache) {
      if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
        try {
          await ch.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
          touched.push(ch.id);
        } catch {
          // ignore
        }
      }
    }

    await modService.updateSettings(interaction.guild.id, { lockdownEnabled: true, lockdownChannels: touched });
    await logModAction(interaction.guild, buildLogEmbed('🔒 Lock All', interaction.user, [{ name: 'Channels', value: `${touched.length}` }], 0xff0000));
    return interaction.editReply(`✅ Lockdown enabled for **${touched.length}** channels.`);
  },
};

export const unlockallCommand = {
  data: new SlashCommandBuilder()
    .setName('unlockall')
    .setDescription('Unlocks all channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'unlockall', 20_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const ok = await confirmDangerousAction(interaction, 'Unlock ALL text channels for @everyone?');
    if (!ok) return;

    const settings = await modService.getSettings(interaction.guild.id);
    const channels = settings.lockdownChannels || [];
    let success = 0;
    for (const id of channels) {
      const ch = interaction.guild.channels.cache.get(id);
      if (!ch) continue;
      try {
        await ch.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
        success++;
      } catch {
        // ignore
      }
    }

    await modService.updateSettings(interaction.guild.id, { lockdownEnabled: false, lockdownChannels: [] });
    await logModAction(interaction.guild, buildLogEmbed('🔓 Unlock All', interaction.user, [{ name: 'Channels', value: `${success}` }], 0x00aa00));
    return interaction.editReply(`✅ Lockdown removed for **${success}** channels.`);
  },
};

export const slowmodeallCommand = {
  data: new SlashCommandBuilder()
    .setName('slowmodeall')
    .setDescription('Applies slowmode to all channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((opt) => opt.setName('seconds').setDescription('Slowmode seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21_600)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'slowmodeall', 15_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const seconds = interaction.options.getInteger('seconds');
    await interaction.deferReply({ ephemeral: true });

    const ok = await confirmDangerousAction(interaction, `Set slowmode to **${seconds}s** in all text channels?`);
    if (!ok) return;

    let success = 0;
    let fail = 0;
    for (const [, ch] of interaction.guild.channels.cache) {
      if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
        try {
          await ch.setRateLimitPerUser(seconds);
          success++;
        } catch {
          fail++;
        }
      }
    }

    await logModAction(interaction.guild, buildLogEmbed('🐢 Slowmode All', interaction.user, [{ name: 'Slowmode', value: `${seconds}s` }, { name: 'Count', value: `✅ ${success} / ❌ ${fail}` }]));
    return interaction.editReply(`✅ Slowmode updated: **${success}** succeeded, **${fail}** failed.`);
  },
};

export const clonechannelCommand = {
  data: new SlashCommandBuilder()
    .setName('clonechannel')
    .setDescription('Copies channel (same settings)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'clonechannel', 8_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    try {
      const newCh = await channel.clone();
      await logModAction(interaction.guild, buildLogEmbed('🧬 Clone Channel', interaction.user, [{ name: 'From', value: `${channel}` }, { name: 'To', value: `${newCh}` }]));
      return interaction.editReply(`✅ Cloned: ${newCh}`);
    } catch (e: any) {
      return interaction.editReply(`❌ Failed to clone channel: ${e?.message ?? 'unknown error'}`);
    }
  },
};

export const nukeCommand = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Deletes all messages in channel (recreates it)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'nuke', 20_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const ok = await confirmDangerousAction(interaction, `NUKE ${channel}? This will delete the channel and recreate it.`);
    if (!ok) return;

    const position = channel.position;
    const parentId = channel.parentId;
    const name = channel.name;
    const newChannel = await channel.clone({ name, reason: `Nuked by ${interaction.user.tag}` });
    if (parentId) await newChannel.setParent(parentId);
    await newChannel.setPosition(position);
    await channel.delete(`Nuked by ${interaction.user.tag}`);
    await newChannel.send('☢️ Channel nuked.');

    await logModAction(interaction.guild, buildLogEmbed('☢️ Nuke', interaction.user, [{ name: 'Channel', value: `#${name}` }], 0xff0000));
    return interaction.editReply(`✅ Nuked: ${newChannel}`);
  },
};

export const resetchannelCommand = {
  data: new SlashCommandBuilder()
    .setName('resetchannel')
    .setDescription('Clears + resets permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel (defaults to current)')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'resetchannel', 20_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (channel.type !== ChannelType.GuildText) {
      return interaction.editReply('❌ Only text channels are supported for resetchannel.');
    }

    const ok = await confirmDangerousAction(interaction, `Reset ${channel}? This recreates the channel with fresh permissions.`);
    if (!ok) return;

    const position = channel.position;
    const parentId = channel.parentId;
    const name = channel.name;
    const topic = channel.topic;

    const newChannel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId ?? undefined,
      topic: topic ?? undefined,
      reason: `Resetchannel by ${interaction.user.tag}`,
    });

    await newChannel.setPosition(position);
    await channel.delete(`Resetchannel by ${interaction.user.tag}`);
    await newChannel.send('✅ Channel reset.');

    await logModAction(interaction.guild, buildLogEmbed('🧨 Reset Channel', interaction.user, [{ name: 'Channel', value: `#${name}` }], 0xff0000));
    return interaction.editReply(`✅ Reset: ${newChannel}`);
  },
};

export const warnsetCommand = {
  data: new SlashCommandBuilder()
    .setName('warnset')
    .setDescription('Manually set warning count')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((opt) => opt.setName('count').setDescription('Warning count').setRequired(true).setMinValue(0).setMaxValue(100)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'warnset', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const count = interaction.options.getInteger('count');
    await interaction.deferReply({ ephemeral: true });

    await modService.setWarningCount(interaction.guild.id, user.id, count);
    await logModAction(interaction.guild, buildLogEmbed('⚠️ Warn Set', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Count', value: `${count}` }]));
    return interaction.editReply(`✅ Warning count for ${user} set to **${count}**.`);
  },
};

export const warnresetCommand = {
  data: new SlashCommandBuilder()
    .setName('warnreset')
    .setDescription('Clears all warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'warnreset', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });
    await modService.resetWarnings(interaction.guild.id, user.id);
    await logModAction(interaction.guild, buildLogEmbed('🧽 Warn Reset', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }]));
    return interaction.editReply(`✅ Warnings cleared for ${user}.`);
  },
};

export const warnremoveCommand = {
  data: new SlashCommandBuilder()
    .setName('warnremove')
    .setDescription('Removes one warning')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'warnremove', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    await modService.removeWarning(interaction.guild.id, user.id);
    const count = await modService.getWarningCount(interaction.guild.id, user.id);
    await logModAction(interaction.guild, buildLogEmbed('➖ Warn Remove', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'New Count', value: `${count}` }]));
    return interaction.editReply(`✅ Removed one warning from ${user}. New count: **${count}**.`);
  },
};

export const timeoutCommandExact = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily restrict messaging')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption((opt) => opt.setName('time').setDescription('Duration like 10m, 1h, 2d').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'timeout', 5_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const time = interaction.options.getString('time');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const ms = parseDurationMs(time);
    if (!ms) return interaction.reply({ content: '❌ Invalid time. Use `10m`, `1h`, `2d`, etc.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const actorMember = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = await interaction.guild.members.fetchMe();
    const targetMember = await interaction.guild.members.fetch(user.id);

    const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
    if (deny) return interaction.editReply(deny);

    await targetMember.timeout(ms, reason);
    await logModAction(interaction.guild, buildLogEmbed('⏱️ Timeout', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Duration', value: time }, { name: 'Reason', value: reason }]));
    return interaction.editReply(`✅ Timed out ${user} for **${time}**.`);
  },
};

export const untimeoutCommand = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Removes timeout')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'untimeout', 5_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.deferReply({ ephemeral: true });

    const actorMember = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = await interaction.guild.members.fetchMe();
    const targetMember = await interaction.guild.members.fetch(user.id);

    const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
    if (deny) return interaction.editReply(deny);

    await targetMember.timeout(null, reason);
    await logModAction(interaction.guild, buildLogEmbed('✅ Untimeout', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Reason', value: reason }], 0x00aa00));
    return interaction.editReply(`✅ Removed timeout for ${user}.`);
  },
};

export const setjailCommand = {
  data: new SlashCommandBuilder()
    .setName('setjail')
    .setDescription('Defines jail role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) => opt.setName('role').setDescription('Jail role').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'setjail', 5_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const role = interaction.options.getRole('role');
    await interaction.deferReply({ ephemeral: true });
    await modService.updateSettings(interaction.guild.id, { jailRoleId: role.id });
    await logModAction(interaction.guild, buildLogEmbed('🔐 Set Jail Role', interaction.user, [{ name: 'Role', value: `${role} (\`${role.id}\`)` }]));
    return interaction.editReply(`✅ Jail role set to ${role}.`);
  },
};

export const jailCommand = {
  data: new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Moves user to “jail role” (no perms)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'jail', 6_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.deferReply({ ephemeral: true });

    const settings = await modService.getSettings(interaction.guild.id);
    const jailRoleId = settings.jailRoleId;
    const jailRole =
      (jailRoleId ? interaction.guild.roles.cache.get(jailRoleId) : null) ||
      interaction.guild.roles.cache.find((r: any) => r.name.toLowerCase() === 'jailed' || r.name.toLowerCase() === 'jail');

    if (!jailRole) {
      return interaction.editReply('❌ No jail role configured. Use `/setjail <role>` first.');
    }

    const actorMember = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = await interaction.guild.members.fetchMe();
    const targetMember = await interaction.guild.members.fetch(user.id);

    const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
    if (deny) return interaction.editReply(deny);

    const ok = await confirmDangerousAction(interaction, `Jail ${user} (add ${jailRole})?`);
    if (!ok) return;

    await targetMember.roles.add(jailRole, reason);
    await logModAction(interaction.guild, buildLogEmbed('⛓️ Jail', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Role', value: `${jailRole} (\`${jailRole.id}\`)` }, { name: 'Reason', value: reason }], 0xff0000));
    return interaction.editReply(`✅ Jailed ${user}.`);
  },
};

export const unjailCommand = {
  data: new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('Restores access')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'unjail', 6_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.deferReply({ ephemeral: true });

    const settings = await modService.getSettings(interaction.guild.id);
    const jailRoleId = settings.jailRoleId;
    const jailRole =
      (jailRoleId ? interaction.guild.roles.cache.get(jailRoleId) : null) ||
      interaction.guild.roles.cache.find((r: any) => r.name.toLowerCase() === 'jailed' || r.name.toLowerCase() === 'jail');

    if (!jailRole) {
      return interaction.editReply('❌ No jail role configured. Use `/setjail <role>` first.');
    }

    const actorMember = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = await interaction.guild.members.fetchMe();
    const targetMember = await interaction.guild.members.fetch(user.id);

    const deny = canActOnTarget(actorMember, targetMember) || botCanActOnTarget(botMember, targetMember);
    if (deny) return interaction.editReply(deny);

    await targetMember.roles.remove(jailRole, reason);
    await logModAction(interaction.guild, buildLogEmbed('🔓 Unjail', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Role', value: `${jailRole} (\`${jailRole.id}\`)` }, { name: 'Reason', value: reason }], 0x00aa00));
    return interaction.editReply(`✅ Unjailed ${user}.`);
  },
};

export const voicekickCommand = {
  data: new SlashCommandBuilder()
    .setName('voicekick')
    .setDescription('Removes user from voice channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'voicekick', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    const targetMember = await interaction.guild.members.fetch(user.id);
    if (!targetMember.voice.channel) return interaction.editReply('❌ User is not in a voice channel.');

    const ok = await confirmDangerousAction(interaction, `Disconnect ${user} from voice?`);
    if (!ok) return;

    await targetMember.voice.disconnect();
    await logModAction(interaction.guild, buildLogEmbed('📢 Voice Kick', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }]));
    return interaction.editReply(`✅ Disconnected ${user} from voice.`);
  },
};

export const voicemuteCommand = {
  data: new SlashCommandBuilder()
    .setName('voicemute')
    .setDescription('Mute user in voice channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'voicemute', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    const targetMember = await interaction.guild.members.fetch(user.id);
    if (!targetMember.voice.channel) return interaction.editReply('❌ User is not in a voice channel.');

    await targetMember.voice.setMute(true, `Muted by ${interaction.user.tag}`);
    await logModAction(interaction.guild, buildLogEmbed('🔇 Voice Mute', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }]));
    return interaction.editReply(`✅ Voice-muted ${user}.`);
  },
};

export const voiceunmuteCommand = {
  data: new SlashCommandBuilder()
    .setName('voiceunmute')
    .setDescription('Unmute user in voice channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true)),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'voiceunmute', 4_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    const targetMember = await interaction.guild.members.fetch(user.id);
    if (!targetMember.voice.channel) return interaction.editReply('❌ User is not in a voice channel.');

    await targetMember.voice.setMute(false, `Unmuted by ${interaction.user.tag}`);
    await logModAction(interaction.guild, buildLogEmbed('🔊 Voice Unmute', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }]));
    return interaction.editReply(`✅ Voice-unmuted ${user}.`);
  },
};

export const voicebanCommand = {
  data: new SlashCommandBuilder()
    .setName('voiceban')
    .setDescription('Block user from joining VC')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'voiceban', 8_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.deferReply({ ephemeral: true });

    const ok = await confirmDangerousAction(interaction, `Voice-ban ${user}?`);
    if (!ok) return;

    const role = await ensureVoiceBanRole(interaction.guild);
    const targetMember = await interaction.guild.members.fetch(user.id);
    await targetMember.roles.add(role, reason);
    if (targetMember.voice.channel) {
      await targetMember.voice.disconnect().catch(() => {});
    }

    await logModAction(interaction.guild, buildLogEmbed('🚫 Voice Ban', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Role', value: `${role} (\`${role.id}\`)` }, { name: 'Reason', value: reason }], 0xff0000));
    return interaction.editReply(`✅ Voice-banned ${user}.`);
  },
};

export const voiceunbanCommand = {
  data: new SlashCommandBuilder()
    .setName('voiceunban')
    .setDescription('Unblock from joining VC')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'voiceunban', 8_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.deferReply({ ephemeral: true });

    const settings = await modService.getSettings(interaction.guild.id);
    const role = settings.voiceBanRoleId ? interaction.guild.roles.cache.get(settings.voiceBanRoleId) : null;
    if (!role) return interaction.editReply('❌ Voice ban role not configured yet.');

    const targetMember = await interaction.guild.members.fetch(user.id);
    await targetMember.roles.remove(role, reason);

    await logModAction(interaction.guild, buildLogEmbed('✅ Voice Unban', interaction.user, [{ name: 'Target', value: `${user} (\`${user.id}\`)` }, { name: 'Role', value: `${role} (\`${role.id}\`)` }, { name: 'Reason', value: reason }], 0x00aa00));
    return interaction.editReply(`✅ Voice-unbanned ${user}.`);
  },
};

