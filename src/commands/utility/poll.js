'use strict';
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');

const { E } = ui;

// Number keycaps are the poll's reaction keys, so they are Unicode on purpose:
// Discord only accepts Unicode emoji as reactions (custom emoji need Nitro).
const NUM = ['\u0031\uFE0F\u20E3', '\u0032\uFE0F\u20E3', '\u0033\uFE0F\u20E3', '\u0034\uFE0F\u20E3', '\u0035\uFE0F\u20E3'];

module.exports = {
  category: 'utility', permission: 'Manage Messages',
  examples: { '': '/poll question:Which theme? options:Library | Lab' },
  data: new SlashCommandBuilder().setName('poll').setDescription('Post a quick reaction poll.')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption((o) => o.setName('question').setDescription('What are you asking?').setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName('options').setDescription('Up to 5 options, separated by |').setRequired(true).setMaxLength(500)),
  async execute(i) {
    const err = guard(i, { user: [P.ManageMessages], bot: [P.SendMessages, P.AddReactions] });
    if (err) return fail(i, err);
    const question = i.options.getString('question', true);
    const options = i.options.getString('options', true)
      .split('|').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (options.length < 2) return fail(i, 'Give at least two options, separated by `|`.');
    const lines = options.map((label, idx) => `${NUM[idx]} ${label}`).join('\n');
    const msg = await i.channel.send(ui.message([
      `### ${E.modernStaff} POLL`,
      `**${question}**`,
      'sep',
      lines,
      `-# Poll by <@${i.user.id}>  ·  React to vote.`,
    ]));
    for (let idx = 0; idx < options.length; idx++) await msg.react(NUM[idx]).catch(() => { });
    return i.reply(ui.message([`${E.modernStaff} Poll posted.`], { ephemeral: true }));
  },
};
