import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.ts';
import { pollService } from '../../lib/firebase-admin.ts';
import { checkCooldown, confirmDangerousAction } from './mod-utils.ts';
import { buildPollMessage, endPoll } from '../poll.ts';

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(4);
}

export const pollCommand = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Poll system')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a poll')
        .addStringOption((opt) => opt.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(200))
        .addStringOption((opt) => opt.setName('option1').setDescription('Option 1').setRequired(true).setMaxLength(80))
        .addStringOption((opt) => opt.setName('option2').setDescription('Option 2').setRequired(true).setMaxLength(80))
        .addStringOption((opt) => opt.setName('option3').setDescription('Option 3').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option4').setDescription('Option 4').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option5').setDescription('Option 5').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option6').setDescription('Option 6').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option7').setDescription('Option 7').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option8').setDescription('Option 8').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option9').setDescription('Option 9').setMaxLength(80))
        .addStringOption((opt) => opt.setName('option10').setDescription('Option 10').setMaxLength(80))
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to post poll (optional)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a poll')
        .addStringOption((opt) => opt.setName('id').setDescription('Poll ID').setRequired(true)),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'poll', 3_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      await interaction.deferReply({ ephemeral: true });

      const question = interaction.options.getString('question');
      const options: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const opt = interaction.options.getString(`option${i}`);
        if (opt) options.push(opt);
      }
      if (options.length < 2) return interaction.editReply('❌ Provide at least 2 options.');

      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!channel || !(channel as any).isTextBased?.()) return interaction.editReply('❌ Invalid channel.');

      const pollId = newId();
      const poll = {
        pollId,
        channelId: channel.id,
        messageId: null,
        question,
        options,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
        ended: false,
        endedAt: null,
      };

      await pollService.createPoll(interaction.guild.id, poll as any);
      const payload = await buildPollMessage(interaction.guild.id, poll);
      const msg = await (channel as any).send(payload);
      await pollService.updatePoll(interaction.guild.id, pollId, { messageId: msg.id });

      return interaction.editReply(`✅ Poll created in ${channel}. ID: \`${pollId}\``);
    }

    if (sub === 'end') {
      const isMod =
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageMessages);
      if (!isMod) return interaction.reply({ content: '❌ You need mod permissions.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const pollId = interaction.options.getString('id');
      const ok = await confirmDangerousAction(interaction, `End poll \`${pollId}\`?`);
      if (!ok) return;
      const poll = await endPoll(interaction.guild.id, pollId);
      if (!poll) return interaction.editReply('❌ Poll not found.');

      // Try to edit message to disable buttons
      if (poll.channelId && poll.messageId) {
        const channel = interaction.guild.channels.cache.get(poll.channelId);
        if (channel && (channel as any).isTextBased?.()) {
          const msg = await (channel as any).messages.fetch(poll.messageId).catch(() => null);
          if (msg) {
            const payload = await buildPollMessage(interaction.guild.id, { ...poll, ended: true });
            // disable components
            const disabled = (payload.components as any[]).map((row) => {
              row.components = row.components.map((c: any) => c.setDisabled(true).setStyle(2));
              return row;
            });
            await msg.edit({ embeds: payload.embeds, components: disabled }).catch(() => {});
          }
        }
      }

      return interaction.editReply('✅ Poll ended.');
    }

    return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
  },
};

