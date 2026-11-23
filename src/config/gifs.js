'use strict';

/**
 * Curated action GIF URLs for the /action interaction commands.
 *
 * Every link is a direct media.tenor.com GIF, so it renders as an animated GIF
 * in Discord with no runtime API call. A command rotates through its own list
 * and serves the least recently used GIF first.
 *
 * These point at Tenor's LARGE rendition (14 actions, 76 GIFs):
 *
 *   AAAAM  small preview, ~165-220px wide  <- what "share GIF" links use
 *   AAAAC  full-size original, usually 498px wide
 *   AAAAd  large rendition, 498-640px, re-encoded smaller   <- used here
 *
 * Discord stretches a media gallery to the message width, so a 165px preview is
 * upscaled and looks soft and short next to a `AAAAd` asset. Every URL below was
 * fetched and measured: 480px wide minimum, 498px median, biggest single file
 * 5.4MB, so all of them stay under Discord's 8MB upload limit.
 */
const GIFS = {
  hug: [
    'https://media.tenor.com/HYkaTQBybO4AAAAd/hug-anime.gif',
    'https://media.tenor.com/ElYQ-aw8hcgAAAAd/anime-comfort-hug-anime-hug.gif',
    'https://media.tenor.com/cZBieRzIAooAAAAd/hug-love.gif',
    'https://media.tenor.com/J7eGDvGeP9IAAAAd/enage-kiss-anime-hug.gif',
    'https://media.tenor.com/mbYNvgr5WfAAAAAd/hug-big-hug.gif',
    'https://media.tenor.com/PfXs1kv3BEIAAAAd/rikka-hug-anime.gif',
    'https://media.tenor.com/i2Mwr7Xk__YAAAAd/cat-girl-snuggle.gif',
    'https://media.tenor.com/JHxO8hB5AVUAAAAd/anime-hug-cute-hug.gif',
  ],
  kiss: [
    'https://media.tenor.com/WHjdnAs30_0AAAAd/anime-kiss.gif',
    'https://media.tenor.com/EL9MAPY2258AAAAd/anime-kiss-cute-kiss.gif',
    'https://media.tenor.com/aw6zICZyQv0AAAAC/anime-kiss-anime-kiss-cheek.gif',
    'https://media.tenor.com/7KOFDrLkp0YAAAAd/anime-kiss-anime.gif',
    'https://media.tenor.com/xBGwT2vGvjgAAAAd/anime-kiss.gif',
    'https://media.tenor.com/kmxEaVuW8AoAAAAd/kiss-gentle-kiss.gif',
    'https://media.tenor.com/WcbjocFQNQ0AAAAd/kiss-him.gif',
    'https://media.tenor.com/6xGa80rt280AAAAd/kiss-love.gif',
  ],
  slap: [
    'https://media.tenor.com/njNMglgwc9sAAAAd/anime-slap.gif',
    'https://media.tenor.com/6uwt4yxg4RwAAAAd/girl-slap.gif',
    'https://media.tenor.com/Ws6Dm1ZW_vMAAAAd/girl-slap.gif',
    'https://media.tenor.com/eU5H6GbVjrcAAAAd/slap-jjk.gif',
    'https://media.tenor.com/XiYuU9h44-AAAAAd/anime-slap-mad.gif',
  ],
  pat: [
    'https://media.tenor.com/7xrOS-GaGAIAAAAd/anime-pat-anime.gif',
    'https://media.tenor.com/S7060WVR57YAAAAd/anime-pat-head-pat.gif',
    'https://media.tenor.com/vmNr9iw-tFoAAAAC/pat-pat-anime-anime-pat-pat.gif',
    'https://media.tenor.com/5Epx4bEKJA4AAAAd/frieren-pat.gif',
    'https://media.tenor.com/FSw1dMbrNLUAAAAd/pat-pat.gif',
  ],
  cuddle: [
    'https://media.tenor.com/08vDStcjoGAAAAAd/cuddle-anime-hug-anime.gif',
    'https://media.tenor.com/6_CN5d4S2wMAAAAd/anime-cute-anime-cuddle.gif',
    'https://media.tenor.com/RR4YJdzCJRMAAAAd/chainsaw-man-hug.gif',
    'https://media.tenor.com/MHRrpBb_fUsAAAAd/watanare-ajisai-san-cuddles-renako.gif',
    'https://media.tenor.com/Q-seMbfISyAAAAAd/cuddle.gif',
  ],
  poke: [
    'https://media.tenor.com/dmSK53Ce6AQAAAAd/anime-poke.gif',
    'https://media.tenor.com/gMqsQ1wwbhgAAAAd/anime-poke.gif',
    'https://media.tenor.com/QDNTqOInK5MAAAAd/anime-poke.gif',
    'https://media.tenor.com/jNx0V84WbqkAAAAd/anime-anime-poke.gif',
    'https://media.tenor.com/iu_Lnd86GxAAAAAd/nekone-utawarerumono.gif',
  ],
  dance: [
    'https://media.tenor.com/jWRFHjiNdkgAAAAd/anime-dance.gif',
    'https://media.tenor.com/lvJB5z4lZlUAAAAd/anime-dance.gif',
    'https://media.tenor.com/W5uNf1aj4bUAAAAd/anime-party-dance.gif',
    'https://media.tenor.com/d-lz7Nu6X2oAAAAd/bocchi-the-rock-bocchi.gif',
    'https://media.tenor.com/Ynm40n9fwNMAAAAd/chainsaw-man-dance.gif',
  ],
  cry: [
    'https://media.tenor.com/b1qPDLCJRTkAAAAd/cry-crying-girl.gif',
    'https://media.tenor.com/PhUSf6rVeyAAAAAd/bocchi-the-rock-crying.gif',
    'https://media.tenor.com/ZNTUNjm_4sUAAAAC/frieren-crying.gif',
    'https://media.tenor.com/ikYgWAhvNFMAAAAd/weeping-crying.gif',
    'https://media.tenor.com/AdvahmGyiXkAAAAd/crying-girl.gif',
    'https://media.tenor.com/pWQsUP6AtNgAAAAd/luffy-crying.gif',
  ],
  laugh: [
    'https://media.tenor.com/V3KSIt0QNRkAAAAd/anime-laugh-anime.gif',
    'https://media.tenor.com/ETvEeDnbX7AAAAAd/my-dress-up-darling-anime-laugh.gif',
    'https://media.tenor.com/jz9aJI4fys4AAAAd/laugh-giggle.gif',
    'https://media.tenor.com/qSqHxIuVVQMAAAAd/konata-laugh.gif',
    'https://media.tenor.com/hHXg9pbbBC0AAAAC/happy-anime-boy-laughing.gif',
  ],
  highfive: [
    'https://media.tenor.com/dkaxvbcQ3M8AAAAd/anime-high-five-high-five.gif',
    'https://media.tenor.com/JBBZ9mQntx8AAAAd/anime-high-five.gif',
    'https://media.tenor.com/tbGQf-3K6CYAAAAd/high-five-anime.gif',
    'https://media.tenor.com/uJ4U79P2uFEAAAAd/hunter-x-hunter-high-five.gif',
  ],
  handshake: [
    'https://media.tenor.com/4yWFhsgqzfEAAAAd/anime-handshake.gif',
    'https://media.tenor.com/rmklzHMYy80AAAAd/nichijou-anime.gif',
    'https://media.tenor.com/rOfLUKALeIcAAAAd/anime-handshake.gif',
    'https://media.tenor.com/x_DBAYcMJN0AAAAd/nichijou-handshake.gif',
  ],
  sleep: [
    'https://media.tenor.com/1XDMHAv5HcQAAAAd/anime-sleep.gif',
    'https://media.tenor.com/jfwf7xpv5p0AAAAd/sleep-anime.gif',
    'https://media.tenor.com/UDBZFppJqk8AAAAd/anime-anime-sleep.gif',
    'https://media.tenor.com/GOEO_QhhtlYAAAAd/go-to-sleep-anime.gif',
    'https://media.tenor.com/Cj0YvuE94eoAAAAd/onimai-anime-sleep.gif',
    'https://media.tenor.com/mN-2yFvFO8UAAAAd/anime-sleep-sleepy.gif',
  ],
  eat: [
    'https://media.tenor.com/DivhaJeTLAMAAAAd/eating-yum.gif',
    'https://media.tenor.com/W88fpJ7X9D4AAAAd/rotte-no-omocha-anime-girl-eating.gif',
    'https://media.tenor.com/NUt8vwChgIcAAAAd/luffy-eating.gif',
    'https://media.tenor.com/DSq_N2vMU6MAAAAd/eat-eating.gif',
  ],
  drink: [
    'https://media.tenor.com/_Q5cYqG4eNYAAAAd/anime-drinking-anime-drink.gif',
    'https://media.tenor.com/rJxGy9CYwHoAAAAd/anime-read.gif',
    'https://media.tenor.com/oda0RMrpJlcAAAAd/anime-sip.gif',
    'https://media.tenor.com/OQsdGc_qxyQAAAAd/anime-tea.gif',
    'https://media.tenor.com/wxwHPKBhpcoAAAAd/goblinslayer-drinking.gif',
    'https://media.tenor.com/qXlK711frsEAAAAd/himouto-umaru-chan-anime-cola.gif',
  ],
};

// Actions in GIFS, in display order (also the /action subcommand order).
const TITLES = {
  "hug": "hug",
  "kiss": "kiss",
  "slap": "slap",
  "pat": "pat",
  "cuddle": "cuddle",
  "poke": "poke",
  "dance": "dance",
  "cry": "cry",
  "laugh": "laugh",
  "highfive": "high five",
  "handshake": "handshake",
  "sleep": "sleep",
  "eat": "eat",
  "drink": "drink"
};

module.exports = { GIFS, TITLES };
