'use strict';
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');
const logging = require('../../engines/logging');

const { E } = ui;

module.exports = {
  category: 'utility', permission: 'Manage Messages',
  examples: { '': '/say message:Maintenance in 10 minutes' },
  data: new SlashCommandBuilder().setName('say').setDescription('Make Kurisu say something in this channel.')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addStringOption((o) => o.setName('message').setDescription('What to say').setRequired(true).setMaxLength(1900)),
  async execute(i) {
    const err = guard(i, { user: [P.ManageMessages], bot: [P.SendMessages] });
    if (err) return fail(i, err);
    // Echo through Components V2 so no raw mentions or markdown injection leak in.
    await i.channel.send(ui.message([i.options.getString('message', true)]));
    await logging.send(i.guild, 'config', `${E.modernRules} SAY`, [
      `Channel: <#${i.channel.id}>`,
      `By: <@${i.user.id}>`,
    ]);
    return i.reply(ui.message([`${E.modernRules} Message sent.`], { ephemeral: true }));
  },
};
