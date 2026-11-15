import { km } from './lib'

/**
 * Mosques + prayer rooms around our trip areas (Tokyo/Kanto, Osaka/Kyoto, Fuji).
 * Sources (8 Nov 2026):
 *  - OpenStreetMap (amenity=place_of_worship + religion=muslim), © OpenStreetMap contributors, ODbL
 *  - prayer rooms: JNTO Muslim guide (japan.travel), Halal Media Japan, MATCHA, GROOVY JAPAN
 * Prayer-room pins are approximate (inside big buildings), so their links SEARCH Google Maps by name near the pin.
 * The map only shows the ones within 2 km of one of our places or hotels, plus the ⭐ popular ones everywhere
 * (popular picks: Tokyo Camii + Asakusa Mosque, Osaka Masjid + Masjid Istiqlal Osaka; MATCHA, GROOVY JAPAN, HalalTrip, masjid4all).
 */
/** popular = one of the 2 best-known, best-rated mosques per city: always shown on the map (not just near our places), ⭐ pin */
export type Mosque = { name: string; lat: number; lng: number; kind: 'mosque' | 'prayer_room'; note?: string; search?: string; popular?: boolean }

export const MOSQUES: Mosque[] = [
  // ── OpenStreetMap: mosques ──
  { name: 'Assalaam Masjid (Okachimachi)', lat: 35.705964, lng: 139.777849, kind: 'mosque', note: 'Near Ameyoko & PANGA' },
  { name: 'Asakusa Mosque (Darul Arqam)', lat: 35.72177, lng: 139.801467, kind: 'mosque', popular: true, note: 'The go-to mosque for visitors near Sensoji' },
  { name: 'Tokyo Camii', lat: 35.668168, lng: 139.67655, kind: 'mosque', popular: true, note: 'Japan’s largest mosque, Ottoman style. Visitors 10:00–18:00' },
  { name: 'Hiroo Mosque', lat: 35.656179, lng: 139.72815, kind: 'mosque' },
  { name: 'Masjid Otsuka', lat: 35.729023, lng: 139.728238, kind: 'mosque' },
  { name: 'Makki Masjid', lat: 35.743705, lng: 139.842767, kind: 'mosque' },
  { name: 'Kamata Mosque', lat: 35.564428, lng: 139.717125, kind: 'mosque' },
  { name: 'Hira Masjid (Gyotoku)', lat: 35.681559, lng: 139.918506, kind: 'mosque' },
  { name: 'Baitul Aman Mosque', lat: 35.868465, lng: 139.791608, kind: 'mosque' },
  { name: "Ja'me Masjid Yokohama", lat: 35.544228, lng: 139.60127, kind: 'mosque' },
  { name: 'Prayer Room (Takanawa Gateway)', lat: 35.634801, lng: 139.739655, kind: 'prayer_room', note: 'Next to JW Marriott Tokyo' },
  { name: 'Osaka Masjid', lat: 34.70832, lng: 135.444961, kind: 'mosque', popular: true, note: 'Osaka’s original central mosque (Nishiyodogawa), near 1819 Osaka Halal' },
  { name: 'Masjid Istiqlal Osaka', lat: 34.6515, lng: 135.4944, kind: 'mosque', popular: true, search: 'Masjid Istiqlal Osaka',
    note: 'Opened 2023, much-praised, halal mart. Open 05:00–23:00. 1-2-10 Nakabiraki, Nishinari (south of Namba)' },
  { name: 'Kyoto Mosque (Islamic Cultural Center)', lat: 35.021825, lng: 135.769578, kind: 'mosque', note: 'Near the Imperial Palace. 110 people, men/women areas, halal shop. Tue–Sat 12:00–18:00' },
  { name: 'Islamic Research Centre Japan', lat: 34.863204, lng: 135.707036, kind: 'mosque' },
  // ── Prayer rooms (approximate pins inside buildings) ──
  { name: 'Prayer room, Hankyu Umeda 8F', lat: 34.7036, lng: 135.4996, kind: 'prayer_room', note: 'Gender-separated, wudu area. Next to our Osaka hotel', search: 'Hankyu Umeda Main Store' },
  { name: 'Prayer room, Namba CITY B1', lat: 34.6627, lng: 135.5017, kind: 'prayer_room', note: 'Ask at the information counter; warm water for wudu', search: 'Namba CITY' },
  { name: 'Prayer room, Daimaru Shinsaibashi', lat: 34.6737, lng: 135.5011, kind: 'prayer_room', note: 'Gender-separated', search: 'Daimaru Shinsaibashi' },
  { name: 'Prayer room, Tempozan Marketplace 3F', lat: 34.6556, lng: 135.4297, kind: 'prayer_room', note: 'Next to Kaiyukan aquarium', search: 'Tempozan Marketplace' },
  { name: 'USJ Family Service Room (quiet space)', lat: 34.6658, lng: 135.4336, kind: 'prayer_room', note: 'Not a prayer room: ask staff for the quiet room near the Hollywood entrance', search: 'Universal Studios Japan Guest Services' },
  { name: 'Prayer space, Azabudai Hills (Mori JP Tower 4F)', lat: 35.6606, lng: 139.7403, kind: 'prayer_room', note: 'Same complex as teamLab Borderless', search: 'Azabudai Hills Mori JP Tower' },
  { name: 'Prayer room, Tokyo Station (Marunouchi North)', lat: 35.6823, lng: 139.7662, kind: 'prayer_room', note: '10:00–17:00', search: 'Tokyo Station Marunouchi North Exit' },
  { name: 'Prayer room, Tokyo Midtown', lat: 35.6656, lng: 139.7311, kind: 'prayer_room', search: 'Tokyo Midtown Roppongi' },
  { name: 'Shibuya Prayer Room (Noa Dogenzaka)', lat: 35.6577, lng: 139.6967, kind: 'prayer_room', note: 'Near Street Kart', search: 'Noa Dogenzaka Shibuya' },
  { name: 'Prayer room, Shibuya PARCO 5F', lat: 35.6620, lng: 139.6986, kind: 'prayer_room', search: 'Shibuya PARCO' },
  { name: 'Prayer room, Takashimaya Shinjuku', lat: 35.6877, lng: 139.7024, kind: 'prayer_room', search: 'Takashimaya Shinjuku' },
  // ── Kyoto prayer rooms (kyoto.travel "Free spaces for Muslims to perform prayers", MATCHA 2026 guide; added 15 Nov 2026) ──
  { name: 'Prayer room, Kansai Tourist Info Center Kyoto', lat: 34.98754, lng: 135.759219, kind: 'prayer_room', note: '1 block from Kyoto Station. Busy in peak season, ask first', search: 'Kansai Tourist Information Center Kyoto' },
  { name: 'Prayer room, Kyoto Marui 5F', lat: 35.0035, lng: 135.7697, kind: 'prayer_room', note: 'Shijo-Kawaramachi, next to Gion / Nishiki', search: 'Kyoto Marui' },
  { name: 'Prayer room, Kyoto Handicraft Center', lat: 35.01756, lng: 135.780253, kind: 'prayer_room', note: 'Ask at the info counter (West bldg 1F). 10:00–19:00. Near Heian Shrine', search: 'Kyoto Handicraft Center' },
  { name: 'Prayer room, Kyoto International Community House', lat: 35.0115, lng: 135.7885, kind: 'prayer_room', note: 'Small room (5 max). 9:00–21:00, closed Mon. Near Nanzenji', search: 'Kyoto International Community House kokoka' },
  { name: 'Prayer space, Nijo Castle rest house', lat: 35.014008, lng: 135.748537, kind: 'prayer_room', note: 'Ask at the shop in the large rest house', search: 'Nijo Castle' },
  { name: 'Arashiyama Muslim Prayer Room', lat: 35.0152, lng: 135.6777, kind: 'prayer_room', note: 'Near Arashiyama Station: pray before/after the bamboo grove', search: 'Arashiyama Muslim prayer room' },
  // ── Mt Fuji / Kawaguchiko (GROOVY JAPAN, Yomiuri; added 15 Nov 2026) ──
  { name: 'Fuji Kawaguchiko Masjid', lat: 35.5045, lng: 138.764, kind: 'mosque', popular: true, note: 'On the lake, ~18 min walk from Kawaguchiko Stn. 200 people, men/women wudu, halal café', search: 'Fuji Kawaguchiko Masjid' },
  { name: 'Prayer room, Fuji-Q Highland', lat: 35.487282, lng: 138.781555, kind: 'prayer_room', note: 'In the first-aid building, free during park hours', search: 'Fuji-Q Highland' },
]

/** Closest mosques/prayer rooms to a point, nearest first. */
export function mosquesNear(p: { lat: number; lng: number }, n = 3) {
  return MOSQUES.map((m) => ({ ...m, d: km(p, m) })).sort((a, b) => a.d - b.d).slice(0, n)
}

/** Google Maps link: walking directions to a mosque pin, or a name search near approximate prayer-room pins. */
export const mosqueLink = (m: Mosque) => m.search
  ? `https://www.google.com/maps/search/${encodeURIComponent(m.search)}/@${m.lat.toFixed(5)},${m.lng.toFixed(5)},17z`
  : `https://www.google.com/maps/dir/?api=1&destination=${m.lat.toFixed(6)},${m.lng.toFixed(6)}&travelmode=walking`
