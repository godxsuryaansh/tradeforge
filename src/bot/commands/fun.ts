import { SlashCommandBuilder, EmbedBuilder } from 'discord.ts';
import { checkCooldown } from './mod-utils.ts';

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const funCommand = {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Fun commands')
    .addSubcommand((sub) =>
      sub
        .setName('8ball')
        .setDescription('Ask the magic 8-ball')
        .addStringOption((opt) => opt.setName('question').setDescription('Your question').setRequired(true).setMaxLength(200)),
    )
    .addSubcommand((sub) => sub.setName('coinflip').setDescription('Flip a coin'))
    .addSubcommand((sub) =>
      sub
        .setName('roll')
        .setDescription('Roll a dice')
        .addIntegerOption((opt) => opt.setName('sides').setDescription('Dice sides').setMinValue(2).setMaxValue(1000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('choose')
        .setDescription('Pick one option')
        .addStringOption((opt) => opt.setName('options').setDescription('Options separated by |').setRequired(true).setMaxLength(400)),
    ),

  async execute(interaction: any) {
    const cd = checkCooldown(interaction.user.id, 'fun', 2_000);
    if (cd) return interaction.reply({ content: cd, ephemeral: true });
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Server-only command.', ephemeral: true });
    await interaction.deferReply({ ephemeral: false });

    const sub = interaction.options.getSubcommand();

    if (sub === 'coinflip') {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      const embed = new EmbedBuilder().setTitle('🪙 Coin Flip').setDescription(`Result: **${result}**`).setColor(0xff6321);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'roll') {
      const sides = interaction.options.getInteger('sides') ?? 6;
      const roll = randInt(1, sides);
      const embed = new EmbedBuilder().setTitle('🎲 Roll').setDescription(`d${sides} → **${roll}**`).setColor(0xff6321);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'choose') {
      const raw = interaction.options.getString('options');
      const opts = raw.split('|').map((s: string) => s.trim()).filter(Boolean);
      if (opts.length < 2) return interaction.editReply('❌ Provide at least 2 options separated by `|`.');
      const pick = opts[randInt(0, opts.length - 1)];
      const embed = new EmbedBuilder().setTitle('🤔 Choose').setDescription(`I pick: **${pick}**`).setColor(0xff6321);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === '8ball') {
      const question = interaction.options.getString('question');
      const answers = [
        'Yes.',
        'No.',
        'Maybe.',
        'Absolutely.',
        'Not a chance.',
        'Ask again later.',
        'It is certain.',
        'Very doubtful.',
        'Most likely.',
        'Better not tell you now.',
      ];
      const answer = answers[randInt(0, answers.length - 1)];
      const embed = new EmbedBuilder()
        .setTitle('🎱 Magic 8-Ball')
        .addFields({ name: 'Question', value: question }, { name: 'Answer', value: `**${answer}**` })
        .setColor(0xff6321);
      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply('❌ Unknown subcommand.');
  },
};

