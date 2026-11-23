'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');
const fun = require('../../engines/fun');

const { E } = ui;
const title = (name) => (E.fun ? `${E.fun} ${name}` : name);

/** Headline + body, shared so every fun command looks identical. */
const simple = (name, line) => ui.message([`### ${title(name)}`, 'sep', line]);

/** The reference bot's rate commands (iq / hot / simp / toxic / dumb) plus luck. */
const rateCommand = (kind, description) => ({
  category: 'fun', permission: 'None',
  examples: { '': `/${kind} user:@member` },
  data: new SlashCommandBuilder().setName(kind).setDescription(description)
    .addUserOption((o) => o.setName('user').setDescription('Who to rate (default: you)')),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    const user = i.options.getUser('user') || i.user;
    return i.reply(simple(fun.RATE_TITLES[kind].title, fun.rateLine(kind, user.id)));
  },
});

const rateModules = {
  iq: rateCommand('iq', 'Measure someone\'s IQ.'),
  hot: rateCommand('hot', 'Rate how hot someone is.'),
  simp: rateCommand('simp', 'Rate someone\'s simp level.'),
  toxic: rateCommand('toxic', 'Rate someone\'s toxicity.'),
  dumb: rateCommand('dumb', 'Rate someone\'s dumbness.'),
  luck: rateCommand('luck', 'Rate someone\'s luck today.'),
};

const shipCommand = (name, headings, description) => ({
  category: 'fun', permission: 'None',
  examples: { '': `/${name} first:@member second:@member` },
  data: new SlashCommandBuilder().setName(name).setDescription(description)
    .addUserOption((o) => o.setName('first').setDescription('First person').setRequired(true))
    .addUserOption((o) => o.setName('second').setDescription('Second person (default: you)')),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    const first = i.options.getUser('first', true);
    const second = i.options.getUser('second') || i.user;
    const score = fun.shipScore(first.id, second.id);
    const verdict = score >= 90 ? 'Perfect match.' : score >= 70 ? 'Very strong.' : score >= 50 ? 'Worth a try.'
      : score >= 25 ? 'Rough waters.' : 'Not meant to be.';
    return i.reply(simple(headings, `<@${first.id}>  ×  <@${second.id}>\n${fun.meter(score)}\n**${verdict}**`));
  },
});

module.exports = {
  // Kept for tests and docs: every fun command module in one place.
  all: {
    ...rateModules,
    joke: {
      category: 'fun', permission: 'None', examples: { '': '/joke' },
      data: new SlashCommandBuilder().setName('joke').setDescription('Tell a random joke.'),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        return i.reply(simple('JOKE', fun.pick(fun.JOKES)));
      },
    },
    fact: {
      category: 'fun', permission: 'None', examples: { '': '/fact' },
      data: new SlashCommandBuilder().setName('fact').setDescription('Share a random fact.'),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        return i.reply(simple('FACT', fun.pick(fun.FACTS)));
      },
    },
    meme: {
      category: 'fun', permission: 'None', examples: { '': '/meme' },
      data: new SlashCommandBuilder().setName('meme').setDescription('Share a random meme.'),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        return i.reply(simple('MEME', 'The meme wall is empty right now.\n-# Add a meme pool to fill this command, or use /action for a GIF.'));
      },
    },
    roast: {
      category: 'fun', permission: 'None', examples: { '': '/roast user:@member' },
      data: new SlashCommandBuilder().setName('roast').setDescription('Roast someone.')
        .addUserOption((o) => o.setName('user').setDescription('Who to roast').setRequired(true)),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        const user = i.options.getUser('user', true);
        if (user.id === i.user.id) return fail(i, 'You cannot roast yourself. Pick someone else.');
        if (user.id === i.client.user.id) return fail(i, 'I will not roast myself.');
        return i.reply(simple('ROAST', `<@${user.id}> ${fun.pick(fun.ROASTS)}`));
      },
    },
    eightball: {
      category: 'fun', permission: 'None', examples: { '': '/eightball question:Should I sleep?' },
      data: new SlashCommandBuilder().setName('eightball').setDescription('Ask the magic 8-ball a question.')
        .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(fun.EIGHT_BALL_LIMIT)),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        const question = i.options.getString('question', true);
        return i.reply(simple('MAGIC 8-BALL', `${fun.quote(question)}\n\n**${fun.pick(fun.EIGHT_BALL)}**`));
      },
    },
    coinflip: {
      category: 'fun', permission: 'None', examples: { '': '/coinflip' },
      data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin.'),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        return i.reply(simple('COIN FLIP', `The coin landed on **${Math.random() < 0.5 ? 'Heads' : 'Tails'}**.`));
      },
    },
    dice: {
      category: 'fun', permission: 'None', examples: { '': '/dice sides:20' },
      data: new SlashCommandBuilder().setName('dice').setDescription('Roll a die.')
        .addIntegerOption((o) => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(100)),
      async execute(i) {
        const err = guard(i, {});
        if (err) return fail(i, err);
        const sides = i.options.getInteger('sides') ?? 6;
        return i.reply(simple('DICE ROLL', `You rolled a **${1 + Math.floor(Math.random() * sides)}** on a d${sides}.`));
      },
    },
    ship: shipCommand('ship', 'SHIP', 'Check compatibility between two people.'),
    lovecalc: shipCommand('lovecalc', 'LOVE CALCULATOR', 'Calculate love between two people.'),
  },
};
