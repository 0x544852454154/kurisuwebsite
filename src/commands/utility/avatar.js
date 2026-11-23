'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const ui = require('../../components/common/ui');

const { E } = ui;

module.exports = {
  category: 'utility', permission: 'None',
  examples: { '': '/avatar user:@member' },
  data: new SlashCommandBuilder().setName('avatar').setDescription('Show a member\'s avatar in full size.')
    .addUserOption((o) => o.setName('user').setDescription('Member (default: you)')),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    const user = i.options.getUser('user') || i.user;
    const member = i.options.getMember('user') || null;
    const animated = user.avatar?.startsWith('a_');
    // Largest CDN size; the gallery item is the only node between the header and
    // the links, so Discord renders it full width.
    const image = user.displayAvatarURL({ extension: animated ? 'gif' : 'png', size: 4096 });
    const links = [`[PNG](${user.displayAvatarURL({ extension: 'png', size: 4096 })})`, `[WEBP](${user.displayAvatarURL({ extension: 'webp', size: 4096 })})`];
    if (animated) links.push(`[GIF](${user.displayAvatarURL({ extension: 'gif', size: 4096 })})`);
    return i.reply(ui.message([
      `### ${E.modernStaff} AVATAR`,
      {
        section: `**${user.username}**\n-# \`${user.id}\`${member?.displayAvatarURL && member.displayAvatarURL() !== user.displayAvatarURL() ? '  ·  server avatar' : ''}`,
        thumbnail: user.displayAvatarURL({ extension: 'png', size: 256 }),
      },
      { media: image },
      `-# ${links.join('  ·  ')}`,
    ]));
  },
};
