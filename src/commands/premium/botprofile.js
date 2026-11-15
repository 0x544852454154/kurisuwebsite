'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const perms = require('../../permissions');
const repo = require('../../database/repo');
const premium = require('../../engines/premium');
const ui = require('../../components/common/ui');
const logging = require('../../engines/logging');
const { LIMITS } = require('../../config/settings');

const { E } = ui;
const ICON = E.crown;
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

/** Magic-byte check: never trust the filename or the Content-Type alone. */
function imageKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return null;
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`image download failed (${res.status})`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > LIMITS.profileMaxBytes) throw new Error('image is larger than 8 MB');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > LIMITS.profileMaxBytes) throw new Error('image is larger than 8 MB');
  return buf;
}

async function loadImage(i) {
  const attachment = i.options.getAttachment?.('image');
  const url = i.options.getString?.('url');
  if (!attachment && !url) throw new Error('Attach a PNG, JPEG, GIF or WebP image, or provide an image URL.');
  if (attachment && attachment.size > LIMITS.profileMaxBytes) throw new Error('image is larger than 8 MB');
  const buf = await download(attachment?.url || url);
  const kind = imageKind(buf);
  if (!kind) throw new Error('only PNG, JPEG, GIF and WebP images are accepted');
  return { buf, kind };
}

const profileLine = (profile) => {
  const parts = [];
  if (profile?.avatar) parts.push('avatar');
  if (profile?.banner) parts.push('banner');
  return parts.length ? parts.join(' and ') : 'default';
};

module.exports = {
  category: 'premium', permission: 'Server Owner or Trusted Administrator',
  examples: {
    avatar: '/botprofile avatar image:<file>', banner: '/botprofile banner url:<https://...>',
    reset: '/botprofile reset', view: '/botprofile view',
  },
  data: new SlashCommandBuilder().setName('botprofile').setDescription('Customise Kurisu in this premium server.')
    .addSubcommand((s) => s.setName('avatar').setDescription('Set the guild-member avatar (PNG, JPEG, GIF or WebP, max 8 MB).')
      .addAttachmentOption((o) => o.setName('image').setDescription('Image file.'))
      .addStringOption((o) => o.setName('url').setDescription('Direct image URL (alternative to an attachment).')))
    .addSubcommand((s) => s.setName('banner').setDescription('Set the guild-member profile banner (PNG, JPEG, GIF or WebP, max 8 MB).')
      .addAttachmentOption((o) => o.setName('image').setDescription('Image file.'))
      .addStringOption((o) => o.setName('url').setDescription('Direct image URL (alternative to an attachment).')))
    .addSubcommand((s) => s.setName('reset').setDescription('Reset the guild-member avatar and banner to default.'))
    .addSubcommand((s) => s.setName('view').setDescription('Show the current guild-member profile settings.')),
  async execute(i) {
    const err = guard(i, { bot: [] });
    if (err) return fail(i, err);
    if (!(await perms.canManageSecurity(i.guild, i.member))) return fail(i, 'Only the server owner, bot owner or a Trusted Administrator can change the bot profile.');
    const isPremium = await premium.active(i.guild);
    if (!isPremium) return fail(i, 'Guild-member profiles are a premium feature. Security features remain fully available without premium.');
    const sub = i.options.getSubcommand();
    const profile = await repo.getBotProfile(i.guild.id).catch(() => null);

    if (sub === 'view') {
      return i.reply(ui.message([
        `### ${ICON} GUILD-MEMBER PROFILE`,
        `Avatar: **${profile?.avatar ? 'Custom' : 'Default'}**\nBanner: **${profile?.banner ? 'Custom' : 'Default'}**`,
        'sep',
        '-# This profile is scoped to this server only. It never changes Kurisu\'s global avatar.',
      ], { ephemeral: true }));
    }

    if (sub === 'reset') {
      await i.deferReply({ flags: 64 }).catch(() => {});
      try {
        await i.guild.members.editMe({ avatar: null, banner: null, reason: `Kurisu premium: reset by ${i.user.tag || i.user.id}` });
      } catch (e) {
        return fail(i, `I could not reset the profile: ${e.message}`);
      }
      await repo.clearBotProfile(i.guild.id);
      await logging.send(i.guild, 'config', `${ICON} PROFILE RESET`, [`By: <@${i.user.id}>`]).catch(() => {});
      return i.editReply(ui.edit([`${ICON} Guild-member profile reset to default.`]));
    }

    await i.deferReply({ flags: 64 }).catch(() => {});
    let image;
    try {
      image = await loadImage(i);
    } catch (e) {
      return fail(i, e.message);
    }
    try {
      await i.guild.members.editMe({ [sub]: image.buf, reason: `Kurisu premium: ${sub} by ${i.user.tag || i.user.id}` });
    } catch (e) {
      return fail(i, `Discord refused the ${sub}: ${e.message}`);
    }
    await repo.setBotProfile(i.guild.id, { [sub]: 1 });
    await logging.send(i.guild, 'config', `${ICON} PROFILE UPDATED`, [
      `By: <@${i.user.id}>`, `Changed: ${sub} (${image.kind.toUpperCase()})`,
    ]).catch(() => {});
    return i.editReply(ui.edit([`${ICON} Guild-member ${sub} updated. Profile: ${profileLine({ ...profile, [sub]: 1 })}.`]));
  },
};

module.exports.imageKind = imageKind;
