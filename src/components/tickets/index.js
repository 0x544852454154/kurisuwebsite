'use strict';
const { ChannelType, PermissionFlagsBits: P, AttachmentBuilder } = require('discord.js');
const ui = require('../common/ui');
const repo = require('../../database/repo');
const perms = require('../../permissions');
const logging = require('../../engines/logging');
const log = require('../../utils/logger');
const { LIMITS } = require('../../config/settings');

const { E } = ui;
const PANEL_ID = 'kt:new:panel';
const PANEL_ICON = E.ticket || E.staff;
const MAX_TRANSCRIPT = LIMITS.transcriptMessageLimit;

function panelItems() {
  return [
    `### ${PANEL_ICON} SUPPORT TICKETS`,
    'Need help? Open a private ticket and our staff will reply.\n-# One ticket per issue  ·  your channel is only visible to you and staff.',
    'sep',
    `-# Use the button below to create a ticket. Staff can claim it from the ticket channel.`,
    ui.buttons(ui.btn(PANEL_ID, 'Create Ticket', { emoji: 'staff' })),
    'sep',
    `-# If a ticket channel is deleted manually, its messages cannot be recovered.`,
  ];
}
const panelMessage = () => ui.message(panelItems());

/** Post the stable ticket panel and replace any previous panel message. */
async function postPanel(guild, channel) {
  const cfg = await repo.getTicketConfig(guild.id);
  if (cfg.panel_channel_id && cfg.panel_message_id) {
    const old = guild.channels.cache.get(cfg.panel_channel_id)
      || await guild.channels.fetch(cfg.panel_channel_id).catch(() => null);
    const message = old?.messages ? await old.messages.fetch(cfg.panel_message_id).catch(() => null) : null;
    if (message) await message.delete().catch(() => {});
  }
  const sent = await channel.send(panelMessage());
  await repo.setTicketConfig(guild.id, { panel_channel_id: channel.id, panel_message_id: sent.id });
  return sent;
}

async function isStaff(guild, member, cfg) {
  if (!member) return false;
  if (await perms.canManageSecurity(guild, member)) return true;
  return !!(cfg.staff_role_id && member.roles?.cache?.has(cfg.staff_role_id));
}

const ticketNumberFrom = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function ticketItems(ticket, cfg) {
  const claimed = ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed';
  return [
    `### ${PANEL_ICON} TICKET #${ticket.ticket_number}`,
    `Owner: <@${ticket.owner_id}>\nStatus: **${ticket.state === 'open' ? 'Open' : 'Closed'}**  ·  Claimed by: ${claimed}`,
    'sep',
    'Describe your issue below. Staff will be with you shortly.',
    `-# Closing a ticket archives it in the ticket log${cfg.transcripts ? ' with a transcript' : ''}.`,
    ui.buttons(
      ui.btn(`kt:close:${ticket.ticket_number}`, 'Close', { emoji: 'timeoutClock' }),
      ui.btn(`kt:claim:${ticket.ticket_number}`, 'Claim', { emoji: 'staff' }),
    ),
  ];
}

async function createTicket(i) {
  const guild = i.guild;
  const cfg = await repo.getTicketConfig(guild.id);
  if (!cfg.panel_channel_id || i.channelId !== cfg.panel_channel_id) {
    return i.reply(ui.error('This ticket panel is no longer active. Use /ticket panel to post a new one.'));
  }
  const open = await repo.countOpenTickets(guild.id, i.user.id);
  if (open >= (cfg.max_open || 3)) {
    return i.reply(ui.error(`You already have ${open} open ticket(s). Close one before opening another.`));
  }
  const number = await repo.nextTicketNumber(guild.id);
  const me = guild.members.me;
  const staffAllow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles];
  const overwrites = [
    { id: guild.id, deny: [P.ViewChannel] },
    { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.ManageMessages] },
    { id: i.user.id, allow: staffAllow },
  ];
  if (cfg.staff_role_id) overwrites.push({ id: cfg.staff_role_id, allow: staffAllow });
  if (me && me.id !== guild.client.user.id) overwrites.push({ id: me.id, allow: staffAllow });

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${number}`,
      type: ChannelType.GuildText,
      parent: cfg.category_id || undefined,
      topic: `Ticket #${number} · owner ${i.user.id}`.slice(0, 1024),
      permissionOverwrites: overwrites,
      reason: `Kurisu tickets: ticket #${number} for ${i.user.tag || i.user.id}`,
    });
  } catch (err) {
    log.warn(`ticket channel create failed in ${guild.id}`, err);
    return i.reply(ui.error('I could not create the ticket channel. Check my Manage Channels permission and the configured category.'));
  }

  let ticket;
  try {
    ticket = await repo.createTicket(guild.id, { number, channelId: channel.id, ownerId: i.user.id, topic: null });
  } catch (err) {
    log.error(`ticket record create failed in ${guild.id}`, err);
    await channel.delete('Kurisu tickets: database record failed').catch(() => {});
    return i.reply(ui.error('I could not save the ticket. Please try again.'));
  }
  try {
    await channel.send(ui.message(ticketItems(ticket, cfg)));
  } catch (err) {
    log.warn(`ticket welcome message failed in ${guild.id}`, err);
  }
  await logging.send(guild, 'ticket', `${PANEL_ICON} TICKET OPENED`, [
    `Ticket: **#${number}**`,
    `Owner: <@${i.user.id}>`,
    `Channel: <#${channel.id}>`,
  ]).catch(() => {});
  return i.reply(ui.notice(PANEL_ICON, `Ticket #${number} created: <#${channel.id}>`, { ephemeral: true }));
}

/** Resolve a ticket from the current channel, and verify the customId cannot point at another channel. */
async function resolveTicket(i, number = null, { allowOutside = false } = {}) {
  const guild = i.guild;
  const byChannel = await repo.getTicketByChannel(guild.id, i.channelId);
  if (!number) return byChannel;
  const ticket = await repo.getTicket(guild.id, number);
  if (!ticket) return null;
  if (byChannel && byChannel.ticket_number === ticket.ticket_number) return ticket;
  if (allowOutside) return ticket;
  return ticket.channel_id === i.channelId ? ticket : null;
}

async function transcript(guild, channel, ticket, cfg) {
  if (!cfg.transcripts) return null;
  const logChannel = cfg.log_channel_id
    ? guild.channels.cache.get(cfg.log_channel_id) || await guild.channels.fetch(cfg.log_channel_id).catch(() => null)
    : null;
  if (!logChannel?.isTextBased?.()) return null;
  try {
    const messages = await channel.messages.fetch({ limit: MAX_TRANSCRIPT });
    const lines = [...messages.values()].reverse().map((m) => {
      const files = m.attachments?.size ? ` [${m.attachments.size} attachment(s)]` : '';
      return `[${new Date(m.createdTimestamp || Date.now()).toISOString()}] ${m.author?.tag || m.author?.id || 'unknown'}: ${m.content || ''}${files}`;
    });
    const body = Buffer.from(lines.join('\n'), 'utf8');
    await logChannel.send({
      ...ui.message([`### ${PANEL_ICON} TICKET #${ticket.ticket_number} TRANSCRIPT`, `-# ${lines.length} message(s)  ·  closed by <@${ticket.closed_by || 'system'}>`]),
      files: [new AttachmentBuilder(body, { name: `ticket-${ticket.ticket_number}.txt` })],
    });
    return lines.length;
  } catch (err) {
    log.warn(`ticket transcript failed in ${guild.id}`, err);
    return null;
  }
}

async function closeTicket(guild, ticket, member) {
  if (!ticket || ticket.state !== 'open') return { ok: false, error: 'This ticket is already closed.' };
  const cfg = await repo.getTicketConfig(guild.id);
  const staff = await isStaff(guild, member, cfg);
  if (member.id !== ticket.owner_id && !staff) return { ok: false, error: 'Only the ticket owner or staff can close this ticket.' };
  // Always delete the ticket's own channel. Never trust the channel a component
  // happened to arrive from: a crafted close interaction must not delete another channel.
  const ch = guild.channels.cache.get(ticket.channel_id) || await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!ch) return { ok: false, error: 'The ticket channel no longer exists. Ask a staff member to remove the stale record.' };
  const counted = await transcript(guild, ch, { ...ticket, closed_by: member.id }, cfg);
  await repo.updateTicket(guild.id, ticket.ticket_number, { state: 'closed', closed_at: Date.now() });
  await ch.send(ui.message([`${E.timeoutClock} **Ticket closed** by <@${member.id}>`, '-# This channel will be removed shortly.'])).catch(() => {});
  await logging.send(guild, 'ticket', `${PANEL_ICON} TICKET CLOSED`, [
    `Ticket: **#${ticket.ticket_number}**`,
    `Owner: <@${ticket.owner_id}>`,
    `Closed by: <@${member.id}>`,
    `Transcript: ${cfg.transcripts ? (counted === null ? 'failed or no log channel' : `${counted} message(s)`) : 'off'}`,
  ]).catch(() => {});
  const timer = setTimeout(() => { ch.delete('Kurisu tickets: ticket closed').catch(() => {}); }, LIMITS.ticketDeleteDelayMs);
  timer.unref?.();
  return { ok: true, number: ticket.ticket_number };
}

async function claimTicket(i, ticket) {
  const guild = i.guild;
  const cfg = await repo.getTicketConfig(guild.id);
  if (!ticket || ticket.state !== 'open') return i.reply(ui.error('This ticket is not open.'));
  if (!await isStaff(guild, i.member, cfg)) return i.reply(ui.error('Only staff can claim tickets.'));
  if (ticket.claimed_by === i.user.id) return i.reply(ui.notice(E.staff, 'You already claimed this ticket.', { ephemeral: true }));
  await repo.updateTicket(guild.id, ticket.ticket_number, { claimed_by: i.user.id });
  await logging.send(guild, 'ticket', `${PANEL_ICON} TICKET CLAIMED`, [
    `Ticket: **#${ticket.ticket_number}**`, `Claimed by: <@${i.user.id}>`,
  ]).catch(() => {});
  return i.reply(ui.message([`${E.staff} **Ticket claimed** by <@${i.user.id}>`]));
}

async function handle(i) {
  const guild = i.guild;
  if (!guild) return i.reply(ui.error('Tickets only work in a server.'));
  const [, action, arg] = i.customId.split(':');
  try {
    if (action === 'new') return await createTicket(i);
    if (action === 'claim') {
      const ticket = await resolveTicket(i, ticketNumberFrom(arg));
      if (!ticket) return i.reply(ui.error('This ticket no longer exists.'));
      return await claimTicket(i, ticket);
    }
    if (action === 'close') {
      const ticket = await resolveTicket(i, ticketNumberFrom(arg));
      if (!ticket) return i.reply(ui.error('This ticket no longer exists.'));
      const cfg = await repo.getTicketConfig(guild.id);
      const staff = await isStaff(guild, i.member, cfg);
      if (i.user.id !== ticket.owner_id && !staff) return i.reply(ui.error('Only the ticket owner or staff can close this ticket.'));
      if (ticket.state !== 'open') return i.reply(ui.error('This ticket is already closed.'));
      return i.reply(ui.message([
        `${E.timeoutClock} Close ticket **#${ticket.ticket_number}**?`,
        '-# The channel is removed after a short delay. This cannot be undone.',
        ui.buttons(ui.btn(`kt:closeok:${ticket.ticket_number}`, 'Confirm Close', { emoji: 'banHammer' }), ui.btn(`kt:cancel:${ticket.ticket_number}`, 'Keep Open')),
      ], { ephemeral: true }));
    }
    if (action === 'closeok') {
      // Staff may confirm a close started with /ticket close <number> from outside
      // the ticket channel; closeTicket still re-checks owner/staff authority.
      const ticket = await resolveTicket(i, ticketNumberFrom(arg), { allowOutside: true });
      if (!ticket) return i.reply(ui.error('This ticket no longer exists.'));
      const result = await closeTicket(guild, ticket, i.member);
      if (!result.ok) return i.reply(ui.error(result.error));
      return i.update(ui.edit([`${E.verified} Ticket **#${result.number}** closed.`])).catch(() => i.reply(ui.notice(E.verified, 'Ticket closed.', { ephemeral: true })));
    }
    if (action === 'cancel') return i.update(ui.edit(['-# Ticket kept open.'])).catch(() => i.reply(ui.notice(E.smallRedDot, 'Ticket kept open.', { ephemeral: true })));
    return i.reply(ui.error('Unknown ticket action.'));
  } catch (err) {
    log.error(`ticket component error (${i.customId})`, err);
    if (!i.replied && !i.deferred) return i.reply(ui.error('The ticket action could not be completed.'));
    return undefined;
  }
}

module.exports = {
  PANEL_ID, panelItems, panelMessage, postPanel, isStaff, createTicket, resolveTicket, closeTicket, claimTicket, transcript, handle,
};
