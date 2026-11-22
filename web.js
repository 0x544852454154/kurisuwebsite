'use strict';

// Entry point for the website + bot together: `node web.js` (or `npm run web`).
// index.html is served from the project root, and /api/stats feeds it the live
// user, community and server counts. The bot itself starts first, exactly as
// `node index.js` would, then the website attaches to the same client.

if (process.env.SERVE_WEB === undefined) process.env.SERVE_WEB = 'true';
require('./src/index');
