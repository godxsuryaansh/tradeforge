import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.ts';
import { economyService, economyShopService } from '../../lib/firebase-admin.ts';
import { checkCooldown, confirmDangerousAction, logModAction } from './mod-utils.ts';
import { buildEconomyPanelMessage, buildShopMessage } from '../economy-ui.ts';

export const economyCommand = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Economy system')
    .addSubcommand((sub) =>
      sub
        .setName('daily')
        .setDescription('Cash in your daily rewards'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deposit')
        .setDescription('Deposit cash to your bank')
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1_000_000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('destroy')
        .setDescription('Destroy the whole economy (deletes all Database-Entries)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Show richest users'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pay')
        .setDescription('Pay another user')
        .addUserOption((opt) => opt.setName('member').setDescription('Recipient').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1_000_000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rob')
        .setDescription('Rob some cash from another user')
        .addUserOption((opt) => opt.setName('member').setDescription('Target').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('withdraw')
        .setDescription('Withdraw cash from your bank')
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1_000_000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('balance')
        .setDescription('Show balance')
        .addUserOption((opt) => opt.setName('member').setDescription('User (optional)')),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('msg_drop_msg')
        .setDescription('Message-drop-message earnings toggle (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable the Message-Drop-Message'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable the Message-Drop-Message'))
        .addSubcommand((sub) => sub.setName('status').setDescription('Show Message-Drop-Message status')),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('panel')
        .setDescription('Economy panels (admin)')
        .addSubcommand((sub) =>
          sub
            .setName('send')
            .setDescription('Create and send an economy panel')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel to post panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('shop')
        .setDescription('Shop system')
        .addSubcommand((sub) => sub.setName('view').setDescription('View shop (select an item to buy)'))
        .addSubcommand((sub) =>
          sub
            .setName('panel')
            .setDescription('Post shop panel (select to buy)')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel to post shop')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('List shop items (admin)'))
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add shop item (admin)')
            .addStringOption((opt) => opt.setName('name').setDescription('Item name').setRequired(true).setMaxLength(80))
            .addIntegerOption((opt) => opt.setName('price').setDescription('Item price').setRequired(true).setMinValue(0).setMaxValue(1_000_000))
            .addIntegerOption((opt) => opt.setName('stock').setDescription('Stock (optional, unlimited if empty)').setMinValue(0).setMaxValue(100_000))
            .addRoleOption((opt) => opt.setName('role').setDescription('Role reward (optional)'))
            .addStringOption((opt) => opt.setName('item_id').setDescription('Custom item id (optional)').setMaxLength(64)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove shop item (admin)')
            .addStringOption((opt) => opt.setName('item_id').setDescription('Item id').setRequired(true).setMaxLength(64)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-stock')
            .setDescription('Set shop stock (admin)')
            .addStringOption((opt) => opt.setName('item_id').setDescription('Item id').setRequired(true).setMaxLength(64))
            .addIntegerOption((opt) => opt.setName('stock').setDescription('Stock').setRequired(true).setMinValue(0).setMaxValue(100_000)),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('manage')
        .setDescription('Manage user balances (admin)')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add some cash to a user')
            .addUserOption((opt) => opt.setName('member').setDescription('User').setRequired(true))
            .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1_000_000)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove some cash from a user')
            .addUserOption((opt) => opt.setName('member').setDescription('User').setRequired(true))
            .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1_000_000)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Set user wallet + bank')
            .addUserOption((opt) => opt.setName('member').setDescription('User').setRequired(true))
            .addIntegerOption((opt) => opt.setName('wallet').setDescription('Wallet').setRequired(true).setMinValue(0).setMaxValue(10_000_000))
            .addIntegerOption((opt) => opt.setName('bank').setDescription('Bank').setRequired(true).setMinValue(0).setMaxValue(10_000_000)),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure economy (admin)')
        .addSubcommand((sub) => sub.setName('enable').setDescription('Enable economy'))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable economy'))
        .addSubcommand((sub) =>
          sub
            .setName('set-currency')
            .setDescription('Set currency name')
            .addStringOption((opt) => opt.setName('name').setDescription('Currency name').setRequired(true).setMaxLength(32)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-earn')
            .setDescription('Set earn per message and cooldown seconds')
            .addIntegerOption((opt) => opt.setName('amount').setDescription('Earn per message').setRequired(true).setMinValue(0).setMaxValue(1000))
            .addIntegerOption((opt) => opt.setName('cooldown').setDescription('Cooldown seconds').setRequired(true).setMinValue(0).setMaxValue(3600)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('set-daily')
            .setDescription('Set daily amount and cooldown hours')
            .addIntegerOption((opt) => opt.setName('amount').setDescription('Daily amount').setRequired(true).setMinValue(0).setMaxValue(1_000_000))
            .addIntegerOption((opt) => opt.setName('hours').setDescription('Cooldown hours').setRequired(true).setMinValue(1).setMaxValue(168)),
        ),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'economy', 2_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const settings = await economyService.getSettings(interaction.guild.id);

    if (!group && sub === 'balance') {
      const member = interaction.options.getUser('member') || interaction.user;
      const wallet = await economyService.getWallet(interaction.guild.id, member.id);
      const embed = new EmbedBuilder()
        .setTitle('🟧 Balance')
        .setDescription(`${member}\n\n**Wallet:** ${wallet.balance} ${settings.currencyName}\n**Bank:** ${wallet.bank} ${settings.currencyName}`)
        .setColor(0xff6321)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (!group && sub === 'leaderboard') {
      const top = await economyService.getTopWallets(interaction.guild.id, 10);
      if (!top.length) return interaction.editReply('No economy data yet.');
      const lines: string[] = [];
      for (let i = 0; i < top.length; i++) {
        const entry = top[i];
        const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
        const name = member ? member.user.tag : `<@${entry.userId}>`;
        lines.push(`**#${i + 1}** ${name} — **${entry.balance}** ${settings.currencyName}`);
      }
      const embed = new EmbedBuilder().setTitle('🏆 Economy Leaderboard').setDescription(lines.join('\n')).setColor(0xff6321).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (!group && sub === 'daily') {
      if (!settings.enabled) return interaction.editReply('❌ Economy is disabled.');
      const wallet = await economyService.getWallet(interaction.guild.id, interaction.user.id);
      const last = wallet.lastDailyAt ? Date.parse(wallet.lastDailyAt) : 0;
      const now = Date.now();
      if (last && now - last < settings.dailyCooldownMs) {
        const next = Math.floor((last + settings.dailyCooldownMs) / 1000);
        return interaction.editReply(`⏳ You already claimed daily. Come back <t:${next}:R>.`);
      }
      await economyService.addBalance(interaction.guild.id, interaction.user.id, settings.dailyAmount, { lastDailyAt: new Date(now).toISOString() });
      return interaction.editReply(`✅ Claimed **${settings.dailyAmount}** ${settings.currencyName}.`);
    }

    if (!group && sub === 'deposit') {
      if (!settings.enabled) return interaction.editReply('❌ Economy is disabled.');
      const amount = interaction.options.getInteger('amount');
      const ok = await confirmDangerousAction(interaction, `Deposit **${amount}** ${settings.currencyName} to your bank?`);
      if (!ok) return;
      const res = await economyService.deposit(interaction.guild.id, interaction.user.id, amount);
      if (!res.ok) return interaction.editReply(`❌ ${res.reason}`);
      return interaction.editReply(`✅ Deposited **${amount}** ${settings.currencyName}.`);
    }

    if (!group && sub === 'withdraw') {
      if (!settings.enabled) return interaction.editReply('❌ Economy is disabled.');
      const amount = interaction.options.getInteger('amount');
      const ok = await confirmDangerousAction(interaction, `Withdraw **${amount}** ${settings.currencyName} from your bank?`);
      if (!ok) return;
      const res = await economyService.withdraw(interaction.guild.id, interaction.user.id, amount);
      if (!res.ok) return interaction.editReply(`❌ ${res.reason}`);
      return interaction.editReply(`✅ Withdrew **${amount}** ${settings.currencyName}.`);
    }

    if (!group && sub === 'pay') {
      if (!settings.enabled) return interaction.editReply('❌ Economy is disabled.');
      const to = interaction.options.getUser('member');
      const amount = interaction.options.getInteger('amount');
      const ok = await confirmDangerousAction(interaction, `Pay ${to} **${amount}** ${settings.currencyName}?`);
      if (!ok) return;
      const result = await economyService.transfer(interaction.guild.id, interaction.user.id, to.id, amount);
      if (!result.ok) return interaction.editReply(`❌ ${result.reason}`);
      await logModAction(
        interaction.guild,
        new EmbedBuilder()
          .setTitle('💸 Economy Transfer')
          .addFields(
            { name: 'From', value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: 'To', value: `${to} (\`${to.id}\`)` },
            { name: 'Amount', value: `${amount} ${settings.currencyName}` },
          )
          .setColor(0xff6321)
          .setTimestamp(),
      ).catch(() => {});
      return interaction.editReply(`✅ Paid ${to} **${amount}** ${settings.currencyName}.`);
    }

    if (!group && sub === 'rob') {
      if (!settings.enabled) return interaction.editReply('❌ Economy is disabled.');
      const target = interaction.options.getUser('member');
      if (!target || target.bot) return interaction.editReply('❌ Invalid target.');
      if (target.id === interaction.user.id) return interaction.editReply('❌ You cannot rob yourself.');

      const me = await economyService.getWallet(interaction.guild.id, interaction.user.id);
      const now = Date.now();
      const lastRob = me.lastRobAt ? Date.parse(me.lastRobAt) : 0;
      const cooldownMs = 60 * 60 * 1000;
      if (lastRob && now - lastRob < cooldownMs) {
        const next = Math.floor((lastRob + cooldownMs) / 1000);
        return interaction.editReply(`⏳ You can rob again <t:${next}:R>.`);
      }

      const victim = await economyService.getWallet(interaction.guild.id, target.id);
      const victimBalance = Math.max(0, Math.floor(victim.balance || 0));
      if (victimBalance < 20) {
        await economyService.adjustBalances(interaction.guild.id, interaction.user.id, 0, 0, { lastRobAt: new Date(now).toISOString() });
        return interaction.editReply(`❌ ${target} is too broke to rob right now.`);
      }

      const ok = await confirmDangerousAction(interaction, `Try to rob ${target}? (cooldown 1h)`);
      if (!ok) return;

      const success = Math.random() < 0.35;
      const robAt = new Date(now).toISOString();

      if (success) {
        const steal = Math.max(5, Math.min(victimBalance, Math.floor(victimBalance * (0.1 + Math.random() * 0.15))));
        const take = await economyService.adjustBalances(interaction.guild.id, target.id, -steal, 0);
        if (!take.ok) {
          await economyService.adjustBalances(interaction.guild.id, interaction.user.id, 0, 0, { lastRobAt: robAt });
          return interaction.editReply(`❌ Rob failed: ${take.reason || 'target changed.'}`);
        }
        const give = await economyService.adjustBalances(interaction.guild.id, interaction.user.id, +steal, 0, { lastRobAt: robAt });
        if (!give.ok) return interaction.editReply(`❌ Rob failed: ${give.reason || 'wallet update failed.'}`);
        return interaction.editReply(`💰 Success! You stole **${steal}** ${settings.currencyName} from ${target}.`);
      }

      const fine = 10;
      const payFine = await economyService.adjustBalances(interaction.guild.id, interaction.user.id, -fine, 0, { lastRobAt: robAt });
      if (!payFine.ok) {
        await economyService.adjustBalances(interaction.guild.id, interaction.user.id, 0, 0, { lastRobAt: robAt });
        return interaction.editReply(`🚓 You got caught trying to rob ${target}... but you had no money to pay the fine.`);
      }
      return interaction.editReply(`🚓 You got caught trying to rob ${target} and paid a fine of **${fine}** ${settings.currencyName}.`);
    }

    if (!group && sub === 'destroy') {
      if (interaction.guild.ownerId !== interaction.user.id) return interaction.editReply('❌ Only the server owner can do this.');
      const ok = await confirmDangerousAction(interaction, 'Destroy the entire economy (wallets + bank + shop items) for this server?');
      if (!ok) return;
      const result = await economyService.destroyGuildEconomy(interaction.guild.id);
      if (!result.ok) return interaction.editReply('❌ Failed to destroy economy.');
      await logModAction(
        interaction.guild,
        new EmbedBuilder()
          .setTitle('💥 Economy Destroyed')
          .addFields(
            { name: 'Actor', value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: 'Deleted docs', value: String(result.deleted) },
          )
          .setColor(0xff6321)
          .setTimestamp(),
      ).catch(() => {});
      return interaction.editReply(`✅ Economy destroyed. Deleted **${result.deleted}** entries.`);
    }

    const isAdmin =
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (!isAdmin) return interaction.editReply('❌ You need `Administrator` or `Manage Server`.');

    if (group === 'msg_drop_msg') {
      if (sub === 'enable') {
        await economyService.updateSettings(interaction.guild.id, { messageEarningsEnabled: true });
        return interaction.editReply('✅ Message-Drop-Message enabled.');
      }
      if (sub === 'disable') {
        await economyService.updateSettings(interaction.guild.id, { messageEarningsEnabled: false });
        return interaction.editReply('✅ Message-Drop-Message disabled.');
      }
      if (sub === 'status') {
        return interaction.editReply(`Message-Drop-Message: ${settings.messageEarningsEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      }
    }

    if (group === 'panel' && sub === 'send') {
      const channel = interaction.options.getChannel('channel');
      const ok = await confirmDangerousAction(interaction, `Post economy panel in ${channel}?`);
      if (!ok) return;
      await (channel as any).send(buildEconomyPanelMessage(settings));
      return interaction.editReply('✅ Economy panel posted.');
    }

    if (group === 'manage') {
      const member = interaction.options.getUser('member');
      if (!member) return interaction.editReply('❌ Invalid user.');

      if (sub === 'add') {
        const amount = interaction.options.getInteger('amount');
        const ok = await confirmDangerousAction(interaction, `Add **${amount}** ${settings.currencyName} to ${member}?`);
        if (!ok) return;
        const r = await economyService.adjustBalances(interaction.guild.id, member.id, +amount, 0);
        if (!r.ok) return interaction.editReply(`❌ ${r.reason}`);
        return interaction.editReply(`✅ Added **${amount}** ${settings.currencyName} to ${member}.`);
      }

      if (sub === 'remove') {
        const amount = interaction.options.getInteger('amount');
        const ok = await confirmDangerousAction(interaction, `Remove **${amount}** ${settings.currencyName} from ${member}?`);
        if (!ok) return;
        const r = await economyService.adjustBalances(interaction.guild.id, member.id, -amount, 0);
        if (!r.ok) return interaction.editReply(`❌ ${r.reason}`);
        return interaction.editReply(`✅ Removed **${amount}** ${settings.currencyName} from ${member}.`);
      }

      if (sub === 'set') {
        const wallet = interaction.options.getInteger('wallet');
        const bank = interaction.options.getInteger('bank');
        const ok = await confirmDangerousAction(interaction, `Set ${member}'s wallet to **${wallet}** and bank to **${bank}** ${settings.currencyName}?`);
        if (!ok) return;
        const r = await economyService.adminSetWallet(interaction.guild.id, member.id, wallet, bank);
        if (!r.ok) return interaction.editReply(`❌ ${r.reason}`);
        return interaction.editReply(`✅ Updated ${member}.`);
      }
    }

    if (group === 'shop') {
      if (sub === 'view') {
        return interaction.editReply(await buildShopMessage(interaction.guild.id, settings));
      }
      if (sub === 'panel') {
        const channel = interaction.options.getChannel('channel');
        const ok = await confirmDangerousAction(interaction, `Post shop panel in ${channel}?`);
        if (!ok) return;
        await (channel as any).send(await buildShopMessage(interaction.guild.id, settings));
        return interaction.editReply('✅ Shop panel posted.');
      }
      if (sub === 'list') {
        const items = await economyShopService.listItems(interaction.guild.id);
        if (!items.length) return interaction.editReply('No shop items yet.');
        const lines = items.slice(0, 25).map((it, i) => {
          const left = it.stock === null ? '∞' : String(Math.max(0, it.stock - (it.soldCount || 0)));
          return `**${i + 1}.** \`${it.itemId}\` — **${it.name}** — ${it.price} ${settings.currencyName} — left: ${left}`;
        });
        const embed = new EmbedBuilder().setTitle('🛒 Shop Items').setDescription(lines.join('\n')).setColor(0xff6321).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
      if (sub === 'add') {
        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const stock = interaction.options.getInteger('stock');
        const role = interaction.options.getRole('role');
        const itemId = interaction.options.getString('item_id');
        const ok = await confirmDangerousAction(interaction, `Add shop item **${name}** for **${price}** ${settings.currencyName}?`);
        if (!ok) return;
        const res = await economyShopService.addItem(interaction.guild.id, {
          itemId: itemId || undefined,
          name,
          price,
          stock: stock === null || stock === undefined ? null : stock,
          roleId: role?.id ?? null,
        } as any);
        if (!res.ok) return interaction.editReply(`❌ ${res.reason}`);
        return interaction.editReply(`✅ Item added. ID: \`${res.itemId}\``);
      }
      if (sub === 'remove') {
        const itemId = interaction.options.getString('item_id');
        const ok = await confirmDangerousAction(interaction, `Remove shop item \`${itemId}\`?`);
        if (!ok) return;
        const res = await economyShopService.removeItem(interaction.guild.id, itemId);
        if (!res.ok) return interaction.editReply(`❌ ${res.reason}`);
        return interaction.editReply('✅ Item removed.');
      }
      if (sub === 'set-stock') {
        const itemId = interaction.options.getString('item_id');
        const stock = interaction.options.getInteger('stock');
        const ok = await confirmDangerousAction(interaction, `Set stock of \`${itemId}\` to **${stock}**?`);
        if (!ok) return;
        await economyShopService.updateItem(interaction.guild.id, itemId, { stock });
        return interaction.editReply('✅ Stock updated.');
      }
    }

    if (group === 'config') {
      if (sub === 'enable') {
        await economyService.updateSettings(interaction.guild.id, { enabled: true });
        return interaction.editReply('✅ Economy enabled.');
      }
      if (sub === 'disable') {
        await economyService.updateSettings(interaction.guild.id, { enabled: false });
        return interaction.editReply('✅ Economy disabled.');
      }
      if (sub === 'set-currency') {
        const name = interaction.options.getString('name');
        await economyService.updateSettings(interaction.guild.id, { currencyName: name });
        return interaction.editReply(`✅ Currency set to **${name}**.`);
      }
      if (sub === 'set-earn') {
        const amount = interaction.options.getInteger('amount');
        const cooldown = interaction.options.getInteger('cooldown');
        await economyService.updateSettings(interaction.guild.id, { earnPerMessage: amount, earnCooldownMs: cooldown * 1000 });
        return interaction.editReply(`✅ Earn set: **${amount}** per message, cooldown **${cooldown}s**.`);
      }
      if (sub === 'set-daily') {
        const amount = interaction.options.getInteger('amount');
        const hours = interaction.options.getInteger('hours');
        await economyService.updateSettings(interaction.guild.id, { dailyAmount: amount, dailyCooldownMs: hours * 60 * 60 * 1000 });
        return interaction.editReply(`✅ Daily set: **${amount}** every **${hours}h**.`);
      }
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};
