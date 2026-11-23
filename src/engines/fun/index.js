'use strict';
const ui = require('../../components/common/ui');

const { E } = ui;

/**
 * Fun command content. Everything is local and deterministic given the seed so
 * a "rate" result stays stable for the same user while the day lasts, instead
 * of changing on every refresh.
 */

const EIGHT_BALL = [
  // yes
  'It is certain.', 'Without a doubt.', 'You may rely on it.', 'Definitely.', 'Most likely.',
  // unclear
  'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
  // no
  "Don't count on it.", 'My sources say no.', 'Very doubtful.', 'Outlook not so good.', 'Absolutely not.',
];

const ROASTS = [
  "You're the reason shampoo has instructions.",
  "You bring everyone so much joy when you leave the room.",
  "You're not stupid; you just have bad luck thinking.",
  "I'd agree with you, but then we'd both be wrong.",
  "You're proof that even the worst idea can get a sequel.",
  "Somewhere out there is a tree working hard to produce your oxygen. Apologize to it.",
  "You're like a cloud. When you disappear, it's a beautiful day.",
  "You have something on your chin... no, the third one down.",
  "Your secrets are safe with me. I never listen when you talk.",
  "You're the human equivalent of a pop-up ad.",
  "If laziness were an Olympic sport, you'd finish fourth so you wouldn't have to walk up the podium.",
  "You make me want to uninstall my own memories.",
];

const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I would tell you a joke about UDP, but you might not get it.',
  "There are only 10 kinds of people: those who understand binary and those who don't.",
  'A SQL query walks into a bar, walks up to two tables and asks: may I join you?',
  "Why do Java developers wear glasses? Because they don't C#.",
  'I changed my password to "incorrect". Now the computer tells me my password is incorrect every time I log in.',
  'A programmer’s wife tells him: "Go to the store and buy a loaf of bread. If they have eggs, buy a dozen." He came home with 12 loaves of bread.',
  "Why did the developer go broke? Because he used up all his cache.",
  "I told my computer I needed a break, and it said: no problem, I'll go to sleep.",
  "There's no place like 127.0.0.1.",
  "Why was the JavaScript developer sad? Because he didn't know how to 'null' his feelings.",
  "Two bytes meet. The first byte asks: are you ill? The second replies: no, just feeling a bit off.",
];

const FACTS = [
  'Honey never spoils. Edible honey has been found in 3,000-year-old Egyptian tombs.',
  'A day on Venus is longer than a year on Venus.',
  'Octopuses have three hearts and blue blood.',
  'Bananas are berries, but strawberries are not.',
  'Sharks existed before trees did.',
  'The Eiffel Tower grows about 15 cm taller in summer because of thermal expansion.',
  'Wombat droppings are cube-shaped.',
  'There are more possible chess games than atoms in the observable universe.',
  'A group of flamingos is called a flamboyance.',
  'Sea otters hold hands while sleeping so they do not drift apart.',
  'The first computer bug was a literal moth found in a Harvard relay in 1947.',
  "Hot water can freeze faster than cold water under some conditions, a quirk known as the Mpemba effect.",
];

const EIGHT_BALL_LIMIT = 200;
const TOPIC_LIMIT = 100;

/** Deterministic 0-100 "rate" (same user, same day -> same number). */
function dailyRate(seed, dayKey = new Date().toISOString().slice(0, 10)) {
  const str = `${seed}:${dayKey}`;
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 101);
}

/** Deterministic 0-100 pair score. Order independent: A+B == B+A. */
function shipScore(a, b, dayKey = new Date().toISOString().slice(0, 10)) {
  const pair = [String(a), String(b)].sort().join(':');
  return dailyRate(`ship:${pair}`, dayKey);
}

const pick = (list, rand = Math.random) => list[Math.floor(rand() * list.length) % list.length];

const RATE_TITLES = {
  iq: { title: 'IQ TEST', min: 60, max: 165 },
  hot: { title: 'HOTNESS', min: 0, max: 100 },
  simp: { title: 'SIMP RATE', min: 0, max: 100 },
  toxic: { title: 'TOXICITY', min: 0, max: 100 },
  dumb: { title: 'DUMBNESS', min: 0, max: 100 },
  luck: { title: 'LUCK', min: 0, max: 100 },
};

const meter = (pct) => {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}  **${pct}%**`;
};

/** Render the /fun rate subcommands. */
function rateLine(kind, userId) {
  const conf = RATE_TITLES[kind];
  if (!conf) return null;
  const pct = conf.min === conf.max ? conf.min : conf.min + (dailyRate(`${kind}:${userId}`) % (conf.max - conf.min + 1));
  if (kind === 'iq') return `<@${userId}> has an IQ of **${pct}**.`;
  return `<@${userId}> ${meter(pct)}`;
}

function quote(inner) { return `> ${String(inner).replace(/\n/g, '\n> ')}`; }

module.exports = {
  EIGHT_BALL, ROASTS, JOKES, FACTS, RATE_TITLES,
  EIGHT_BALL_LIMIT, TOPIC_LIMIT,
  dailyRate, shipScore, pick, meter, rateLine, quote, E,
};
