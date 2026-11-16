// This module intentionally mirrors src/daily.js. Its pool comes from D1 so answer
// coordinates and scoring metadata never leave the worker.
const PINNED_IDS = {
  "2026-10-12": [
    "hamburg-germany",
    "san-salvador-sv",
    "port-harcourt-ng",
    "st-johns-antigua-and-barbuda",
    "salta-ar"
  ],
  "2026-10-13": [
    "chicago",
    "nassau-bahamas",
    "carcassonne-cite",
    "lanzhou-cn",
    "kirkenes-norway"
  ],
  "2026-10-14": [
    "paris-france",
    "tallinn-estonia",
    "cartagena",
    "nashik-in",
    "khiva-uzbekistan"
  ],
  "2026-10-15": [
    "rio-de-janeiro-brazil",
    "st-johns-canada",
    "monterrey-mexico",
    "bukhara-uzbekistan",
    "oymyakon-russia"
  ],
  "2026-10-16": [
    "reykjavik-iceland",
    "panama-city",
    "toulouse-france",
    "oaxaca-mexico",
    "funafuti-tuvalu"
  ],
  "2026-10-17": [
    "the-hague-nl",
    "havana",
    "cartagena",
    "vientiane",
    "honningsvag-norway"
  ],
  "2026-10-18": [
    "tokyo-japan",
    "boise-usa",
    "enugu-ng",
    "ciudad-juarez-mx",
    "krasnoyarsk-ru"
  ],
  "2026-10-19": [
    "boston-usa",
    "da-nang-vn",
    "nanjing-cn",
    "darjeeling-in",
    "nampula-mz"
  ],
  "2026-10-20": [
    "st-louis-usa",
    "da-nang-vn",
    "gyeongju-kr",
    "guilin-cn",
    "victoria-seychelles"
  ],
  "2026-10-21": [
    "brussels-belgium",
    "riyadh",
    "fez-morocco",
    "thimphu-bhutan",
    "salta-ar"
  ],
  "2026-10-22": [
    "vatican-city",
    "karachi-pakistan",
    "brisbane-australia",
    "paraty-historic-center",
    "miri-my"
  ],
  "2026-10-23": [
    "edinburgh-scotland",
    "southampton-england",
    "quezon-city-ph",
    "hamilton-ca",
    "mexico-city-mexico"
  ],
  "2026-10-24": [
    "vienna-austria",
    "johannesburg-south-africa",
    "calgary-canada",
    "thiruvananthapuram-in",
    "orlando"
  ],
  "2026-10-25": [
    "washington-dc-usa",
    "guayaquil-ec",
    "ibb",
    "suzhou-cn",
    "kolwezi-cd"
  ],
  "2026-10-26": [
    "frankfurt-am-main-de",
    "asuncion-py",
    "basrah-iq",
    "alberobello-trulli",
    "bhuj"
  ],
  "2026-10-27": [
    "cebu-city",
    "jerash-jordan",
    "khabarovsk-ru",
    "innsbruck-austria",
    "arequipa-pe"
  ],
  "2026-10-28": [
    "cologne-de",
    "cusco-peru",
    "auckland-new-zealand",
    "adelaide-australia",
    "athens-greece"
  ],
  "2026-10-29": [
    "cotonou-bj",
    "savannah",
    "tianjin-cn",
    "joao-pessoa-br",
    "nantes-fr"
  ],
  "2026-10-30": [
    "luoyang-cn",
    "brasilia-br",
    "sharjah-ae",
    "samarinda",
    "la-paz-bolivia"
  ],
  "2026-10-31": [
    "thessaloniki-gr",
    "bucaramanga-co",
    "erbil-iq",
    "enugu-ng",
    "dnipro-ua"
  ],
  "2026-11-01": [
    "sao-paulo-br",
    "guayaquil-ec",
    "kunming-cn",
    "hiroshima-japan",
    "ephesus"
  ],
  "2026-11-02": [
    "gqeberha-za",
    "valencia-es",
    "dongshi",
    "diyarbakr-tr",
    "kuwait-city-kuwait"
  ],
  "2026-11-03": [
    "kota-kinabalu-my",
    "brisbane-australia",
    "port-vila-vanuatu",
    "dili-timor-leste",
    "limassol-cy"
  ],
  "2026-11-04": [
    "hargeysa",
    "providence-usa",
    "thimphu-bhutan",
    "udaipur-india",
    "cordoba-ar"
  ],
  "2026-11-05": [
    "kuala-lumpur-malaysia",
    "florianopolis-br",
    "piura-pe",
    "ostersund",
    "aberdeen-scotland"
  ],
  "2026-11-06": [
    "belo-horizonte-br",
    "baltimore",
    "st-johns-antigua-and-barbuda",
    "quebec-city-canada",
    "denpasar-indonesia"
  ],
  "2026-11-07": [
    "bilbao-spain",
    "merida-mx",
    "lagos",
    "istanbul",
    "olympia-greece"
  ],
  "2026-11-08": [
    "kharkiv-ua",
    "boston-usa",
    "basseterre-st-kitts-and-nevis",
    "guayaquil-ec",
    "bari-it"
  ],
  "2026-11-09": [
    "delhi",
    "cusco-peru",
    "bishkek-kyrgyzstan",
    "grand-rapids-usa",
    "matera-sassi"
  ],
  "2026-11-10": [
    "miami-usa",
    "antananarivo",
    "hermosillo-mx",
    "joao-pessoa-br",
    "guatemala-city-gt"
  ],
  "2026-11-11": [
    "guanajuato-mx",
    "brussels-belgium",
    "rimini",
    "daejeon-kr",
    "port-arthur"
  ],
  "2026-11-12": [
    "bukavu-cd",
    "bruges-belgium",
    "dnipro-ua",
    "bandar-seri-begawan-brunei",
    "capri-it"
  ],
  "2026-11-13": [
    "niigata",
    "the-hague-nl",
    "agra-in",
    "alexandria-egypt",
    "memphis-us"
  ],
  "2026-11-14": [
    "mosul-iq",
    "brampton-ca",
    "bandung-id",
    "kyiv-ukraine",
    "tunis-tunisia"
  ],
  "2026-11-15": [
    "guadalajara-mexico",
    "pristina-xk",
    "maracaibo-ve",
    "dresden-germany",
    "palma-de-mallorca"
  ],
  "2026-11-16": [
    "kingstown-st-vincent-and-grenadines",
    "jacksonville",
    "da-nang-vn",
    "troy",
    "xian-china"
  ]
};

function hashSeed(text) {
  let h = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomFrom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function dayNumber(date) {
  const epoch = Date.UTC(2026, 9, 1) / 86400000;
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000 - epoch;
}

function dailyQueue(locations) {
  const queue = locations.slice();
  const random = randomFrom(hashSeed('pool-v2'));
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [queue[index], queue[swap]] = [queue[swap], queue[index]];
  }
  return queue;
}

function picksForDay(queue, day, recentIds) {
  if (!queue.length) return [];
  const start = ((5 * day % queue.length) + queue.length) % queue.length;
  const usedIds = new Set();
  const usedCountries = new Set();
  const result = [];
  let cursor = start;
  for (let round = 0; round < 5; round += 1) {
    let pick = null;
    for (let offset = 0; offset < queue.length; offset += 1) {
      const item = queue[(cursor + offset) % queue.length];
      if (!recentIds.has(item.location_id) && !usedIds.has(item.location_id)
        && !usedCountries.has(item.country)) {
        pick = item;
        cursor = (cursor + offset + 1) % queue.length;
        break;
      }
    }
    if (!pick) {
      for (let offset = 0; offset < queue.length; offset += 1) {
        const item = queue[(cursor + offset) % queue.length];
        if (!recentIds.has(item.location_id) && !usedIds.has(item.location_id)) {
          pick = item;
          cursor = (cursor + offset + 1) % queue.length;
          break;
        }
      }
    }
    if (!pick) break;
    result.push(pick.location_id);
    usedIds.add(pick.location_id);
    usedCountries.add(pick.country);
  }
  return result;
}

export function dailyIds(date, locations) {
  const day = dayNumber(date);
  const queue = dailyQueue(locations);
  if (day < 0) return picksForDay(queue, day, new Set());
  const history = [];
  for (let current = 0; current <= day; current += 1) {
    const recentIds = new Set(history.flat());
    history.push(picksForDay(queue, current, recentIds));
    if (history.length > 29) history.shift();
  }
  return history.at(-1);
}

export function manifestIds(date, locations) {
  return PINNED_IDS[date] || dailyIds(date, locations);
}

export async function dailyManifest(env, date) {
  const result = await env.DB.prepare('SELECT location_id, answer_lat, answer_lng, country, continent FROM daily_locations ORDER BY pool_index').all();
  const locations = result.results || [];
  const byId = new Map(locations.map((item) => [item.location_id, item]));
  return manifestIds(date, locations).map((id) => {
    const location = byId.get(id);
    return location && {
      ...location, lat: location.answer_lat, lng: location.answer_lng,
    };
  });
}
