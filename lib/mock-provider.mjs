// 가상 응답 제공자. 화면·수집 흐름 시험용이며 금액은 실제 시장 가격이 아니다.
import { CITIES } from './quotes.mjs';

const FLIGHT_PP = { FUK: 240000, KIX: 280000, TPE: 340000, NRT: 330000, DAD: 420000, CXR: 450000, BKK: 470000, CDG: 1450000, LAX: 1350000 };
const ROOM_NIGHT = { fukuoka: 150000, osaka: 135000, taipei: 125000, tokyo: 185000, danang: 90000, nhatrang: 95000, bangkok: 85000, paris: 290000, losangeles: 260000 };
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const wobble = (seed, base) => Math.round(base * (0.85 + (hash(seed) % 31) / 100) / 100) * 100;
const cityOf = p => Object.keys(CITIES).find(c => p.property_token?.includes(c) || p.q === CITIES[c].query) || null;

export function mockProvider({ failHotel = ['losangeles:1'], echoOutbound = true, echoNumber = 'ZZ 101', source = 'Booking.com', propertyLevel = false, properties = null } = {}) {
  const calls = [];
  const fetcher = async url => {
    const p = Object.fromEntries(url.searchParams); delete p.api_key; calls.push(p);
    const raw = { search_parameters: p, search_metadata: { status: 'Success', processed_at: new Date().toISOString(), ...(p.engine === 'google_flights' ? { google_flights_url: 'https://www.google.com/travel/flights' } : { google_hotels_url: 'https://www.google.com/travel/hotels' }) } };
    const adults = Number(p.adults);
    if (p.engine === 'google_flights') {
      const a = p.arrival_id, seg = (date, from, to, no, dep, arr) => ({ flight_number: no, airline: '가상항공', departure_airport: { id: from, time: date + ' ' + dep }, arrival_airport: { id: to, time: date + ' ' + arr } });
      const out = { flights: [seg(p.outbound_date, 'ICN', a, 'ZZ 101', '09:10', '11:30')] }, back = { flights: [seg(p.return_date, a, 'ICN', 'ZZ 102', '13:00', '15:20')] };
      const price = wobble(a + p.outbound_date, FLIGHT_PP[a]) * adults;
      if (p.booking_token) Object.assign(raw, { selected_flights: [out, back], booking_options: [{ together: { book_with: '가상항공', airline: true, price, link: 'https://example.com/flight' } }] });
      else if (p.departure_token) Object.assign(raw, { selected_flights: echoOutbound ? [{ flights: [seg(p.outbound_date, 'ICN', a, echoNumber, '09:10', '11:30')] }] : [], other_flights: [{ ...back, price, booking_token: 'bk-' + a }] });
      else Object.assign(raw, { best_flights: [{ ...out, price, departure_token: 'dep-' + a }] });
    } else if (p.property_token) {
      // 실제 카탈로그 토큰은 도시명을 담고 있지 않으므로 날짜로만 금액을 만든다.
      const city = cityOf(p), nights = (Date.parse(p.check_out_date) - Date.parse(p.check_in_date)) / 86400000;
      const base = ROOM_NIGHT[city] || 140000, total = wobble(p.property_token.slice(0, 12) + p.check_in_date, base) * nights;
      const order = failHotel.find(x => x.startsWith(city + ':'));
      Object.assign(raw, { property_token: p.property_token, name: city ? '가상 호텔 ' + CITIES[city].name : '가상 도심 호텔' });
      if (!order && propertyLevel) raw.prices = [{ source, num_guests: adults, total_rate: { extracted_after_taxes_fees: total }, link: 'https://example.com/hotel' }];
      else if (!order) raw.featured_prices = [{ source, rooms: [{ name: 'Standard Double Room - Non-Smoking', num_guests: adults, rates: [{ total_rate: { extracted_after_taxes_fees: total }, num_guests: adults, link: 'https://example.com/hotel', free_cancellation: true, breakfast_included: false }] }] }];
    } else {
      const city = cityOf(p), c = CITIES[city];
      raw.properties = (properties || [{}, {}]).map((extra, i) => ({ type: 'hotel', property_token: 'mock-' + city + '-' + i, name: '가상 호텔 ' + c.name + ' ' + (i + 1), overall_rating: 4.2, reviews: 850, hotel_class: '3-star hotel', extracted_hotel_class: 3, ...extra, gps_coordinates: { latitude: c.center[0] + 0.004 * i, longitude: c.center[1] }, total_rate: { extracted_after_taxes_fees: 100000 } }));
    }
    return new Response(JSON.stringify(raw), { status: 200 });
  };
  return { calls, fetcher };
}
