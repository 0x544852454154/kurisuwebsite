# Kurisu Security - website

`index.html` at the project root is the whole site (one file, no build step). It can
be dropped on any static host as-is.

The hero numbers - users, communities and the server list - are filled from the
bot's live Discord data instead of placeholders.

## Live counts (one process)

```powershell
npm run web
```

`web.js` starts the bot and a small HTTP server on the same client:

| Route | What it returns |
| --- | --- |
| `GET /` | `index.html` |
| `GET /api/stats` | `{ users, communities, servers, ready, updated }` |
| `GET /healthz` | `{ ok, ready }` |

The page calls `/api/stats` on load and again every 60 seconds, so the counts update
as servers are added or members join. If the endpoint is missing (static hosting,
or `node index.js` without `SERVE_WEB=true`), the page keeps its placeholders
instead of showing zeros.

Environment variables:

- `WEB_PORT` - port for the site (default `8080`).
- `PORT` - overrides `WEB_PORT`; hosting panels such as Pterodactyl set it.
- `SERVE_WEB=true` - serve the site from the normal `node index.js` start too.

## Static hosting (Vercel, Netlify, GitHub Pages)

On a static host the bot is not running there, so the counts come from
`api/stats.js` instead: a serverless function that asks the Discord API with the
bot token (`GET /users/@me/guilds`, then `GET /guilds/{id}?with_counts=true`).

1. Import the repo on Vercel. No build step, no framework: the root `index.html`
is the site and `api/stats.js` becomes `/api/stats`.
2. Project -> Settings -> Environment Variables -> add `DISCORD_TOKEN` with the
bot token, then redeploy.

Result is cached five minutes at the edge, so page refreshes never hit Discord's
rate limits. If the variable is missing, `/api/stats` answers 503 and the page
keeps its placeholders rather than showing zeros.

To proxy a live self-hosted bot instead, set `API_BASE` to its origin (for
example `https://bot.example.com`); the function forwards `API_BASE/api/stats`.
