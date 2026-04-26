import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.ts';
import { client } from './client.ts';
import { economyService, economyShopService, type EconomySettings } from '../lib/firebase-admin.ts';

const PANEL_PREFIX = 'econ_panel_';
const SHOP_SELECT_ID = 'econ_shop_select';

export function buildEconomyPanelMessage(settings: EconomySettings) {
  const embed = new EmbedBuilder()
    .setTitle('🟧 Economy Panel')
    .setDescription(`Currency: **${settings.currencyName}**\nUse the buttons below.`)
    .setColor(0xff6321)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}balance`).setLabel('Balance').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}daily`).setLabel('Daily').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}leaderboard`).setLabel('Leaderboard').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}shop`).setLabel('Shop').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

export async function buildShopMessage(guildId: string, settings: EconomySettings) {
  const items = await economyShopService.listItems(guildId);

  const lines =
    items.length === 0
      ? ['No items available yet. Ask an admin to add some with `/economy shop add`.']
      : items.slice(0, 25).map((it, idx) => {
          const left = it.stock === null ? '∞' : String(Math.max(0, it.stock - (it.soldCount || 0)));
          const roleHint = it.roleId ? ` (role)` : '';
          return `**${idx + 1}** ${it.name} — **${it.price}** ${settings.currencyName} — left: **${left}**${roleHint}`;
        });

  const embed = new EmbedBuilder().setTitle('🛒 Shop').setDescription(lines.join('\n')).setColor(0xff6321).setTimestamp();

  if (!items.length) return { embeds: [embed], components: [] as any[] };

  const menu = new StringSelectMenuBuilder().setCustomId(SHOP_SELECT_ID).setPlaceholder('Select an item to buy it');

  for (const it of items.slice(0, 25)) {
    const left = it.stock === null ? null : Math.max(0, it.stock - (it.soldCount || 0));
    const outOfStock = left !== null && left <= 0;
    menu.addOptions({
      label: it.name.slice(0, 100),
      value: it.itemId,
      description: `${it.price} ${settings.currencyName}${left === null ? '' : ` • left ${left}`}`.slice(0, 100),
      default: false,
      emoji: undefined,
    });
    if (outOfStock) {
      // Discord doesn't support per-option disabling; handled in purchase validation.
    }
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

async function handlePanelButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = String(interaction.customId || '');
  if (!id.startsWith(PANEL_PREFIX)) return false;
  if (!interaction.inGuild()) return false;

  const action = id.slice(PANEL_PREFIX.length);
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const settings = await economyService.getSettings(interaction.guildId);

  if (action === 'balance') {
    const wallet = await economyService.getWallet(interaction.guildId, interaction.user.id);
    const embed = new EmbedBuilder()
      .setTitle('🟧 Balance')
      .setDescription(`**Wallet:** ${wallet.balance} ${settings.currencyName}\n**Bank:** ${wallet.bank} ${settings.currencyName}`)
      .setColor(0xff6321)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return true;
  }

  if (action === 'daily') {
    if (!settings.enabled) {
      await interaction.editReply('❌ Economy is disabled.');
      return true;
    }
    const wallet = await economyService.getWallet(interaction.guildId, interaction.user.id);
    const last = wallet.lastDailyAt ? Date.parse(wallet.lastDailyAt) : 0;
    const now = Date.now();
    if (last && now - last < settings.dailyCooldownMs) {
      const next = Math.floor((last + settings.dailyCooldownMs) / 1000);
      await interaction.editReply(`⏳ You already claimed daily. Come back <t:${next}:R>.`);
      return true;
    }
    await economyService.addBalance(interaction.guildId, interaction.user.id, settings.dailyAmount, { lastDailyAt: new Date(now).toISOString() });
    await interaction.editReply(`✅ Claimed **${settings.dailyAmount}** ${settings.currencyName}.`);
    return true;
  }

  if (action === 'leaderboard') {
    const top = await economyService.getTopWallets(interaction.guildId, 10);
    if (!top.length) {
      await interaction.editReply('No economy data yet.');
      return true;
    }
    const lines: string[] = [];
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const member = await interaction.guild!.members.fetch(entry.userId).catch(() => null);
      const name = member ? member.user.tag : `<@${entry.userId}>`;
      lines.push(`**#${i + 1}** ${name} — **${entry.balance}** ${settings.currencyName}`);
    }
    const embed = new EmbedBuilder().setTitle('🏆 Economy Leaderboard').setDescription(lines.join('\n')).setColor(0xff6321).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return true;
  }

  if (action === 'shop') {
    await interaction.editReply(await buildShopMessage(interaction.guildId, settings));
    return true;
  }

  await interaction.editReply('❌ Unknown panel action.');
  return true;
}

async function handleShopSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== SHOP_SELECT_ID) return false;
  if (!interaction.inGuild()) return false;
  const itemId = interaction.values?.[0];
  if (!itemId) return false;

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const settings = await economyService.getSettings(interaction.guildId);
  if (!settings.enabled) {
    await interaction.editReply('❌ Economy is disabled.');
    return true;
  }

  const result = await economyShopService.purchase(interaction.guildId, interaction.user.id, itemId);
  if (!result.ok) {
    await interaction.editReply(`❌ ${result.reason || 'Purchase failed.'}`);
    return true;
  }

  // Role reward (best-effort)
  const roleId = result.item?.roleId;
  if (roleId && interaction.guild) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const role = interaction.guild.roles.cache.get(roleId) || (await interaction.guild.roles.fetch(roleId).catch(() => null));
    if (member && role) {
      await member.roles.add(role).catch(() => {});
    }
  }

  const name = result.item?.name || 'Item';
  await interaction.editReply(`✅ Purchased **${name}** for **${result.item?.price ?? 0}** ${settings.currencyName}.`);

  // Best-effort refresh of the shop panel message (if this was a public message)
  try {
    const msg = interaction.message;
    if (msg && msg.editable) {
      await msg.edit(await buildShopMessage(interaction.guildId, settings));
    }
  } catch {
    // ignore
  }

  return true;
}

export function initEconomyUi() {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        const handled = await handlePanelButton(interaction as any);
        if (handled) return;
      }
      if (interaction.isStringSelectMenu()) {
        const handled = await handleShopSelect(interaction as any);
        if (handled) return;
      }
    } catch (e) {
      console.error('Economy UI handler error:', e);
    }
  });
}

