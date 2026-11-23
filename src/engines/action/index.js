'use strict';
const ui = require('../../components/common/ui');
const { GIFS } = require('../../config/gifs');

const { E } = ui;

/**
 * Action definitions. `self` wording is used when nobody is targeted,
 * `me` when the target is the bot, `bot` when the target is another bot.
 */
const ACTIONS = {
  hug: {
    title: 'HUG', emoji: E.hug, text: '{a} hugs {b}.', self: '{a} hugs themselves.', me: '{a} hugs Kurisu.', bot: '{a} hugs {b}.',
  },
  kiss: {
    title: 'KISS', emoji: E.kiss, text: '{a} kisses {b}.', self: '{a} kisses themselves.', me: '{a} kisses Kurisu.', bot: '{a} kisses {b}.',
  },
  slap: {
    title: 'SLAP', emoji: E.slap, text: '{a} slaps {b}.', self: '{a} slaps themselves.', me: '{a} slaps Kurisu.', bot: '{a} slaps {b}.',
  },
  pat: {
    title: 'PAT', emoji: E.pat, text: '{a} pats {b}.', self: '{a} pats themselves.', me: '{a} pats Kurisu.', bot: '{a} pats {b}.',
  },
  cuddle: {
    title: 'CUDDLE', emoji: E.cuddle, text: '{a} cuddles {b}.', self: '{a} cuddles themselves.', me: '{a} cuddles Kurisu.', bot: '{a} cuddles {b}.',
  },
  poke: {
    title: 'POKE', emoji: E.poke, text: '{a} pokes {b}.', self: '{a} pokes themselves.', me: '{a} pokes Kurisu.', bot: '{a} pokes {b}.',
  },
  dance: {
    title: 'DANCE', emoji: E.dance, text: '{a} dances with {b}.', self: '{a} dances.', me: '{a} dances with Kurisu.', bot: '{a} dances with {b}.',
  },
  cry: {
    title: 'CRY', emoji: E.cry, text: '{a} cries with {b}.', self: '{a} cries.', me: '{a} cries with Kurisu.', bot: '{a} cries with {b}.',
  },
  laugh: {
    title: 'LAUGH', emoji: E.laugh, text: '{a} laughs with {b}.', self: '{a} laughs.', me: '{a} laughs with Kurisu.', bot: '{a} laughs with {b}.',
  },
  highfive: {
    title: 'HIGH FIVE', emoji: E.highfive, text: '{a} high-fives {b}.', self: '{a} high-fives themselves.', me: '{a} high-fives Kurisu.', bot: '{a} high-fives {b}.',
  },
  handshake: {
    title: 'HANDSHAKE', emoji: E.handshake, text: '{a} shakes hands with {b}.', self: '{a} shakes their own hand.', me: '{a} shakes hands with Kurisu.', bot: '{a} shakes hands with {b}.',
  },
  sleep: {
    title: 'SLEEP', emoji: E.sleep, text: '{a} falls asleep next to {b}.', self: '{a} falls asleep.', me: '{a} falls asleep next to Kurisu.', bot: '{a} falls asleep next to {b}.',
  },
  eat: {
    title: 'EAT', emoji: E.eat, text: '{a} eats with {b}.', self: '{a} eats something.', me: '{a} shares a meal with Kurisu.', bot: '{a} eats with {b}.',
  },
  drink: {
    title: 'DRINK', emoji: E.drink, text: '{a} drinks with {b}.', self: '{a} drinks something.', me: '{a} drinks with Kurisu.', bot: '{a} drinks with {b}.',
  },
};

const NAMES = Object.keys(ACTIONS);

/** Per-action rotation cursor so the same GIF is not served twice in a row. */
const cursors = new Map();

/** Pick the next GIF for `name` (least recently used first). */
function nextGif(name) {
  const list = GIFS[name];
  if (!list || !list.length) return null;
  const idx = cursors.get(name) || 0;
  cursors.set(name, (idx + 1) % list.length);
  return list[idx];
}

/** Reset rotation (tests). */
function resetRotation() { cursors.clear(); }

/**
 * Build the sentence for an action.
 * target: { id, username, bot } | null. The `me` wording applies when the
 * target is Kurisu itself.
 */
function sentence(action, actor, target, clientId = null) {
  const a = `<@${actor.id}>`;
  if (!target) return action.self.replace('{a}', a);
  if (target.id === actor.id) return action.self.replace('{a}', a);
  if (clientId && target.id === clientId) return action.me.replace('{a}', a);
  const b = `<@${target.id}>`;
  const tpl = target.bot ? action.bot : action.text;
  return tpl.replace('{a}', a).replace('{b}', b);
}

/**
 * Render a V2 payload for an action. Grey-only, no accent colour, no embeds.
 * The GIF sits in its own media gallery directly under a short headline: one
 * item in a gallery renders at the largest size Discord allows, and spacing the
 * text out above it would only make the image smaller.
 */
function render(name, actor, target, clientId = null) {
  const action = ACTIONS[name];
  if (!action) return null;
  const gif = nextGif(name);
  const head = action.emoji ? `${action.emoji} ${action.title}` : action.title;
  const items = [
    `### ${head}\n${sentence(action, actor, target, clientId)}`,
  ];
  if (gif) items.push({ media: gif });
  items.push(`-# Requested by <@${actor.id}>`);
  return ui.message(items);
}

module.exports = { ACTIONS, NAMES, nextGif, resetRotation, sentence, render };
