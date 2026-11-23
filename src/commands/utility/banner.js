'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');

const { E } = ui;

module.exports = {
  category: 'utility', permission: 'None',
  examples: { '': '/banner user:@member' },
  data: new SlashCommandBuilder().setName('banner').setDescription('Show a member\'s profile banner.')
    .addUserOption((o) => o.setName('user').setDescription('Member (default: you)')),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    let user = i.options.getUser('user') || i.user;
    // The user option payload does not include the banner; fetch the full user.
    user = await i.client.users.fetch(user.id, { force: true }).catch(() => user);
    const banner = user.bannerURL?.({ extension: 'png', size: 1024 });
    if (!banner) return i.reply(ui.message([`### ${E.modernStaff} BANNER`, 'sep', `**${user.username}** has no profile banner.`], { ephemeral: true }));
    return i.reply(ui.message([
      `### ${E.modernStaff} BANNER`,
      {
        section: `**${user.username}**\n-# \`${user.id}\``,
        thumbnail: user.displayAvatarURL({ extension: 'png', size: 256 }),
      },
      'sep',
      { media: banner },
      `-# [PNG](${user.bannerURL({ extension: 'png', size: 1024 })})  ·  [WEBP](${user.bannerURL({ extension: 'webp', size: 1024 })})${user.banner?.startsWith('a_') ? `  ·  [GIF](${user.bannerURL({ extension: 'gif', size: 1024 })})` : ''}`,
    ]));
  },
};
