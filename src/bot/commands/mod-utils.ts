import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
} from 'discord.ts';

const DEFAULT_CONFIRM_TIMEOUT_MS = 20_000;

const cooldowns = new Map<string, number>();

export function checkCooldown(userId: string, key: string, cooldownMs: number): string | null {
  const now = Date.now();
  const cdKey = `${userId}:${key}`;
  const last = cooldowns.get(cdKey) ?? 0;
  if (now - last < cooldownMs) {
    const leftSeconds = Math.ceil((cooldownMs - (now - last)) / 100) / 10;
    return `⏳ Cooldown: try again in ${leftSeconds}s.`;
  }
  cooldowns.set(cdKey, now);
  return null;
}

export function findTextChannelByName(guild: Guild, lowerName: string): any {
  return guild.channels.cache.find(
    (c: any) => c?.isTextBased?.() && typeof c?.name === 'string' && c.name.toLowerCase() === lowerName,
  );
}

export async function logModAction(guild: Guild, embed: EmbedBuilder) {
  const channel: any = findTextChannelByName(guild, 'mod-logs') || findTextChannelByName(guild, 'logs');
  if (!channel) return;
  await channel.send({ embeds: [embed] });
}

export function canActOnTarget(actor: GuildMember, target: GuildMember): string | null {
  if (actor.guild.ownerId === actor.id) return null;
  if (actor.guild.ownerId === target.id) return '❌ You cannot moderate the server owner.';
  if (target.permissions.has(PermissionFlagsBits.Administrator)) {
    return '❌ You cannot moderate an administrator.';
  }
  if (actor.roles.highest.position <= target.roles.highest.position) {
    return '❌ You cannot moderate a member with an equal/higher role than you.';
  }
  return null;
}

export function botCanActOnTarget(botMember: GuildMember, target: GuildMember): string | null {
  if (target.guild.ownerId === target.id) return '❌ I cannot moderate the server owner.';
  if (botMember.roles.highest.position <= target.roles.highest.position) {
    return '❌ My role is not high enough to moderate that member.';
  }
  return null;
}

export async function confirmDangerousAction(interaction: any, prompt: string, timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const msg = await interaction.editReply({
    content: `⚠️ ${prompt}`,
    components: [row],
  });

  try {
    const click = await msg.awaitMessageComponent({
      time: timeoutMs,
      filter: (i: any) => i.user.id === interaction.user.id,
    });

    if (click.customId === 'confirm_yes') {
      await click.update({ content: '✅ Confirmed.', components: [] });
      return true;
    }
    await click.update({ content: '❎ Cancelled.', components: [] });
    return false;
  } catch {
    try {
      await interaction.editReply({ content: '⌛ Confirmation timed out.', components: [] });
    } catch {
      // ignore
    }
    return false;
  }
}
