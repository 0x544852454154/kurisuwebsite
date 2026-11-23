'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');

const { E } = ui;

module.exports = {
  category: 'utility', permission: 'None',
  examples: { '': '/servericon' },
  data: new SlashCommandBuilder().setName('servericon').setDescription('Show this server\'s icon in full size.'),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    const g = i.guild;
    const animated = g.icon?.startsWith('a_');
    const icon = g.iconURL({ extension: animated ? 'gif' : 'png', size: 4096 });
    if (!icon) return i.reply(ui.message([`### ${E.modernStaff} SERVER ICON`, 'sep', `**${g.name}** has no icon set.`], { ephemeral: true }));
    const links = [`[PNG](${g.iconURL({ extension: 'png', size: 4096 })})`, `[WEBP](${g.iconURL({ extension: 'webp', size: 4096 })})`];
    if (animated) links.push(`[GIF](${g.iconURL({ extension: 'gif', size: 4096 })})`);
    return i.reply(ui.message([
      `### ${E.modernStaff} SERVER ICON`,
      { section: `**${g.name}**\n-# ID ${g.id}`, thumbnail: g.iconURL({ extension: 'png', size: 256 }) },
      { media: icon },
      `-# ${links.join('  ·  ')}`,
    ]));
  },
};
