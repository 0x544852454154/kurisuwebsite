'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const repo = require('../../database/repo');
const ui = require('../../components/common/ui');
const reminders = require('../../engines/reminder');
const { parseDuration, formatDuration } = require('../../utils/helpers');

const { E } = ui;

module.exports = {
  category: 'utility', permission: 'None',
  examples: { set: '/reminder set in:1h text:Check the tickets', list: '/reminder list' },
  data: new SlashCommandBuilder().setName('reminder').setDescription('Set a personal reminder in this channel.')
    .addSubcommand((s) => s.setName('set').setDescription('Create a reminder.')
      .addStringOption((o) => o.setName('in').setDescription('When, e.g. 10m, 2h, 1d').setRequired(true))
      .addStringOption((o) => o.setName('text').setDescription('What to remind you about').setRequired(true).setMaxLength(500)))
    .addSubcommand((s) => s.setName('list').setDescription('Show how many reminders you have waiting.')),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);

    if (i.options.getSubcommand() === 'list') {
      const count = await repo.countReminders(i.guild.id, i.user.id);
      return i.reply(ui.message([
        `### ${E.timeoutClock} REMINDERS`,
        'sep',
        count ? `You have **${count}** reminder(s) waiting.` : 'You have no reminders waiting.',
        `-# Limit: ${reminders.MAX_PER_USER} per member.`,
      ], { ephemeral: true }));
    }

    const sec = parseDuration(i.options.getString('in', true));
    if (!sec) return fail(i, 'Time must look like 10m, 2h or 1d.');
    if (sec < reminders.MIN_SECONDS) return fail(i, `The reminder must be at least ${reminders.MIN_SECONDS} seconds away.`);
    if (sec > reminders.MAX_SECONDS) return fail(i, 'The reminder must be within 30 days.');

    const count = await repo.countReminders(i.guild.id, i.user.id);
    if (count >= reminders.MAX_PER_USER) return fail(i, `You already have ${reminders.MAX_PER_USER} reminders waiting.`);

    const dueAt = Date.now() + sec * 1000;
    await repo.addReminder(i.guild.id, {
      channelId: i.channelId, userId: i.user.id, message: i.options.getString('text', true), dueAt,
    });
    return i.reply(ui.message([
      `### ${E.timeoutClock} REMINDER SET`,
      'sep',
      `I will remind you in **${formatDuration(sec)}** (<t:${Math.floor(dueAt / 1000)}:R>).`,
      `> ${i.options.getString('text', true)}`,
    ], { ephemeral: true }));
  },
};
