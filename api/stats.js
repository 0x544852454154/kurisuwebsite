'use strict';

/*
 * Vercel serverless function: GET /api/stats
 *
 * The page is static on Vercel, so the counts have to come from somewhere that
 * can see Discord. This function asks the Discord API directly with the bot
 * token. Vercel cannot run the gateway client, so it uses the token:
 *
 *   GET /users/@me/guilds            every guild the bot is in (Bot token)
 *   GET /guilds/{id}?with_counts    approximate member count per guild
 *
 * Required environment variable (Vercel project settings):
 *   DISCORD_TOKEN - the bot token (DISCORD_BOT_TOKEN / TOKEN / BOT_TOKEN also work)
 *
 * Response is cached for 5 minutes at the edge, so a page refresh loop cannot
 * burn Discord's rate limits. Set API_BASE to your own bot's /api/stats to
 * proxy it instead of asking Discord.
 */

const CACHE_MS = 5 * 60 * 1000;
const DISCORD = 'https://discord.com/api/v10';
const UA = 'KurisuWebsite (https://github.com/0x544852454154/kurisuwebsite, 2.1.0)';

let cache = { at: 0, body: null };

const json = (res, code, body, maxAge = 0) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', maxAge ? `public, s-maxage=${maxAge}, stale-while-revalidate=300` : 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};

const token = () => process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN
  || process.env.TOKEN || process.env.BOT_TOKEN || '';

async function discord(path) {
  const r = await fetch(DISCORD + path, {
    headers: { Authorization: `Bot ${token()}`, 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`Discord ${path} -> ${r.status} ${r.statusText}`);
  return r.json();
}

/** Run an async mapper over a list with a small concurrency cap. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function collect() {
  const guilds = await discord('/users/@me/guilds');
  const rows = await mapLimit(guilds, 5, async (g) => {
    try {
      const full = await discord(`/guilds/${g.id}?with_counts=true`);
      return {
        name: full.name || g.name || 'Server',
        members: Number(full.approximate_member_count) || 0,
        icon: full.icon ? `https://cdn.discordapp.com/icons/${g.id}/${full.icon}.${String(full.icon).startsWith('a_') ? 'gif' : 'webp'}?size=128` : '',
      };
    } catch {
      // A guild the bot left, or a rate limit: keep it, without a member count.
      return { name: g.name || 'Server', members: 0, icon: '' };
    }
  });
  rows.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
  const users = rows.reduce((sum, r) => sum + r.members, 0);
  return {
    users: Math.max(0, users - rows.length), // the bot is a member of every server
    communities: guilds.length,
    servers: guilds.length,
    list: rows.slice(0, 12),
    ready: true,
    updated: Date.now(),
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, '{"error":"method not allowed"}');

  // Optional: proxy a live bot that already serves /api/stats.
  const base = process.env.API_BASE;
  if (base) {
    try {
      const r = await fetch(base.replace(/\/+$/, '') + '/api/stats', { headers: { 'User-Agent': UA } });
      // `json(..., 0)` sends no-store: the proxy source is already a live count.
      if (r.ok) return json(res, 200, await r.text(), 0);
    } catch { /* fall through to the direct Discord path */ }
  }

  if (!token()) return json(res, 503, JSON.stringify({ error: 'DISCORD_TOKEN is not set on this deployment' }));

  if (cache.body && Date.now() - cache.at < CACHE_MS) return json(res, 200, cache.body, 300);
  try {
    const body = JSON.stringify(await collect());
    cache = { at: Date.now(), body };
    return json(res, 200, body, 300);
  } catch (err) {
    // Serve the last good snapshot rather than falling back to zeroes on the page.
    if (cache.body) return json(res, 200, cache.body, 60);
    return json(res, 502, JSON.stringify({ error: 'Discord request failed', detail: String(err.message || err) }));
  }
};
