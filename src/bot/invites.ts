import { EmbedBuilder } from 'discord.ts';
import { client } from './client.ts';
import { invitesService } from '../lib/firebase-admin.ts';
import { logModAction } from './commands/mod-utils.ts';

const inviteCache = new Map<string, Map<string, number>>(); // guildId -> code -> uses

async function refreshGuildInvites(guild: any) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    invites.forEach((inv: any) => map.set(inv.code, Number(inv.uses || 0)));
    inviteCache.set(guild.id, map);
  } catch {
    // Missing permissions or intents; ignore
  }
}

function findUsedInvite(before: Map<string, number> | undefined, after: Map<string, number>) {
  if (!before) return null;
  for (const [code, uses] of after.entries()) {
    const prev = before.get(code) ?? 0;
    if (uses > prev) return code;
  }
  return null;
}

export function initInviteTracker() {
  client.on('ready', async () => {
    for (const [, guild] of client.guilds.cache) {
      await refreshGuildInvites(guild);
    }
  });

  client.on('inviteCreate', async (invite) => {
    if (!invite.guild) return;
    await refreshGuildInvites(invite.guild);
  });

  client.on('inviteDelete', async (invite) => {
    if (!invite.guild) return;
    await refreshGuildInvites(invite.guild);
  });

  client.on('guildMemberAdd', async (member) => {
    try {
      const settings = await invitesService.getSettings(member.guild.id);
      if (!settings.enabled) return;

      const before = inviteCache.get(member.guild.id);
      await refreshGuildInvites(member.guild);
      const after = inviteCache.get(member.guild.id);
      if (!after) return;

      const usedCode = findUsedInvite(before, after);
      if (!usedCode) return;

      const usedInvite = await member.guild.invites.fetch(usedCode).catch(() => null);
      const inviter = usedInvite?.inviter;
      if (!inviter) return;

      await invitesService.addInviteCredit(member.guild.id, inviter.id);

      const embed = new EmbedBuilder()
        .setTitle('📨 Invite Tracker')
        .setDescription(`${member} joined using invite **${usedCode}** by ${inviter}.`)
        .setColor(0xff6321)
        .setTimestamp();

      if (settings.logChannelId) {
        const ch = member.guild.channels.cache.get(settings.logChannelId);
        if (ch && (ch as any).isTextBased?.()) await (ch as any).send({ embeds: [embed] });
      } else {
        await logModAction(member.guild, embed).catch(() => {});
      }
    } catch (e) {
      console.error('Invite tracker error:', e);
    }
  });
}

