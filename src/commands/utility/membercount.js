'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');

const { E } = ui;

module.exports = {
  category: 'utility', permission: 'None',
  examples: { '': '/membercount' },
  data: new SlashCommandBuilder().setName('membercount').setDescription('Show how many members this server has.'),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    const g = i.guild;
    const members = g.members.cache;
    const bots = members.filter((m) => m.user?.bot).size;
    const online = members.filter((m) => m.presence && m.presence.status !== 'offline').size;
    return i.reply(ui.message([
      `### ${E.modernStaff} MEMBER COUNT`,
      'sep',
      `Members  **${g.memberCount.toLocaleString('en-US')}**\nHumans  **${Math.max(0, g.memberCount - bots).toLocaleString('en-US')}**\nBots  **${bots.toLocaleString('en-US')}**\nOnline (cached)  **${online.toLocaleString('en-US')}**`,
    ]));
  },
};
