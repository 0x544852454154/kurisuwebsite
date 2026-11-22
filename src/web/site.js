'use strict';

// Website + live stats API.
//
// `node index.js` still starts only the bot. `node web.js` (npm run web) starts the
// same bot and this server next to it, so the counts on the page are real:
//
//   GET /            index.html from the project root
//   GET /api/stats   { users, communities, servers, list: [...] }
//   GET /healthz     { ok, ready }
//
// The page also serves fine as static HTML on any host: without /api/stats the
// placeholders stay, so the site never shows a broken zero.

const http = require('http');
const fs = require('fs');
const path = require('path');
const log = require('../utils/logger');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'index.html');
const PORT = Number(process.env.WEB_PORT) || 8080;
const PUBLIC_EXT = new Set(['.html', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.txt', '.css', '.woff2']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Live network numbers straight from the gateway cache: no REST call and no CDN
 * helper, so this answers instantly and cannot rate-limit or throw.
 *   users       member counts summed, the bot itself subtracted once per server
 *   communities servers Kurisu is in
 *   list        the busiest servers, for the reel under the hero
 */
function stats(client) {
  let users = 0;
  const list = [];
  for (const guild of client.guilds.cache.values()) {
    const members = Number(guild.memberCount) || 0;
    users += members;
    list.push({
      name: String(guild.name || 'Server'),
      members,
      // Icon URLs are built from the hash: an animated (a_) icon needs .gif, a
      // still one needs .webp. withCounts-free and safe to call per request.
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${String(guild.icon).startsWith('a_') ? 'gif' : 'webp'}?size=128` : '',
    });
  }
  list.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
  return {
    users: Math.max(0, users - client.guilds.cache.size),
    communities: client.guilds.cache.size,
    servers: client.guilds.cache.size,
    list: list.slice(0, 12),
    ready: client.isReady(),
    updated: Date.now(),
  };
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { send(res, 404, '{"error":"not found"}'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': file === INDEX ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  });
}

/** Map a URL path onto a file inside the project, or null if it escapes it. */
function resolveAsset(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!rel) return INDEX;
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return null;
  // Never hand out secrets, logs or bot source over the website.
  const ext = path.extname(file).toLowerCase();
  if (!ext && path.basename(file) !== 'index.html') return null;
  return PUBLIC_EXT.has(ext) ? file : null;
}

function start(client, port = Number(process.env.PORT) || PORT) {
  const server = http.createServer((req, res) => {
    try { route(req, res); } catch (err) {
      log.warn('web request failed', err);
      if (!res.headersSent) send(res, 500, '{"error":"internal error"}'); else res.end();
    }
  });

  function route(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, '{"error":"method not allowed"}'); return; }

    let p;
    try { p = new URL(req.url || '/', 'http://localhost').pathname; } catch { send(res, 400, '{"error":"bad request"}'); return; }

    if (p === '/api/stats' || p === '/stats.json') {
      try { send(res, 200, JSON.stringify(stats(client))); } catch (err) {
        log.warn('web stats failed', err);
        send(res, 500, '{"error":"stats unavailable"}');
      }
      return;
    }
    if (p === '/healthz') { send(res, 200, JSON.stringify({ ok: true, ready: client.isReady() })); return; }

    const file = resolveAsset(p === '/' ? '/index.html' : p);
    if (!file) { send(res, 403, '{"error":"forbidden"}'); return; }
    serveFile(res, file);
  }

  server.on('error', (err) => log.warn(`web server failed on port ${port}`, err));
  server.listen(port, () => log.info(`website on http://localhost:${port} (index.html + /api/stats)`));
  return server;
}

module.exports = { start, stats, resolveAsset };
