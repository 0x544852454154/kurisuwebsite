'use strict';

/**
 * Curated action GIF URLs for the /action interaction commands.
 *
 * Every link below is a direct `media.tenor.com/...gif` asset that was taken
 * from a live Tenor search page, so it renders as an animated GIF in Discord
 * without any runtime API call. A command rotates through its own list and
 * always serves the least recently used GIF first.
 */
const GIFS = {
  hug: [
    'https://media.tenor.com/HYkaTQBybO4AAAAM/hug-anime.gif',
    'https://media.tenor.com/ElYQ-aw8hcgAAAAM/anime-comfort-hug-anime-hug.gif',
    'https://media.tenor.com/cZBieRzIAooAAAAM/hug-love.gif',
    'https://media.tenor.com/J7eGDvGeP9IAAAAM/enage-kiss-anime-hug.gif',
    'https://media.tenor.com/mbYNvgr5WfAAAAAM/hug-big-hug.gif',
    'https://media.tenor.com/PfXs1kv3BEIAAAAM/rikka-hug-anime.gif',
    'https://media.tenor.com/i2Mwr7Xk__YAAAAM/cat-girl-snuggle.gif',
    'https://media.tenor.com/JHxO8hB5AVUAAAAM/anime-hug-cute-hug.gif',
  ],
  kiss: [
    'https://media.tenor.com/4ne78Si43M4AAAAM/kiss-kiss-anime.gif',
    'https://media.tenor.com/EL9MAPY2258AAAAM/anime-kiss-cute-kiss.gif',
    'https://media.tenor.com/aw6zICZyQv0AAAAM/anime-kiss-anime-kiss-cheek.gif',
    'https://media.tenor.com/7KOFDrLkp0YAAAAM/anime-kiss-anime.gif',
    'https://media.tenor.com/xBGwT2vGvjgAAAAM/anime-kiss.gif',
    'https://media.tenor.com/kmxEaVuW8AoAAAAM/kiss-gentle-kiss.gif',
    'https://media.tenor.com/WcbjocFQNQ0AAAAM/kiss-him.gif',
    'https://media.tenor.com/6xGa80rt280AAAAM/kiss-love.gif',
  ],
  slap: [
    'https://media.tenor.com/njNMglgwc9sAAAAM/anime-slap.gif',
    'https://media.tenor.com/6uwt4yxg4RwAAAAM/girl-slap.gif',
    'https://media.tenor.com/pfD48CzbyTwAAAAM/angry-anime.gif',
    'https://media.tenor.com/Z5ORIDwGVLcAAAAM/baka-anime.gif',
    'https://media.tenor.com/ykCjxWVvq18AAAAM/slap-slapping.gif',
    'https://media.tenor.com/eU5H6GbVjrcAAAAM/slap-jjk.gif',
    'https://media.tenor.com/XiYuU9h44-AAAAAM/anime-slap-mad.gif',
  ],
  pat: [
    'https://media.tenor.com/7xrOS-GaGAIAAAAM/anime-pat-anime.gif',
    'https://media.tenor.com/S7060WVR57YAAAAM/anime-pat-head-pat.gif',
    'https://media.tenor.com/vmNr9iw-tFoAAAAM/pat-pat-anime-anime-pat-pat.gif',
    'https://media.tenor.com/5a4O1hOHucgAAAAM/headpats-anime-headpat.gif',
    'https://media.tenor.com/1vt_6_y0nQsAAAAM/cat-girl-head-pat.gif',
    'https://media.tenor.com/FSw1dMbrNLUAAAAM/pat-pat.gif',
  ],
  cuddle: [
    'https://media.tenor.com/08vDStcjoGAAAAAM/cuddle-anime-hug-anime.gif',
    'https://media.tenor.com/6_CN5d4S2wMAAAAM/anime-cute-anime-cuddle.gif',
    'https://media.tenor.com/ukBByoKUNFEAAAAM/cuddle-anime.gif',
    'https://media.tenor.com/c2SMIhi33DMAAAAM/cuddle-bed-hug.gif',
    'https://media.tenor.com/MHRrpBb_fUsAAAAM/watanare-ajisai-san-cuddles-renako.gif',
    'https://media.tenor.com/Q-seMbfISyAAAAAM/cuddle.gif',
  ],
  poke: [
    'https://media.tenor.com/dmSK53Ce6AQAAAAM/anime-poke.gif',
    'https://media.tenor.com/gMqsQ1wwbhgAAAAM/anime-poke.gif',
    'https://media.tenor.com/QDNTqOInK5MAAAAM/anime-poke.gif',
    'https://media.tenor.com/jNx0V84WbqkAAAAM/anime-anime-poke.gif',
    'https://media.tenor.com/Jmwz6O0anAkAAAAM/anime-poke-anime-smirk.gif',
  ],
  dance: [
    'https://media.tenor.com/jWRFHjiNdkgAAAAM/anime-dance.gif',
    'https://media.tenor.com/lvJB5z4lZlUAAAAM/anime-dance.gif',
    'https://media.tenor.com/W5uNf1aj4bUAAAAM/anime-party-dance.gif',
    'https://media.tenor.com/qhfzQWre-ewAAAAM/dance-anime-girl.gif',
    'https://media.tenor.com/TxflfpxQNgcAAAAM/happy-dance.gif',
    'https://media.tenor.com/Ynm40n9fwNMAAAAM/chainsaw-man-dance.gif',
  ],
  cry: [
    'https://media.tenor.com/b1qPDLCJRTkAAAAM/cry-crying-girl.gif',
    'https://media.tenor.com/PhUSf6rVeyAAAAAM/bocchi-the-rock-crying.gif',
    'https://media.tenor.com/ZNTUNjm_4sUAAAAM/frieren-crying.gif',
    'https://media.tenor.com/ikYgWAhvNFMAAAAM/weeping-crying.gif',
    'https://media.tenor.com/AdvahmGyiXkAAAAM/crying-girl.gif',
    'https://media.tenor.com/pWQsUP6AtNgAAAAM/luffy-crying.gif',
  ],
  laugh: [
    'https://media.tenor.com/V3KSIt0QNRkAAAAM/anime-laugh-anime.gif',
    'https://media.tenor.com/ETvEeDnbX7AAAAAM/my-dress-up-darling-anime-laugh.gif',
    'https://media.tenor.com/jz9aJI4fys4AAAAM/laugh-giggle.gif',
    'https://media.tenor.com/qSqHxIuVVQMAAAAM/konata-laugh.gif',
    'https://media.tenor.com/hHXg9pbbBC0AAAAM/happy-anime-boy-laughing.gif',
    'https://media.tenor.com/7ovRY44652IAAAAM/laughing-at-you-anime-laughing.gif',
  ],
  highfive: [
    'https://media.tenor.com/dkaxvbcQ3M8AAAAM/anime-high-five-high-five.gif',
    'https://media.tenor.com/JBBZ9mQntx8AAAAM/anime-high-five.gif',
    'https://media.tenor.com/KsBqZv13AW0AAAAM/anime-high-five-high-five.gif',
    'https://media.tenor.com/pBjSyy6ItmgAAAAM/fist-bump-anime.gif',
    'https://media.tenor.com/uJ4U79P2uFEAAAAM/hunter-x-hunter-high-five.gif',
  ],
  handshake: [
    'https://media.tenor.com/4yWFhsgqzfEAAAAM/anime-handshake.gif',
    'https://media.tenor.com/loE0XJO53z4AAAAM/anime-handshake.gif',
    'https://media.tenor.com/PMWbOGDBTvQAAAAM/anime-handshake.gif',
    'https://media.tenor.com/rOfLUKALeIcAAAAM/anime-handshake.gif',
    'https://media.tenor.com/x_DBAYcMJN0AAAAM/nichijou-handshake.gif',
  ],
  sleep: [
    'https://media.tenor.com/1XDMHAv5HcQAAAAM/anime-sleep.gif',
    'https://media.tenor.com/jfwf7xpv5p0AAAAM/sleep-anime.gif',
    'https://media.tenor.com/UDBZFppJqk8AAAAM/anime-anime-sleep.gif',
    'https://media.tenor.com/GOEO_QhhtlYAAAAM/go-to-sleep-anime.gif',
    'https://media.tenor.com/Cj0YvuE94eoAAAAM/onimai-anime-sleep.gif',
    'https://media.tenor.com/mN-2yFvFO8UAAAAM/anime-sleep-sleepy.gif',
  ],
  eat: [
    'https://media.tenor.com/rS_bbf7FEogAAAAM/cute-anime-eating-cute-lumiscend.gif',
    'https://media.tenor.com/W88fpJ7X9D4AAAAM/rotte-no-omocha-anime-girl-eating.gif',
    'https://media.tenor.com/DivhaJeTLAMAAAAM/eating-yum.gif',
    'https://media.tenor.com/cWQWR_Xp-MUAAAAM/frieren-eating.gif',
    'https://media.tenor.com/NUt8vwChgIcAAAAM/luffy-eating.gif',
    'https://media.tenor.com/DSq_N2vMU6MAAAAM/eat-eating.gif',
  ],
  drink: [
    'https://media.tenor.com/_Q5cYqG4eNYAAAAM/anime-drinking-anime-drink.gif',
    'https://media.tenor.com/NtJzyAYMfW8AAAAM/drink-anime.gif',
    'https://media.tenor.com/oda0RMrpJlcAAAAM/anime-sip.gif',
    'https://media.tenor.com/OQsdGc_qxyQAAAAM/anime-tea.gif',
    'https://media.tenor.com/wxwHPKBhpcoAAAAM/goblinslayer-drinking.gif',
    'https://media.tenor.com/qXlK711frsEAAAAM/himouto-umaru-chan-anime-cola.gif',
  ],
};

module.exports = { GIFS };
