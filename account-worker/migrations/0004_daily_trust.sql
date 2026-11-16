-- Server-owned Daily pool, generated from assets/locations.json by the checked-in
-- account-worker/data/daily-locations.json snapshot. pool_index preserves source order.
CREATE TABLE IF NOT EXISTS daily_locations (
  location_id TEXT PRIMARY KEY,
  answer_lat REAL NOT NULL CHECK (answer_lat >= -90 AND answer_lat <= 90),
  answer_lng REAL NOT NULL CHECK (answer_lng >= -180 AND answer_lng <= 180),
  country TEXT NOT NULL,
  continent TEXT NOT NULL,
  pool_index INTEGER NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS canonical_daily_rounds (
  account_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  daily_date TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 4),
  location_id TEXT NOT NULL REFERENCES daily_locations (location_id),
  guess_lat REAL NOT NULL CHECK (guess_lat >= -90 AND guess_lat <= 90),
  guess_lng REAL NOT NULL CHECK (guess_lng >= -180 AND guess_lng <= 180),
  distance_km REAL NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1000),
  country TEXT NOT NULL,
  continent TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, daily_date, slot),
  UNIQUE (account_id, daily_date, location_id)
);
CREATE INDEX IF NOT EXISTS canonical_daily_rounds_date_account_idx
  ON canonical_daily_rounds (daily_date, account_id);

CREATE TABLE IF NOT EXISTS canonical_daily_completions (
  account_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  daily_date TEXT NOT NULL,
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 5000),
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, daily_date)
);
CREATE INDEX IF NOT EXISTS canonical_daily_completions_account_date_idx
  ON canonical_daily_completions (account_id, daily_date);

INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('aberdeen-scotland', 57.1497, -2.0943, 'Scotland', 'Europe', 0);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('abidjan-ivory-coast', 5.36, -4.0083, 'Côte d''Ivoire', 'Africa', 1);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('abu-dhabi-ae', 24.45118, 54.39696, 'United Arab Emirates', 'Asia', 2);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('abuja-ng', 9.05785, 7.49508, 'Nigeria', 'Africa', 3);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('acapulco-de-juarez-mx', 16.84942, -99.90891, 'Mexico', 'North America', 4);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('accra', 5.55602, -0.1969, 'Ghana', 'Africa', 5);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('addis-ababa-ethiopia', 9.032, 38.7469, 'Ethiopia', 'Africa', 6);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('adelaide-australia', -34.9285, 138.6007, 'Australia', 'Oceania', 7);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('aden', 12.77957, 45.03852, 'Yemen', 'Asia', 8);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('agadez', 16.97333, 7.99111, 'Niger', 'Africa', 9);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('agadir-ma', 30.42018, -9.59815, 'Morocco', 'Africa', 10);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('agra-in', 27.18333, 78.01667, 'India', 'Asia', 11);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ahmedabad-in', 23.02579, 72.58727, 'India', 'Asia', 12);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ahvaz', 31.31901, 48.6842, 'Iran', 'Asia', 13);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ajman', 25.40177, 55.47878, 'United Arab Emirates', 'Asia', 14);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('al-ain-city', 24.19167, 55.76056, 'United Arab Emirates', 'Asia', 15);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('alberobello-trulli', 40.7842, 17.237, 'Italy', 'Europe', 16);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('albuquerque-usa', 35.0844, -106.6504, 'United States', 'North America', 17);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('aleppo-sy', 36.20124, 37.16117, 'Syria', 'Asia', 18);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('alexandria-egypt', 31.2001, 29.9187, 'Egypt', 'Africa', 19);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('algiers', 36.77466, 3.05873, 'Algeria', 'Africa', 20);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('alice-springs', -23.7, 133.87, 'Australia', 'Oceania', 21);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('almaty', 43.25249, 76.9115, 'Kazakhstan', 'Asia', 22);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('amman-jordan', 31.9454, 35.9284, 'Jordan', 'Asia', 23);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('amritsar-india', 31.634, 74.8723, 'India', 'Asia', 24);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('amsterdam-netherlands', 52.3676, 4.9041, 'Netherlands', 'Europe', 25);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('anchorage-usa', 61.2181, -149.9003, 'United States', 'North America', 26);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('angeles-city', 15.15, 120.58333, 'Philippines', 'Asia', 27);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ankara-tr', 39.91987, 32.85427, 'Turkey', 'Asia', 28);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('antalya', 36.90812, 30.69556, 'Turkey', 'Asia', 29);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('antananarivo', -18.91368, 47.53613, 'Madagascar', 'Africa', 30);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('antwerp-be', 51.2194, 4.4025, 'Belgium', 'Europe', 31);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('apia-samoa', -13.8507, -171.7514, 'Samoa', 'Oceania', 32);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('arar', 30.97531, 41.03808, 'Saudi Arabia', 'Asia', 33);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('armenia', 13.74361, -89.49889, 'El Salvador', 'North America', 34);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('arusha-tanzania', -3.3869, 36.683, 'Tanzania', 'Africa', 35);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('asmara-eritrea', 15.3229, 38.9251, 'Eritrea', 'Africa', 36);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('astana-kz', 51.13333, 71.43333, 'Kazakhstan', 'Asia', 37);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('asuncion-py', -25.28646, -57.647, 'Paraguay', 'South America', 38);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('aswan-egypt', 24.0889, 32.8998, 'Egypt', 'Africa', 39);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('athens-greece', 37.9838, 23.7275, 'Greece', 'Europe', 40);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('atlanta-usa', 33.749, -84.388, 'United States', 'North America', 41);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('auckland-new-zealand', -36.8485, 174.7633, 'New Zealand', 'Oceania', 42);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('austin-usa', 30.2672, -97.7431, 'United States', 'North America', 43);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('avarua-cook-islands', -21.2078, -159.775, 'Cook Islands', 'Oceania', 44);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('baghdad', 33.34058, 44.40088, 'Iraq', 'Asia', 45);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('baku', 40.37112, 49.83399, 'Azerbaijan', 'Asia', 46);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('baltimore', 39.289444, -76.615278, 'United States', 'North America', 47);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bamako', 12.60915, -7.97522, 'Mali', 'Africa', 48);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bandung-id', -6.92222, 107.60694, 'Indonesia', 'Asia', 49);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('banff', 51.177778, -115.573611, 'Canada', 'North America', 50);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bangkok-thailand', 13.7563, 100.5018, 'Thailand', 'Asia', 51);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bangui-cf', 4.36122, 18.55496, 'Central African Republic', 'Africa', 52);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('eldoret-ke', 0.51667, 35.28333, 'Kenya', 'Africa', 53);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('barquisimeto-ve', 10.0647, -69.35703, 'Venezuela', 'South America', 54);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('barranquilla-co', 10.96854, -74.78132, 'Colombia', 'South America', 55);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('barrow-alaska', 71.2906, -156.7887, 'United States', 'North America', 56);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('basel-switzerland', 47.5596, 7.5886, 'Switzerland', 'Europe', 57);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('basrah-iq', 30.50852, 47.7804, 'Iraq', 'Asia', 58);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('batam-id', 1.14937, 104.02491, 'Indonesia', 'Asia', 59);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('beijing-china', 39.9042, 116.4074, 'China', 'Asia', 60);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('beira-mz', -19.84361, 34.83889, 'Mozambique', 'Africa', 61);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('beirut-lebanon', 33.8938, 35.5018, 'Lebanon', 'Asia', 62);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('belem-br', -1.45583, -48.50444, 'Brazil', 'South America', 63);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('belfast', 54.5967, -5.93, 'Northern Ireland', 'Europe', 64);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('belgrade', 44.80401, 20.46513, 'Serbia', 'Europe', 65);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('belo-horizonte-br', -19.92083, -43.93778, 'Brazil', 'South America', 66);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bengaluru-in', 12.97194, 77.59369, 'India', 'Asia', 67);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('benghazi-ly', 32.11486, 20.06859, 'Libya', 'Africa', 68);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('benin-city-ng', 6.33815, 5.62575, 'Nigeria', 'Africa', 69);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bergen-norway', 60.3913, 5.3221, 'Norway', 'Europe', 70);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('berlin-germany', 52.52, 13.405, 'Germany', 'Europe', 71);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bethlehem', 31.704444, 35.206389, 'Palestine', 'Asia', 72);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('beverly-hills', 34.073056, -118.399444, 'United States', 'North America', 73);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bhuj', 23.25397, 69.66928, 'India', 'Asia', 74);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bilbao-spain', 43.263, -2.935, 'Spain', 'Europe', 75);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('birmingham-gb', 52.48142, -1.89983, 'England', 'Europe', 76);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bishkek-kyrgyzstan', 42.8746, 74.5698, 'Kyrgyzstan', 'Asia', 77);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('blantyre-mw', -15.78499, 35.00854, 'Malawi', 'Africa', 78);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bobo-dioulasso-bf', 11.18064, -4.29489, 'Burkina Faso', 'Africa', 79);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bordeaux-france', 44.8378, -0.5792, 'France', 'Europe', 80);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('boston-usa', 42.3601, -71.0589, 'United States', 'North America', 81);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bouake-ci', 7.69385, -5.03031, 'Côte d''Ivoire', 'Africa', 82);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('brampton-ca', 43.68341, -79.76633, 'Canada', 'North America', 83);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('brasilia-br', -15.79394, -47.88279, 'Brazil', 'South America', 84);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bratislava-slovakia', 48.1486, 17.1077, 'Slovakia', 'Europe', 85);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('brazzaville-cg', -4.26613, 15.28318, 'Congo', 'Africa', 86);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('brisbane-australia', -27.4698, 153.0251, 'Australia', 'Oceania', 87);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bristol', 51.45523, -2.59665, 'England', 'Europe', 88);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bruges-belgium', 51.2093, 3.2247, 'Belgium', 'Europe', 89);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('brussels-belgium', 50.8503, 4.3517, 'Belgium', 'Europe', 90);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bucaramanga-co', 7.125, -73.11895, 'Colombia', 'South America', 91);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bucharest-romania', 44.4268, 26.1025, 'Romania', 'Europe', 92);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('budapest-hungary', 47.4979, 19.0402, 'Hungary', 'Europe', 93);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('buenos-aires-argentina', -34.6037, -58.3816, 'Argentina', 'South America', 94);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bujumbura-bi', -3.38193, 29.36142, 'Burundi', 'Africa', 95);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bukavu-cd', -2.49077, 28.84281, 'DR Congo', 'Africa', 96);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bukhara-uzbekistan', 39.7681, 64.4556, 'Uzbekistan', 'Asia', 97);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bulawayo-zw', -20.15, 28.58333, 'Zimbabwe', 'Africa', 98);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('burnley', 53.8, -2.23333, 'England', 'Europe', 99);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bursa-tr', 40.19559, 29.06013, 'Turkey', 'Asia', 100);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('busan', 35.10168, 129.03004, 'South Korea', 'Asia', 101);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cagliari', 39.23054, 9.11917, 'Italy', 'Europe', 102);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cairns', -16.92, 145.78, 'Australia', 'Oceania', 103);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cairo', 30.06263, 31.24967, 'Egypt', 'Africa', 104);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('calgary-canada', 51.0447, -114.0719, 'Canada', 'North America', 105);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cali-co', 3.43054, -76.5199, 'Colombia', 'South America', 106);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('campo-grande-br', -20.44278, -54.64639, 'Brazil', 'South America', 107);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('can-tho-vn', 10.03711, 105.78825, 'Vietnam', 'Asia', 108);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('canberra-australia', -35.2809, 149.13, 'Australia', 'Oceania', 109);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cancun-mexico', 21.1619, -86.8515, 'Mexico', 'North America', 110);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cannes-fr', 43.5528, 7.0174, 'France', 'Europe', 111);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cape-town-south-africa', -33.9249, 18.4241, 'South Africa', 'Africa', 112);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('capri-it', 40.5508, 14.2425, 'Italy', 'Europe', 113);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('caracas-ve', 10.48801, -66.87919, 'Venezuela', 'South America', 114);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('carcassonne-cite', 43.2063, 2.3637, 'France', 'Europe', 115);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cardiff-wales', 51.4816, -3.1791, 'Wales', 'Europe', 116);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cartagena', 10.42656, -75.54417, 'Colombia', 'South America', 117);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('casablanca', 33.58831, -7.61138, 'Morocco', 'Africa', 118);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('caxias-do-sul-br', -29.16806, -51.17944, 'Brazil', 'South America', 119);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cebu-city', 10.31672, 123.89071, 'Philippines', 'Asia', 120);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('changsha', 28.19874, 112.97087, 'China', 'Asia', 121);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('charleston', 32.813889, -79.931944, 'United States', 'North America', 122);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('charlotte', 35.22709, -80.84313, 'United States', 'North America', 123);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chattogram-bd', 22.3384, 91.83168, 'Bangladesh', 'Asia', 124);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chefchaouen-morocco', 35.1714, -5.2697, 'Morocco', 'Africa', 125);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chengdu-cn', 30.66667, 104.06667, 'China', 'Asia', 126);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chennai-in', 13.08784, 80.27847, 'India', 'Asia', 127);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chiang-mai-thailand', 18.7883, 98.9853, 'Thailand', 'Asia', 128);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chicago', 41.85003, -87.65005, 'United States', 'North America', 129);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chiclayo-pe', -6.77008, -79.85495, 'Peru', 'South America', 130);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chihuahua-mx', 28.63528, -106.08889, 'Mexico', 'North America', 131);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chisinau-md', 47.00902, 28.85938, 'Moldova', 'Europe', 132);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('chongqing-cn', 29.56026, 106.55771, 'China', 'Asia', 133);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cincinnati', 39.1, -84.5125, 'United States', 'North America', 134);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ciudad-guayana-ve', 8.32238, -62.68966, 'Venezuela', 'South America', 135);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ciudad-juarez-mx', 31.72024, -106.46084, 'Mexico', 'North America', 136);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cleveland-usa', 41.4993, -81.6944, 'United States', 'North America', 137);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cochabamba-bo', -17.38195, -66.15995, 'Bolivia', 'South America', 138);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('colmar-france', 48.0794, 7.3585, 'France', 'Europe', 139);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('colombo-sri-lanka', 6.9271, 79.8612, 'Sri Lanka', 'Asia', 140);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('columbus', 39.96118, -82.99879, 'United States', 'North America', 141);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('conakry-gn', 9.53795, -13.67729, 'Guinea', 'Africa', 142);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('copenhagen-denmark', 55.6761, 12.5683, 'Denmark', 'Europe', 143);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cordoba-ar', -31.40648, -64.18853, 'Argentina', 'South America', 144);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cork-ireland', 51.8985, -8.4756, 'Ireland', 'Europe', 145);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cotonou-bj', 6.36536, 2.41833, 'Benin', 'Africa', 146);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cucuta-co', 7.90745, -72.5049, 'Colombia', 'South America', 147);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cuiaba-br', -15.59611, -56.09667, 'Brazil', 'South America', 148);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('curitiba-br', -25.42778, -49.27306, 'Brazil', 'South America', 149);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('da-nang-vn', 16.06778, 108.22083, 'Vietnam', 'Asia', 150);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('daegu-kr', 35.87028, 128.59111, 'South Korea', 'Asia', 151);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('daejeon-kr', 36.34913, 127.38493, 'South Korea', 'Asia', 152);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dakar', 14.6937, -17.44406, 'Senegal', 'Africa', 153);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dalian-cn', 38.91222, 121.60222, 'China', 'Asia', 154);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dallas-usa', 32.7767, -96.797, 'United States', 'North America', 155);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('damascus-syria', 33.5138, 36.2765, 'Syria', 'Asia', 156);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dammam-sa', 26.43442, 50.10326, 'Saudi Arabia', 'Asia', 157);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dar-es-salaam', -6.82349, 39.26951, 'Tanzania', 'Africa', 158);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('darjeeling-in', 27.041, 88.2663, 'India', 'Asia', 159);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('darwin', -12.438056, 130.841111, 'Australia', 'Oceania', 160);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('datong', 40.09361, 113.29139, 'China', 'Asia', 161);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('davao-ph', 7.07306, 125.61278, 'Philippines', 'Asia', 162);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('delhi', 28.65195, 77.23149, 'India', 'Asia', 163);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('denpasar-indonesia', -8.6705, 115.2126, 'Indonesia', 'Asia', 164);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('denver-usa', 39.7392, -104.9903, 'United States', 'North America', 165);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('detroit-usa', 42.3314, -83.0458, 'United States', 'North America', 166);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dhaka', 23.7104, 90.40744, 'Bangladesh', 'Asia', 167);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dili-timor-leste', -8.5569, 125.5603, 'Timor-Leste', 'Asia', 168);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('diyarbakr-tr', 37.91363, 40.21721, 'Turkey', 'Asia', 169);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dnipro-ua', 48.46664, 35.04066, 'Ukraine', 'Europe', 170);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dodoma-tz', -6.17221, 35.73947, 'Tanzania', 'Africa', 171);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('doha-qatar', 25.2854, 51.531, 'Qatar', 'Asia', 172);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('donetsk-ua', 48.023, 37.80224, 'Ukraine', 'Europe', 173);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dongshi', 23.45689, 120.15003, 'Taiwan', 'Asia', 174);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dortmund-de', 51.51494, 7.466, 'Germany', 'Europe', 175);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('douala-cm', 4.04827, 9.70428, 'Cameroon', 'Africa', 176);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dresden-germany', 51.0504, 13.7373, 'Germany', 'Europe', 177);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dubai', 25.26972, 55.30944, 'United Arab Emirates', 'Asia', 178);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dublin-ireland', 53.3498, -6.2603, 'Ireland', 'Europe', 179);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dubrovnik-croatia', 42.6507, 18.0944, 'Croatia', 'Europe', 180);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dundee', 56.46913, -2.97489, 'Scotland', 'Europe', 181);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dunedin-new-zealand', -45.8788, 170.5028, 'New Zealand', 'Oceania', 182);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dunkirk-evacuation', 51.05, 2.377, 'France', 'Europe', 183);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('durban-south-africa', -29.8587, 31.0218, 'South Africa', 'Africa', 184);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dushanbe-tajikistan', 38.5598, 68.787, 'Tajikistan', 'Asia', 185);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dusseldorf-de', 51.22319, 6.77927, 'Germany', 'Europe', 186);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('edinburgh-scotland', 55.9533, -3.1883, 'Scotland', 'Europe', 187);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('edmonton-canada', 53.5461, -113.4937, 'Canada', 'North America', 188);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ensenada-mx', 31.87149, -116.60071, 'Mexico', 'North America', 189);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('enugu-ng', 6.44132, 7.49883, 'Nigeria', 'Africa', 190);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ephesus', 37.941111, 27.341944, 'Turkey', 'Asia', 191);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('erbil-iq', 36.19117, 44.00943, 'Iraq', 'Asia', 192);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('erzurum', 39.90861, 41.27694, 'Turkey', 'Asia', 193);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('essen-de', 51.45657, 7.01228, 'Germany', 'Europe', 194);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('faisalabad-pk', 31.41554, 73.08969, 'Pakistan', 'Asia', 195);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('fatehpur-sikri', 27.09111, 77.66111, 'India', 'Asia', 196);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('fez-morocco', 34.0181, -5.0078, 'Morocco', 'Africa', 197);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('florence-italy', 43.7696, 11.2558, 'Italy', 'Europe', 198);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('florianopolis-br', -27.59667, -48.54917, 'Brazil', 'South America', 199);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('frankfurt-am-main-de', 50.11552, 8.68417, 'Germany', 'Europe', 200);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('freetown-sl', 8.48714, -13.2356, 'Sierra Leone', 'Africa', 201);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('fukuoka-jp', 33.6, 130.41667, 'Japan', 'Asia', 202);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('funafuti-tuvalu', -8.5211, 179.1983, 'Tuvalu', 'Oceania', 203);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gaborone', -24.658056, 25.912222, 'Botswana', 'Africa', 204);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('galway-ireland', 53.2707, -9.0568, 'Ireland', 'Europe', 205);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gaziantep-tr', 37.05944, 37.3825, 'Turkey', 'Asia', 206);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('geneva', 46.201667, 6.146944, 'Switzerland', 'Europe', 207);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('george-town-malaysia', 5.4141, 100.3288, 'Malaysia', 'Asia', 208);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ghent-belgium', 51.0543, 3.7174, 'Belgium', 'Europe', 209);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('giza-eg', 30.00944, 31.20861, 'Egypt', 'Africa', 210);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('glasgow-scotland', 55.8642, -4.2518, 'Scotland', 'Europe', 211);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('goiania-br', -16.67861, -49.25389, 'Brazil', 'South America', 212);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gqeberha-za', -33.96109, 25.61494, 'South Africa', 'Africa', 213);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('granada-es', 37.1773, -3.5986, 'Spain', 'Europe', 214);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guadalajara-mexico', 20.6597, -103.3496, 'Mexico', 'North America', 215);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guangzhou-cn', 23.11667, 113.25, 'China', 'Asia', 216);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guatemala-city-gt', 14.64072, -90.51327, 'Guatemala', 'North America', 217);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guayaquil-ec', -2.19616, -79.88621, 'Ecuador', 'South America', 218);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guilin-cn', 25.28022, 110.29639, 'China', 'Asia', 219);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gwangju', 35.15472, 126.91556, 'South Korea', 'Asia', 220);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('haikou', 20.03421, 110.34651, 'China', 'Asia', 221);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('haiphong-vn', 20.86481, 106.68345, 'Vietnam', 'Asia', 222);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('halifax-canada', 44.6488, -63.5752, 'Canada', 'North America', 223);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hallstatt', 47.5622, 13.6493, 'Austria', 'Europe', 224);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hamamatsu', 34.7, 137.73333, 'Japan', 'Asia', 225);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hamburg-germany', 53.5511, 9.9937, 'Germany', 'Europe', 226);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hamilton-ca', 43.25011, -79.84963, 'Canada', 'North America', 227);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hangzhou', 30.25, 120.1675, 'China', 'Asia', 228);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hanoi-vietnam', 21.0285, 105.8542, 'Vietnam', 'Asia', 229);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('harare-zimbabwe', -17.8216, 31.0492, 'Zimbabwe', 'Africa', 230);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('harbin-cn', 45.75, 126.65, 'China', 'Asia', 231);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hargeysa', 9.56, 44.065, 'Somalia', 'Africa', 232);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('havana', 23.13302, -82.38304, 'Cuba', 'North America', 233);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('heidelberg-de', 49.3988, 8.6724, 'Germany', 'Europe', 234);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('heimaey-iceland', 63.4411, -20.2489, 'Iceland', 'Europe', 235);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('helsinki-finland', 60.1699, 24.9384, 'Finland', 'Europe', 236);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hermosillo-mx', 29.08874, -110.96677, 'Mexico', 'North America', 237);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hiroshima-japan', 34.3853, 132.4553, 'Japan', 'Asia', 238);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ho-chi-minh-city-vn', 10.77556, 106.70194, 'Vietnam', 'Asia', 239);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hobart-australia', -42.8821, 147.3272, 'Australia', 'Oceania', 240);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hohhot-cn', 40.81056, 111.65222, 'China', 'Asia', 241);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('homs', 34.72405, 36.72559, 'Syria', 'Asia', 242);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hong-kong', 22.3193, 114.1694, 'China', 'Asia', 243);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('honiara-solomon-islands', -9.4456, 159.9729, 'Solomon Islands', 'Oceania', 244);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('honningsvag-norway', 70.9828, 25.9707, 'Norway', 'Europe', 245);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('honolulu-usa', 21.3099, -157.8581, 'United States', 'North America', 246);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('houston-usa', 29.7604, -95.3698, 'United States', 'North America', 247);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('huddersfield', 53.64904, -1.78416, 'England', 'Europe', 248);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hue-vn', 16.4619, 107.59546, 'Vietnam', 'Asia', 249);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ibadan-ng', 7.37756, 3.90591, 'Nigeria', 'Africa', 250);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ibb', 13.96667, 44.18333, 'Yemen', 'Asia', 251);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ibiza-es', 38.90883, 1.43296, 'Spain', 'Europe', 252);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ilulissat-greenland', 69.2167, -51.1, 'Denmark', 'Europe', 253);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('incheon-kr', 37.45646, 126.70515, 'South Korea', 'Asia', 254);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('indianapolis', 39.76838, -86.15804, 'United States', 'North America', 255);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('innsbruck-austria', 47.2692, 11.4041, 'Austria', 'Europe', 256);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('iqaluit-nunavut', 63.7467, -68.517, 'Canada', 'North America', 257);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('irkutsk-ru', 52.29566, 104.29076, 'Russia', 'Europe', 258);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('isfahan-iran', 32.6546, 51.668, 'Iran', 'Asia', 259);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('islamabad-pk', 33.6844, 73.0479, 'Pakistan', 'Asia', 260);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('isle-of-skye-gb', 57.3, -6.35, 'Scotland', 'Europe', 261);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('istanbul', 41.01384, 28.94966, 'Turkey', 'Asia', 262);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('izmir-tr', 38.41273, 27.13838, 'Turkey', 'Asia', 263);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jacksonville', 30.33218, -81.65565, 'United States', 'North America', 264);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jaipur-india', 26.9124, 75.7873, 'India', 'Asia', 265);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jakarta-indonesia', -6.2088, 106.8456, 'Indonesia', 'Asia', 266);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jeddah-sa', 21.49012, 39.18624, 'Saudi Arabia', 'Asia', 267);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jeju-city', 33.50972, 126.52194, 'South Korea', 'Asia', 268);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jerash-jordan', 32.2806, 35.8972, 'Jordan', 'Asia', 269);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jericoacoara', -2.8, -40.5, 'Brazil', 'South America', 270);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jerusalem', 31.7683, 35.2137, 'Israel', 'Asia', 271);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jijiga', 9.35, 42.8, 'Ethiopia', 'Africa', 272);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('joao-pessoa-br', -7.115, -34.86306, 'Brazil', 'South America', 273);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('johannesburg-south-africa', -26.2041, 28.0473, 'South Africa', 'Africa', 274);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('johor-bahru', 1.4655, 103.7578, 'Malaysia', 'Asia', 275);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jos-ng', 9.92849, 8.89212, 'Nigeria', 'Africa', 276);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jyvaskyla', 62.24147, 25.72088, 'Finland', 'Europe', 277);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kabul-af', 34.52813, 69.17233, 'Afghanistan', 'Asia', 278);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kaduna-ng', 10.52641, 7.43879, 'Nigeria', 'Africa', 279);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kaifeng-cn', 34.7986, 114.30742, 'China', 'Asia', 280);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kisumu-ke', -0.1, 34.75, 'Kenya', 'Africa', 281);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kampala', 0.31628, 32.58219, 'Uganda', 'Africa', 282);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kandahar-afghanistan', 31.6289, 65.7372, 'Afghanistan', 'Asia', 283);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kano', 12.00012, 8.51672, 'Nigeria', 'Africa', 284);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kansas-city', 39.099722, -94.578333, 'United States', 'North America', 285);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kaohsiung-tw', 22.61626, 120.31333, 'Taiwan', 'Asia', 286);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('karachi-pakistan', 24.8607, 67.0011, 'Pakistan', 'Asia', 287);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('karagandy', 49.80187, 73.10211, 'Kazakhstan', 'Asia', 288);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('karbala', 32.61603, 44.02488, 'Iraq', 'Asia', 289);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kathmandu-nepal', 27.7172, 85.324, 'Nepal', 'Asia', 290);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kayseri', 38.73222, 35.48528, 'Turkey', 'Asia', 291);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kazan-ru', 55.78874, 49.12214, 'Russia', 'Europe', 292);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kerkici', 37.85075, 65.2433, 'Turkmenistan', 'Asia', 293);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('key-west', 24.555, -81.781944, 'United States', 'North America', 294);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('khabarovsk-ru', 48.46204, 135.0971, 'Russia', 'Europe', 295);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kharkhorin-mongolia', 47.1947, 102.8231, 'Mongolia', 'Asia', 296);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kharkiv-ua', 49.98177, 36.25475, 'Ukraine', 'Europe', 297);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('khartoum', 15.60308, 32.52654, 'Sudan', 'Africa', 298);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('khiva-uzbekistan', 41.3783, 60.3639, 'Uzbekistan', 'Asia', 299);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('khulna-bd', 22.80979, 89.56439, 'Bangladesh', 'Asia', 300);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kigali-rwanda', -1.9441, 30.0619, 'Rwanda', 'Africa', 301);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kingston', 17.99702, -76.79358, 'Jamaica', 'North America', 302);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kinshasa-dr-congo', -4.3197, 15.34242, 'DR Congo', 'Africa', 303);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kirkenes-norway', 69.725, 30.0444, 'Norway', 'Europe', 304);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kirkuk', 35.46806, 44.39222, 'Iraq', 'Asia', 305);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kisangani-cd', 0.51528, 25.19099, 'DR Congo', 'Africa', 306);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kitakyushu', 33.85181, 130.85034, 'Japan', 'Asia', 307);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kitwe-zm', -12.80243, 28.21323, 'Zambia', 'Africa', 308);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kobe-jp', 34.6913, 135.183, 'Japan', 'Asia', 309);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kochi-india', 9.9312, 76.2673, 'India', 'Asia', 310);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('koh-pha-ngan-thailand', 9.734, 100.021, 'Thailand', 'Asia', 311);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('koh-phi-phi-th', 7.7407, 98.7784, 'Thailand', 'Asia', 312);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kolkata-india', 22.5726, 88.3639, 'India', 'Asia', 313);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kolwezi-cd', -10.71484, 25.46674, 'DR Congo', 'Africa', 314);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('konya', 37.87135, 32.48464, 'Turkey', 'Asia', 315);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('krasnodar-ru', 45.04534, 38.98178, 'Russia', 'Europe', 316);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('krasnoyarsk-ru', 56.03742, 92.93136, 'Russia', 'Europe', 317);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kuala-lumpur-malaysia', 3.139, 101.6869, 'Malaysia', 'Asia', 318);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kumasi-ghana', 6.6885, -1.6244, 'Ghana', 'Africa', 319);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kunming-cn', 25.03889, 102.71833, 'China', 'Asia', 320);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kurashiki', 34.58333, 133.76667, 'Japan', 'Asia', 321);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kyiv-ukraine', 50.4501, 30.5234, 'Ukraine', 'Europe', 322);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kyoto-japan', 35.0116, 135.7681, 'Japan', 'Asia', 323);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lagos', 6.45407, 3.39467, 'Nigeria', 'Africa', 324);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lahore', 31.558, 74.35071, 'Pakistan', 'Asia', 325);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lanzhou-cn', 36.05701, 103.83987, 'China', 'Asia', 326);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('las-vegas-usa', 36.1699, -115.1398, 'United States', 'North America', 327);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('leh-india', 34.1526, 77.5771, 'India', 'Asia', 328);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('leipzig-germany', 51.3397, 12.3731, 'Germany', 'Europe', 329);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('libreville-ga', 0.39241, 9.45356, 'Gabon', 'Africa', 330);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lilongwe-mw', -13.96692, 33.78725, 'Malawi', 'Africa', 331);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lisbon-portugal', 38.7223, -9.1393, 'Portugal', 'Europe', 332);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('liverpool-england', 53.4084, -2.9916, 'England', 'Europe', 333);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lo-manthang-nepal', 29.1848, 83.9591, 'Nepal', 'Asia', 334);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lome-tg', 6.12874, 1.22154, 'Togo', 'Africa', 335);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('london-uk', 51.5074, -0.1278, 'England', 'Europe', 336);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('longyearbyen-svalbard', 78.2232, 15.6267, 'Norway', 'Europe', 337);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('los-angeles-usa', 34.0522, -118.2437, 'United States', 'North America', 338);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('louisville-usa', 38.2527, -85.7585, 'United States', 'North America', 339);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('luanda-angola', -8.8147, 13.2302, 'Angola', 'Africa', 340);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('luang-prabang-laos', 19.8867, 102.135, 'Laos', 'Asia', 341);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lubumbashi-cd', -11.66089, 27.47938, 'DR Congo', 'Africa', 342);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lucerne-ch', 47.0502, 8.3093, 'Switzerland', 'Europe', 343);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lucknow-in', 26.83928, 80.92313, 'India', 'Asia', 344);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('luoyang-cn', 34.67345, 112.43684, 'China', 'Asia', 345);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lusaka', -15.40669, 28.28713, 'Zambia', 'Africa', 346);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('luxembourg-city', 49.611389, 6.13, 'Luxembourg', 'Europe', 347);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('luxor-egypt', 25.6872, 32.6396, 'Egypt', 'Africa', 348);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lviv-ua', 49.83826, 24.02324, 'Ukraine', 'Europe', 349);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('macapa-br', 0.03889, -51.06639, 'Brazil', 'South America', 350);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('macau', 22.19, 113.54, 'China', 'Asia', 351);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('maceio-br', -9.66583, -35.73528, 'Brazil', 'South America', 352);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('madrid-spain', 40.4168, -3.7038, 'Spain', 'Europe', 353);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('madurai-in', 9.919, 78.11953, 'India', 'Asia', 354);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ile-ife-ng', 7.46667, 4.56667, 'Nigeria', 'Africa', 355);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('majuro-marshall-islands', 7.0914, 171.38092, 'Marshall Islands', 'Oceania', 356);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('makassar-id', -5.14861, 119.43194, 'Indonesia', 'Asia', 357);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('makhachkala-ru', 42.97782, 47.50027, 'Russia', 'Europe', 358);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('male-maldives', 4.1755, 73.5093, 'Maldives', 'Asia', 359);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('managua-ni', 12.13282, -86.2504, 'Nicaragua', 'North America', 360);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('manaus-br', -3.11889, -60.02167, 'Brazil', 'South America', 361);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('manchester-england', 53.4808, -2.2426, 'England', 'Europe', 362);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mandalay', 21.97473, 96.08359, 'Myanmar', 'Asia', 363);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('manila-philippines', 14.5995, 120.9842, 'Philippines', 'Asia', 364);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('maputo-mozambique', -25.9655, 32.5832, 'Mozambique', 'Africa', 365);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mar-del-plata-ar', -38.00042, -57.5562, 'Argentina', 'South America', 366);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('maracaibo-ve', 10.64232, -71.61089, 'Venezuela', 'South America', 367);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('marrakech-morocco', 31.6295, -7.9811, 'Morocco', 'Africa', 368);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('marseille-fr', 43.29695, 5.38107, 'France', 'Europe', 369);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mashhad-ir', 36.29807, 59.60567, 'Iran', 'Asia', 370);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('matera-sassi', 40.6672, 16.604, 'Italy', 'Europe', 371);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mazatlan-mx', 23.22163, -106.41885, 'Mexico', 'North America', 372);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mbuji-mayi-cd', -6.13603, 23.58979, 'DR Congo', 'Africa', 373);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('abha-sa', 18.21667, 42.5, 'Saudi Arabia', 'Asia', 374);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('medan-id', 3.58333, 98.66667, 'Indonesia', 'Asia', 375);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('alula-sa', 26.60889, 37.92361, 'Saudi Arabia', 'Asia', 376);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('melbourne-australia', -37.8136, 144.9631, 'Australia', 'Oceania', 377);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('memphis-us', 35.1495, -90.049, 'United States', 'North America', 378);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mendoza-argentina', -32.8895, -68.8458, 'Argentina', 'South America', 379);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('merida-mx', 20.967, -89.62318, 'Mexico', 'North America', 380);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('la-paz-mx', 24.14861, -110.30667, 'Mexico', 'North America', 381);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mexico-city-mexico', 19.4326, -99.1332, 'Mexico', 'North America', 382);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('miami-usa', 25.7617, -80.1918, 'United States', 'North America', 383);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('milan-it', 45.4642, 9.19, 'Italy', 'Europe', 384);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('milwaukee', 43.05, -87.95, 'United States', 'North America', 385);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('minneapolis-usa', 44.9778, -93.265, 'United States', 'North America', 386);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('minsk-by', 53.90019, 27.56653, 'Belarus', 'Europe', 387);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mississauga-ca', 43.5789, -79.6583, 'Canada', 'North America', 388);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mogadishu-so', 2.03711, 45.34375, 'Somalia', 'Africa', 389);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mombasa-kenya', -4.0435, 39.6682, 'Kenya', 'Africa', 390);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('monaco', 43.731111, 7.42, 'Monaco', 'Europe', 391);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('monrovia-lr', 6.30054, -10.7969, 'Liberia', 'Africa', 392);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('monterrey-mexico', 25.6866, -100.3161, 'Mexico', 'North America', 393);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('montreal-canada', 45.5019, -73.5674, 'Canada', 'North America', 394);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('morelia-mx', 19.70078, -101.18443, 'Mexico', 'North America', 395);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('moscow-russia', 55.7558, 37.6173, 'Russia', 'Europe', 396);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mosul-iq', 36.335, 43.11889, 'Iraq', 'Asia', 397);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('multan-pk', 30.19679, 71.47824, 'Pakistan', 'Asia', 398);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mumbai-india', 19.076, 72.8777, 'India', 'Asia', 399);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('munich-germany', 48.1351, 11.582, 'Germany', 'Europe', 400);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('muscat', 23.61313, 58.59302, 'Oman', 'Asia', 401);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mwanza-tz', -2.51667, 32.9, 'Tanzania', 'Africa', 402);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mykonos-gr', 37.4467, 25.3289, 'Greece', 'Europe', 403);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('n-djamena-td', 12.10672, 15.0444, 'Chad', 'Africa', 404);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nagasaki-atomic-bombing', 32.7738, 129.8634, 'Japan', 'Asia', 405);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nagoya-jp', 35.18147, 136.90641, 'Japan', 'Asia', 406);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nagpur-in', 21.14631, 79.08491, 'India', 'Asia', 407);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nahuel-huapi-civic-centre', -41.1335, -71.3103, 'Argentina', 'South America', 408);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nairobi-kenya', -1.2921, 36.8219, 'Kenya', 'Africa', 409);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('najaf', 32.02594, 44.34625, 'Iraq', 'Asia', 410);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nampula-mz', -15.11646, 39.2666, 'Mozambique', 'Africa', 411);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nanjing-cn', 32.06167, 118.77778, 'China', 'Asia', 412);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nanning-cn', 22.81667, 108.31667, 'China', 'Asia', 413);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nanortalik-greenland', 60.1417, -45.2433, 'Denmark', 'Europe', 414);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('naples-italy', 40.8518, 14.2681, 'Italy', 'Europe', 415);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nara', 34.684444, 135.805, 'Japan', 'Asia', 416);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nashik-in', 19.99727, 73.79096, 'India', 'Asia', 417);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nashville-usa', 36.1627, -86.7816, 'United States', 'North America', 418);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('natal-br', -5.795, -35.20944, 'Brazil', 'South America', 419);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nay-pyi-taw', 19.745, 96.12972, 'Myanmar', 'Asia', 420);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nazareth', 32.701944, 35.303333, 'Israel', 'Asia', 421);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('new-orleans-usa', 29.9511, -90.0715, 'United States', 'North America', 422);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('new-york-usa', 40.7128, -74.006, 'United States', 'North America', 423);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ngerulmud-palau', 7.5006, 134.6242, 'Palau', 'Oceania', 424);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('niagara-on-the-lake', 43.255278, -79.071667, 'Canada', 'North America', 425);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('niamey-ne', 13.51366, 2.1098, 'Niger', 'Africa', 426);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nice', 43.7034, 7.2663, 'France', 'Europe', 427);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('niigata', 37.92259, 139.04125, 'Japan', 'Asia', 428);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nimes', 43.83665, 4.35788, 'France', 'Europe', 429);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ningbo-cn', 29.87819, 121.54945, 'China', 'Asia', 430);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nadi-fj', -17.8, 177.41667, 'Fiji', 'Oceania', 431);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nizhniy-novgorod-ru', 56.32867, 44.00205, 'Russia', 'Europe', 432);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nouakchott-mr', 18.08581, -15.9785, 'Mauritania', 'Africa', 433);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('noumea-new-caledonia', -22.2758, 166.458, 'France', 'Oceania', 434);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('novosibirsk-ru', 55.02259, 82.93175, 'Russia', 'Europe', 435);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('novovolynsk', 50.72949, 24.15976, 'Ukraine', 'Europe', 436);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nuku-alofa-tonga', -21.1394, -175.2032, 'Tonga', 'Oceania', 437);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nuremberg', 49.453889, 11.0775, 'Germany', 'Europe', 438);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nuuk-greenland', 64.1835, -51.7216, 'Denmark', 'North America', 439);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oaxaca-mexico', 17.0732, -96.7266, 'Mexico', 'North America', 440);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('odesa-ua', 46.48572, 30.74383, 'Ukraine', 'Europe', 441);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('odz-pl', 51.77058, 19.47395, 'Poland', 'Europe', 442);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oita', 33.23333, 131.6, 'Japan', 'Asia', 443);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('olympia-greece', 37.638333, 21.63, 'Greece', 'Europe', 444);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('omaha', 41.25626, -95.94043, 'United States', 'North America', 445);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('omdurman-sd', 15.64453, 32.47773, 'Sudan', 'Africa', 446);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('omsk-ru', 54.99244, 73.36859, 'Russia', 'Europe', 447);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oran-dz', 35.69906, -0.63588, 'Algeria', 'Africa', 448);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('orlando', 28.542222, -81.379167, 'United States', 'North America', 449);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('osaka-japan', 34.6937, 135.5023, 'Japan', 'Asia', 450);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oslo-norway', 59.9139, 10.7522, 'Norway', 'Europe', 451);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ostersund', 63.1792, 14.63566, 'Sweden', 'Europe', 452);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ottawa-canada', 45.4215, -75.6972, 'Canada', 'North America', 453);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ouagadougou-burkina-faso', 12.3714, -1.5197, 'Burkina Faso', 'Africa', 454);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oxford-england', 51.752, -1.2577, 'England', 'Europe', 455);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oymyakon-russia', 63.4608, 142.7858, 'Russia', 'Europe', 456);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('padang', -0.94924, 100.35427, 'Indonesia', 'Asia', 457);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('palembang-id', -2.98608, 104.76065, 'Indonesia', 'Asia', 458);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('palikir-micronesia', 6.9248, 158.1611, 'Micronesia', 'Oceania', 459);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('palma-de-mallorca', 39.566667, 2.65, 'Spain', 'Europe', 460);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('panama-city', 8.9711, -79.5347, 'Panama', 'North America', 461);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('papeete-tahiti', -17.5516, -149.5585, 'France', 'Oceania', 462);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('paraty-historic-center', -23.2196, -44.7132, 'Brazil', 'South America', 463);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('paris-france', 48.8566, 2.3522, 'France', 'Europe', 464);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('patna-in', 25.59408, 85.13563, 'India', 'Asia', 465);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pereira-co', 4.81428, -75.69488, 'Colombia', 'South America', 466);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('perth-australia', -31.9505, 115.8605, 'Australia', 'Oceania', 467);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('peshawar-pk', 34.008, 71.57849, 'Pakistan', 'Asia', 468);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('petra-nabatean-treasury', 30.3285, 35.4419, 'Jordan', 'Asia', 469);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pevek-russia', 69.7026, 170.298, 'Russia', 'Europe', 470);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('philadelphia-usa', 39.9526, -75.1652, 'United States', 'North America', 471);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('phnom-penh-cambodia', 11.5564, 104.9282, 'Cambodia', 'Asia', 472);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('phoenix-usa', 33.4484, -112.074, 'United States', 'North America', 473);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('phuket-thailand', 7.8804, 98.3923, 'Thailand', 'Asia', 474);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pittsburgh', 40.439722, -79.976389, 'United States', 'North America', 475);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('piura-pe', -5.18192, -80.65715, 'Peru', 'South America', 476);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('playa-del-carmen', 20.6274, -87.07987, 'Mexico', 'North America', 477);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pointe-noire-cg', -4.77609, 11.86352, 'Congo', 'Africa', 478);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('polonnaruwa-sri-lanka', 7.93965, 81.00274, 'Sri Lanka', 'Asia', 479);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-arthur', -43.1466, 147.8512, 'Australia', 'Oceania', 480);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-au-prince-ht', 18.54349, -72.33881, 'Haiti', 'North America', 481);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-harcourt-ng', 4.77742, 7.0134, 'Nigeria', 'Africa', 482);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-moresby-papua-new-guinea', -9.4438, 147.1803, 'Papua New Guinea', 'Oceania', 483);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-said-eg', 31.26531, 32.3019, 'Egypt', 'Africa', 484);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-sudan', 19.61745, 37.21644, 'Sudan', 'Africa', 485);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-vila-vanuatu', -17.7333, 168.3167, 'Vanuatu', 'Oceania', 486);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('portland-oregon-usa', 45.5155, -122.6793, 'United States', 'North America', 487);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('porto-alegre-br', -30.03283, -51.23019, 'Brazil', 'South America', 488);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('porto-portugal', 41.1579, -8.6291, 'Portugal', 'Europe', 489);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('porto-velho-br', -8.76194, -63.90389, 'Brazil', 'South America', 490);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('prague-czech-republic', 50.0755, 14.4378, 'Czech Republic', 'Europe', 491);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('prayagraj', 25.44478, 81.84322, 'India', 'Asia', 492);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pretoria', -25.74486, 28.18783, 'South Africa', 'Africa', 493);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pristina-xk', 42.67272, 21.16688, 'Kosovo', 'Europe', 494);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pucioasa', 45.07807, 25.43232, 'Romania', 'Europe', 495);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('puebla-mexico', 19.0414, -98.2063, 'Mexico', 'North America', 496);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('quetzaltenango-gt', 14.83333, -91.51667, 'Guatemala', 'North America', 497);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pune-in', 18.51957, 73.85535, 'India', 'Asia', 498);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pyongyang-north-korea', 39.0392, 125.7625, 'North Korea', 'Asia', 499);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('qaqortoq-greenland', 60.7214, -46.0486, 'Denmark', 'Europe', 500);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('qingdao-cn', 36.06488, 120.38042, 'China', 'Asia', 501);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('qom', 34.6401, 50.8764, 'Iran', 'Asia', 502);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('quebec-city-canada', 46.8139, -71.208, 'Canada', 'North America', 503);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('quetta-pk', 30.18414, 67.00141, 'Pakistan', 'Asia', 504);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('quezon-city-ph', 14.6488, 121.0509, 'Philippines', 'Asia', 505);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('quito', -0.22985, -78.52495, 'Ecuador', 'South America', 506);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rabat-morocco', 34.0209, -6.8416, 'Morocco', 'Africa', 507);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rajshahi', 24.374, 88.60114, 'Bangladesh', 'Asia', 508);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('raleigh-usa', 35.7796, -78.6382, 'United States', 'North America', 509);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('recife-marco-zero', -8.0631, -34.8711, 'Brazil', 'South America', 510);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('reykjavik-iceland', 64.1466, -21.9426, 'Iceland', 'Europe', 511);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rimini', 44.05755, 12.56528, 'Italy', 'Europe', 512);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rio-de-janeiro-brazil', -22.9068, -43.1729, 'Brazil', 'South America', 513);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('riyadh', 24.63862, 46.71551, 'Saudi Arabia', 'Asia', 514);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rome-italy', 41.9028, 12.4964, 'Italy', 'Europe', 515);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rosario-ar', -32.94682, -60.63932, 'Argentina', 'South America', 516);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rostov-on-don-ru', 47.21997, 39.70769, 'Russia', 'Europe', 517);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('roswell-ufo-incident', 33.3943, -104.523, 'United States', 'North America', 518);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('rothenburg-ob-der-tauber-germany', 49.3772, 10.1789, 'Germany', 'Europe', 519);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('biskra-dz', 34.85, 5.73333, 'Algeria', 'Africa', 520);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sacramento-usa', 38.5816, -121.4944, 'United States', 'North America', 521);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('saguenay', 48.41675, -71.06573, 'Canada', 'North America', 522);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('saint-petersburg-russia', 59.9311, 30.3609, 'Russia', 'Europe', 523);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('salt-lake-city', 40.760833, -111.891111, 'United States', 'North America', 524);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('salta-ar', -24.80645, -65.41999, 'Argentina', 'South America', 525);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('salvador-br', -12.97563, -38.49096, 'Brazil', 'South America', 526);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('salzburg-austria', 47.8095, 13.055, 'Austria', 'Europe', 527);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('samara-ru', 53.20767, 50.13553, 'Russia', 'Europe', 528);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('samarinda', -0.49167, 117.14583, 'Indonesia', 'Asia', 529);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('samarkand-uz', 39.6542, 66.9597, 'Uzbekistan', 'Asia', 530);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-antonio-usa', 29.4241, -98.4936, 'United States', 'North America', 531);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-diego-usa', 32.7157, -117.1611, 'United States', 'North America', 532);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-francisco-usa', 37.7749, -122.4194, 'United States', 'North America', 533);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-jose', 37.33939, -121.89496, 'United States', 'North America', 534);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-juan', 18.46528, -66.11667, 'United States', 'North America', 535);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-luis-potosi-mx', 22.15234, -100.97135, 'Mexico', 'North America', 536);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-miguel-de-tucuman-ar', -26.81601, -65.21051, 'Argentina', 'South America', 537);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-pedro-sula-hn', 15.50585, -88.02588, 'Honduras', 'North America', 538);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-salvador-sv', 13.68935, -89.18718, 'El Salvador', 'North America', 539);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sanaa-ye', 15.35452, 44.20646, 'Yemen', 'Asia', 540);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santa-cruz-de-la-sierra-bo', -17.78629, -63.18117, 'Bolivia', 'South America', 541);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santa-fe', 35.667222, -105.964444, 'United States', 'North America', 542);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santa-marta-co', 11.23855, -74.19427, 'Colombia', 'South America', 543);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santiago', -33.45694, -70.64827, 'Chile', 'South America', 544);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santiago-de-queretaro-mx', 20.58806, -100.38806, 'Mexico', 'North America', 545);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santo-domingo-de-los-colorados-ec', -0.25368, -79.17628, 'Ecuador', 'South America', 546);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santo-domingo-do', 18.47186, -69.89232, 'Dominican Republic', 'North America', 547);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santorini-gr', 36.4166, 25.4318, 'Greece', 'Europe', 548);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sao-luis-br', -2.52972, -44.30278, 'Brazil', 'South America', 549);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sao-paulo-br', -23.5475, -46.63611, 'Brazil', 'South America', 550);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sapporo-japan', 43.0618, 141.3545, 'Japan', 'Asia', 551);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sarajevo-ba', 43.84864, 18.35644, 'Bosnia and Herzegovina', 'Europe', 552);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('savannah', 32.081111, -81.091111, 'United States', 'North America', 553);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('seattle-usa', 47.6062, -122.3321, 'United States', 'North America', 554);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('semarang-id', -6.99306, 110.42083, 'Indonesia', 'Asia', 555);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sendai', 38.26667, 140.86667, 'Japan', 'Asia', 556);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('seoul-south-korea', 37.5665, 126.978, 'South Korea', 'Asia', 557);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('seville-spain', 37.3891, -5.9845, 'Spain', 'Europe', 558);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('shanghai-china', 31.2304, 121.4737, 'China', 'Asia', 559);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sharjah-ae', 25.3342, 55.41221, 'United Arab Emirates', 'Asia', 560);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sheffield-gb', 53.38297, -1.4659, 'England', 'Europe', 561);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('shenyang-cn', 41.79222, 123.43278, 'China', 'Asia', 562);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('shenzhen-cn', 22.54554, 114.0683, 'China', 'Asia', 563);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('shigatse-tibet', 29.2669, 88.8808, 'China', 'Asia', 564);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('shiraz', 29.61031, 52.53113, 'Iran', 'Asia', 565);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('shymkent', 42.30988, 69.60042, 'Kazakhstan', 'Asia', 566);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('siem-reap-cambodia', 13.3671, 103.8448, 'Cambodia', 'Asia', 567);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('silkeborg', 56.1697, 9.54508, 'Denmark', 'Europe', 568);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('singapore', 1.28967, 103.85007, 'Singapore', 'Asia', 569);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('skellig-michael-ireland', 51.7719, -10.5406, 'Ireland', 'Europe', 570);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sofia-bulgaria', 42.6977, 23.3219, 'Bulgaria', 'Europe', 571);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('srinagar', 34.08565, 74.80555, 'India', 'Asia', 572);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('st-johns-canada', 47.5615, -52.7126, 'Canada', 'North America', 573);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('st-louis-usa', 38.627, -90.1994, 'United States', 'North America', 574);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('stari-most', 43.3373, 17.815, 'Bosnia and Herzegovina', 'Europe', 575);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('stockholm-sweden', 59.3293, 18.0686, 'Sweden', 'Europe', 576);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('strasbourg-france', 48.5734, 7.7521, 'France', 'Europe', 577);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('stuttgart-de', 48.78232, 9.17702, 'Germany', 'Europe', 578);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('suez-eg', 29.97371, 32.52627, 'Egypt', 'Africa', 579);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sulaymaniyah', 35.56496, 45.4329, 'Iraq', 'Asia', 580);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('surabaya-id', -7.24917, 112.75083, 'Indonesia', 'Asia', 581);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('surat-in', 21.19594, 72.83023, 'India', 'Asia', 582);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('surrey-ca', 49.1873, -122.84957, 'Canada', 'North America', 583);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('suva-fiji', -18.1416, 178.4419, 'Fiji', 'Oceania', 584);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('suwon', 37.29111, 127.00889, 'South Korea', 'Asia', 585);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('suzhou-cn', 31.30408, 120.59538, 'China', 'Asia', 586);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sydney-australia', -33.8688, 151.2093, 'Australia', 'Oceania', 587);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tabriz-ir', 38.08, 46.2919, 'Iran', 'Asia', 588);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('taichung-tw', 24.1469, 120.6839, 'Taiwan', 'Asia', 589);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tainan-tw', 22.99083, 120.21333, 'Taiwan', 'Asia', 590);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('taipei', 25.05306, 121.52639, 'Taiwan', 'Asia', 591);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('taiz', 13.57952, 44.02091, 'Yemen', 'Asia', 592);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('takeo', 10.99081, 104.78498, 'Cambodia', 'Asia', 593);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tallinn-estonia', 59.437, 24.7536, 'Estonia', 'Europe', 594);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tambacounda', 13.77073, -13.66734, 'Senegal', 'Africa', 595);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tampa-usa', 27.9506, -82.4572, 'United States', 'North America', 596);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tangier-ma', 35.76727, -5.79975, 'Morocco', 'Africa', 597);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tarawa-kiribati', 1.3278, 172.9764, 'Kiribati', 'Oceania', 598);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tarkwa', 5.30383, -1.98956, 'Ghana', 'Africa', 599);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tashkent', 41.31172, 69.27922, 'Uzbekistan', 'Asia', 600);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tbilisi', 41.69143, 44.83412, 'Georgia', 'Asia', 601);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tegucigalpa-hn', 14.0818, -87.20681, 'Honduras', 'North America', 602);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tehran', 35.69439, 51.42151, 'Iran', 'Asia', 603);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tel-aviv', 32.08, 34.78, 'Israel', 'Asia', 604);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('the-hague-nl', 52.0705, 4.3007, 'Netherlands', 'Europe', 605);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('thessaloniki-gr', 40.6401, 22.9444, 'Greece', 'Europe', 606);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('thimphu-bhutan', 27.4712, 89.6339, 'Bhutan', 'Asia', 607);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tianjin-cn', 39.14222, 117.17667, 'China', 'Asia', 608);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tijuana', 32.5027, -117.00371, 'Mexico', 'North America', 609);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tiksi-russia', 71.6367, 128.8639, 'Russia', 'Europe', 610);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('timbuktu-mali', 16.7666, -3.0026, 'Mali', 'Africa', 611);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tokyo-japan', 35.67686, 139.76389, 'Japan', 'Asia', 612);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('toledo-d34-62', 39.8628, -4.0273, 'Spain', 'Europe', 613);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tomsk-ru', 56.50049, 84.98216, 'Russia', 'Europe', 614);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('toronto', 43.66188, -79.3853, 'Canada', 'North America', 615);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('touba-sn', 14.86229, -15.87532, 'Senegal', 'Africa', 616);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('toulouse-france', 43.6047, 1.4442, 'France', 'Europe', 617);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tripoli-libya', 32.8872, 13.1913, 'Libya', 'Africa', 618);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tromso-norway', 69.6492, 18.9553, 'Norway', 'Europe', 619);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('troy', 39.9575, 26.238889, 'Turkey', 'Asia', 620);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('trujillo-pe', -8.11599, -79.02998, 'Peru', 'South America', 621);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tucson-usa', 32.2226, -110.9747, 'United States', 'North America', 622);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tunis-tunisia', 36.8065, 10.1815, 'Tunisia', 'Africa', 623);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('turin-italy', 45.0703, 7.6869, 'Italy', 'Europe', 624);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('udaipur-india', 24.5854, 73.7125, 'India', 'Asia', 625);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ulaanbaatar-mongolia', 47.8864, 106.9057, 'Mongolia', 'Asia', 626);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ulsan', 35.53722, 129.31667, 'South Korea', 'Asia', 627);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('urumqi-cn', 43.80096, 87.60046, 'China', 'Asia', 628);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ushuaia-end-of-world-sign', -54.8071, -68.303, 'Argentina', 'South America', 629);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vaduz-liechtenstein', 47.141, 9.5209, 'Liechtenstein', 'Europe', 630);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('valencia-es', 39.47391, -0.37966, 'Spain', 'Europe', 631);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('valletta', 35.898333, 14.5125, 'Malta', 'Europe', 632);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('valparaiso-ascensor-artilleria', -33.0335, -71.6306, 'Chile', 'South America', 633);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('van-turkey', 38.5017, 43.4089, 'Turkey', 'Asia', 634);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vancouver-canada', 49.2827, -123.1207, 'Canada', 'North America', 635);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('varanasi', 25.31668, 83.01041, 'India', 'Asia', 636);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('venice-italy', 45.4408, 12.3155, 'Italy', 'Europe', 637);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('veracruz-mx', 19.18095, -96.1429, 'Mexico', 'North America', 638);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('victoria', 48.428333, -123.364722, 'Canada', 'North America', 639);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vienna-austria', 48.2082, 16.3738, 'Austria', 'Europe', 640);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vientiane', 17.96667, 102.6, 'Laos', 'Asia', 641);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vinh', 18.67337, 105.69232, 'Vietnam', 'Asia', 642);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('visakhapatnam', 17.69372, 83.29218, 'India', 'Asia', 643);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vladivostok-russia', 43.1332, 131.9113, 'Russia', 'Europe', 644);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('volgograd-ru', 48.71378, 44.4976, 'Russia', 'Europe', 645);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('warsaw-poland', 52.2297, 21.0122, 'Poland', 'Europe', 646);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('washington-dc-usa', 38.9072, -77.0369, 'United States', 'North America', 647);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('wellington-new-zealand', -41.2865, 174.7762, 'New Zealand', 'Oceania', 648);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('whitehorse-yukon', 60.7212, -135.0568, 'Canada', 'North America', 649);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('windhoek-namibia', -22.5609, 17.0658, 'Namibia', 'Africa', 650);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('winnipeg-ca', 49.8844, -97.14704, 'Canada', 'North America', 651);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('wrocaw-pl', 51.10286, 17.03006, 'Poland', 'Europe', 652);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('wuhan-cn', 30.58333, 114.26667, 'China', 'Asia', 653);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('xiamen-cn', 24.47979, 118.08187, 'China', 'Asia', 654);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('xian-china', 34.26106, 108.94228, 'China', 'Asia', 655);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('xining-cn', 36.62554, 101.75739, 'China', 'Asia', 656);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yangon', 16.80528, 96.15611, 'Myanmar', 'Asia', 657);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yinchuan-cn', 38.485, 106.225, 'China', 'Asia', 658);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yaounde-cm', 3.86667, 11.51667, 'Cameroon', 'Africa', 659);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yaren-nauru', -0.5477, 166.9209, 'Nauru', 'Oceania', 660);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yaroslavl-ru', 57.62987, 39.87368, 'Russia', 'Europe', 661);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yazd', 31.89722, 54.3675, 'Iran', 'Asia', 662);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yekaterinburg-ru', 56.85733, 60.61529, 'Russia', 'Europe', 663);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yellowknife-nwt', 62.454, -114.3718, 'Canada', 'North America', 664);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yerevan', 40.17765, 44.5126, 'Armenia', 'Asia', 665);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yichang-cn', 30.71444, 111.28472, 'China', 'Asia', 666);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yokohama-jp', 35.43333, 139.65, 'Japan', 'Asia', 667);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zagreb-croatia', 45.815, 15.9819, 'Croatia', 'Europe', 668);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('subotica-rs', 46.10021, 19.66533, 'Serbia', 'Europe', 669);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zamboanga', 6.91028, 122.07389, 'Philippines', 'Asia', 670);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zanzibar-city-tanzania', -6.1659, 39.2026, 'Tanzania', 'Africa', 671);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zaragoza-es', 41.65606, -0.87734, 'Spain', 'Europe', 672);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bamyan-af', 34.81667, 67.81667, 'Afghanistan', 'Asia', 673);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zermatt-ch', 46.0207, 7.7491, 'Switzerland', 'Europe', 674);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zhengzhou-cn', 34.75778, 113.64861, 'China', 'Asia', 675);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('zurich-switzerland', 47.3769, 8.5417, 'Switzerland', 'Europe', 676);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bogota-colombia', 4.60971, -74.08175, 'Colombia', 'South America', 677);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tirana-albania', 41.3275, 19.8187, 'Albania', 'Europe', 678);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('andorra-la-vella-andorra', 42.5063, 1.5218, 'Andorra', 'Europe', 679);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('st-johns-antigua-and-barbuda', 17.1274, -61.8468, 'Antigua and Barbuda', 'North America', 680);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nassau-bahamas', 25.0443, -77.3504, 'Bahamas', 'North America', 681);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('manama-bahrain', 26.2235, 50.5876, 'Bahrain', 'Asia', 682);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bridgetown-barbados', 13.0975, -59.6167, 'Barbados', 'North America', 683);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bandar-seri-begawan-brunei', 4.9031, 114.9398, 'Brunei', 'Asia', 684);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('praia-cabo-verde', 14.9331, -23.5133, 'Cabo Verde', 'Africa', 685);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('moroni-comoros', -11.7172, 43.2473, 'Comoros', 'Africa', 686);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-jose-costa-rica', 9.9281, -84.0907, 'Costa Rica', 'North America', 687);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nicosia-cyprus', 35.1856, 33.3823, 'Cyprus', 'Europe', 688);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('djibouti-city-djibouti', 11.5721, 43.1456, 'Djibouti', 'Africa', 689);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('roseau-dominica', 15.3017, -61.3881, 'Dominica', 'North America', 690);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('malabo-equatorial-guinea', 3.75, 8.7833, 'Equatorial Guinea', 'Africa', 691);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mbabane-eswatini', -26.3054, 31.1367, 'Eswatini', 'Africa', 692);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('banjul-gambia', 13.4549, -16.579, 'Gambia', 'Africa', 693);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('st-georges-grenada', 12.0561, -61.7488, 'Grenada', 'North America', 694);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bissau-guinea-bissau', 11.8817, -15.617, 'Guinea-Bissau', 'Africa', 695);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('georgetown-guyana', 6.8013, -58.1551, 'Guyana', 'South America', 696);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kuwait-city-kuwait', 29.3759, 47.9774, 'Kuwait', 'Asia', 697);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('maseru-lesotho', -29.3151, 27.4869, 'Lesotho', 'Africa', 698);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-louis-mauritius', -20.1609, 57.5012, 'Mauritius', 'Africa', 699);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('podgorica-montenegro', 42.4304, 19.2594, 'Montenegro', 'Europe', 700);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('skopje-north-macedonia', 42, 21.4333, 'North Macedonia', 'Europe', 701);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('basseterre-st-kitts-and-nevis', 17.3026, -62.7177, 'Saint Kitts and Nevis', 'North America', 702);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kingstown-st-vincent-and-grenadines', 13.16, -61.2248, 'Saint Vincent and the Grenadines', 'North America', 703);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('san-marino-san-marino', 43.9424, 12.4578, 'San Marino', 'Europe', 704);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sao-tome-sao-tome-and-principe', 0.3365, 6.7273, 'Sao Tome and Principe', 'Africa', 705);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('victoria-seychelles', -4.6191, 55.4513, 'Seychelles', 'Africa', 706);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('juba-south-sudan', 4.8594, 31.5713, 'South Sudan', 'Africa', 707);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('paramaribo-suriname', 5.852, -55.2038, 'Suriname', 'South America', 708);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('port-of-spain-trinidad-and-tobago', 10.6549, -61.5019, 'Trinidad and Tobago', 'North America', 709);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('montevideo-uruguay', -34.9011, -56.1645, 'Uruguay', 'South America', 710);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('belmopan-bz', 17.25, -88.77, 'Belize', 'North America', 711);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('castries-lc', 14.01, -60.99, 'Saint Lucia', 'North America', 712);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('funchal-pt', 32.65, -16.91, 'Portugal', 'Europe', 713);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gdansk-pl', 54.35, 18.65, 'Poland', 'Europe', 714);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('krakow-pl', 50.06, 19.94, 'Poland', 'Europe', 715);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('stavanger-no', 58.97, 5.73, 'Norway', 'Europe', 716);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ljubljana-si', 46.05, 14.51, 'Slovenia', 'Europe', 717);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('sucre-bolivia', -19.0475, -65.26, 'Bolivia', 'South America', 718);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gitega-burundi', -3.4283, 29.925, 'Burundi', 'Africa', 719);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yamoussoukro-ivory-coast', 6.8161, -5.2742, 'Côte d''Ivoire', 'Africa', 720);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ramallah-palestine', 31.9038, 35.2034, 'Palestine', 'Asia', 721);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lima-peru', -12.0464, -77.0428, 'Peru', 'South America', 722);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bern-switzerland', 46.9481, 7.4475, 'Switzerland', 'Europe', 723);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ashgabat-turkmenistan', 37.9375, 58.38, 'Turkmenistan', 'Asia', 724);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vatican-city', 41.9025, 12.4525, 'Vatican City', 'Europe', 725);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('barcelona-spain', 41.3888, 2.159, 'Spain', 'Europe', 726);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hyderabad-india', 17.3841, 78.4564, 'India', 'Asia', 727);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('medellin-co', 6.245, -75.5715, 'Colombia', 'South America', 728);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cusco-peru', -13.5319, -71.967, 'Peru', 'South America', 729);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('la-paz-bolivia', -16.5, -68.15, 'Bolivia', 'South America', 730);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('fortaleza-br', -3.7172, -38.5431, 'Brazil', 'South America', 731);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('yogyakarta-id', -7.8014, 110.3647, 'Indonesia', 'Asia', 732);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gyeongju-kr', 35.8428, 129.2117, 'South Korea', 'Asia', 733);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('boise-usa', 43.6135, -116.2035, 'United States', 'North America', 734);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('oklahoma-city-usa', 35.4676, -97.5164, 'United States', 'North America', 735);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('des-moines-usa', 41.6005, -93.6091, 'United States', 'North America', 736);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('little-rock-usa', 34.7465, -92.2896, 'United States', 'North America', 737);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('buffalo-usa', 42.8865, -78.8784, 'United States', 'North America', 738);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('juneau-usa', 58.3019, -134.4197, 'United States', 'North America', 739);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('spokane-usa', 47.6597, -117.4291, 'United States', 'North America', 740);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('providence-usa', 41.824, -71.4128, 'United States', 'North America', 741);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('lyon-france', 45.764, 4.8357, 'France', 'Europe', 742);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('antofagasta-cl', -23.65094, -70.39752, 'Chile', 'South America', 743);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('arequipa-pe', -16.39899, -71.53747, 'Peru', 'South America', 744);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bari-it', 41.12066, 16.86982, 'Italy', 'Europe', 745);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bologna-it', 44.49381, 11.33875, 'Italy', 'Europe', 746);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('catania-it', 37.49223, 15.07041, 'Italy', 'Europe', 747);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('palermo-it', 38.1166, 13.3636, 'Italy', 'Europe', 748);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('trieste-it', 45.64953, 13.77678, 'Italy', 'Europe', 749);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('coventry-england', 52.40656, -1.51217, 'England', 'Europe', 750);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('leicester-england', 52.6386, -1.13169, 'England', 'Europe', 751);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('entebbe-ug', 0.05621, 32.47949, 'Uganda', 'Africa', 752);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guanajuato-mx', 21.01858, -101.2591, 'Mexico', 'North America', 753);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('hanover-de', 52.37052, 9.73322, 'Germany', 'Europe', 754);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('cologne-de', 50.93333, 6.95, 'Germany', 'Europe', 755);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('ipoh-my', 4.5841, 101.0829, 'Malaysia', 'Asia', 756);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('limassol-cy', 34.68406, 33.03794, 'Cyprus', 'Europe', 757);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nantes-fr', 47.21725, -1.55336, 'France', 'Europe', 758);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santos-br', -23.96083, -46.33361, 'Brazil', 'South America', 759);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tartu-ee', 58.38062, 26.72509, 'Estonia', 'Europe', 760);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('timisoara-ro', 45.75372, 21.22571, 'Romania', 'Europe', 761);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('trabzon-tr', 41.005, 39.72694, 'Turkey', 'Asia', 762);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('uppsala-se', 59.85882, 17.63889, 'Sweden', 'Europe', 763);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('aarhus-dk', 56.15674, 10.21076, 'Denmark', 'Europe', 764);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('guwahati-in', 26.1844, 91.7458, 'India', 'Asia', 765);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('mysuru-in', 12.29791, 76.63925, 'India', 'Asia', 766);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('durres-al', 41.32355, 19.45469, 'Albania', 'Europe', 767);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('vilnius-lt', 54.68916, 25.2798, 'Lithuania', 'Europe', 768);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('riga-lv', 56.946, 24.10589, 'Latvia', 'Europe', 769);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('verona-it', 45.43854, 10.9938, 'Italy', 'Europe', 770);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('pisa-it', 43.70853, 10.4036, 'Italy', 'Europe', 771);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('padua-it', 45.40797, 11.88586, 'Italy', 'Europe', 772);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('messina-it', 38.19394, 15.55256, 'Italy', 'Europe', 773);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('brighton-england', 50.82838, -0.13947, 'England', 'Europe', 774);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('nottingham-england', 52.9536, -1.15047, 'England', 'Europe', 775);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('southampton-england', 50.90395, -1.40428, 'England', 'Europe', 776);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bradford-england', 53.79391, -1.75206, 'England', 'Europe', 777);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('reims-fr', 49.26526, 4.02853, 'France', 'Europe', 778);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('grenoble-fr', 45.17869, 5.71479, 'France', 'Europe', 779);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('dijon-fr', 47.31344, 5.01391, 'France', 'Europe', 780);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('utrecht-nl', 52.09083, 5.12222, 'Netherlands', 'Europe', 781);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('leiden-nl', 52.15833, 4.49306, 'Netherlands', 'Europe', 782);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('gwalior-in', 26.22983, 78.17337, 'India', 'Asia', 783);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kozhikode-in', 11.24802, 75.7804, 'India', 'Asia', 784);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('jamnagar-in', 22.47292, 70.06673, 'India', 'Asia', 785);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('thiruvananthapuram-in', 8.4855, 76.94924, 'India', 'Asia', 786);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kuantan-my', 3.8077, 103.326, 'Malaysia', 'Asia', 787);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('miri-my', 4.39928, 113.99163, 'Malaysia', 'Asia', 788);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('kota-kinabalu-my', 5.9749, 116.0724, 'Malaysia', 'Asia', 789);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('valdivia-cl', -39.81422, -73.24589, 'Chile', 'South America', 790);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('concepcion-cl', -36.82699, -73.04977, 'Chile', 'South America', 791);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bremen-de', 53.07582, 8.80717, 'Germany', 'Europe', 792);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('bonn-de', 50.73438, 7.09549, 'Germany', 'Europe', 793);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('haifa-il', 32.81303, 34.99928, 'Israel', 'Asia', 794);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('split-hr', 43.50891, 16.43915, 'Croatia', 'Europe', 795);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('el-paso-usa', 31.75872, -106.48693, 'United States', 'North America', 796);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('green-bay-usa', 44.51916, -88.01983, 'United States', 'North America', 797);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('grand-rapids-usa', 42.96336, -85.66809, 'United States', 'North America', 798);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('tulsa-usa', 36.15398, -95.99277, 'United States', 'North America', 799);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('santa-barbara-usa', 34.42083, -119.69819, 'United States', 'North America', 800);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('new-haven-usa', 41.30815, -72.92816, 'United States', 'North America', 801);
INSERT INTO daily_locations (location_id, answer_lat, answer_lng, country, continent, pool_index)
VALUES ('porto-novo-bj', 6.48333, 2.61667, 'Benin', 'Africa', 802);

