// 한 (도시, 일정)의 항공·숙박 가격을 조회해 스냅샷 한 줄로 만든다.
// 응답 검증과 정규화는 기존 사이트의 quotes.mjs를 그대로 쓴다.
import { parameters, normalize } from './quotes.mjs';
import { CATALOG } from './stays.mjs';
import { HOTEL_RULES } from './config.mjs';

const ENDPOINT = 'https://serpapi.com/search.json';
const stopError = message => Object.assign(new Error(message), { stop: true });

async function call(kind, scope, ctx, env) {
  const p = parameters(kind, scope, ctx.token, ctx.hotelId);
  if (env.budget.used >= env.budget.max) throw stopError('이번 수집의 조회 한도에 도달했어요.');
  env.budget.used++;
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries({ ...p, api_key: env.apiKey })) url.searchParams.set(k, v);
  let res;
  // 오류 메시지에 키가 들어간 주소를 남기지 않는다.
  try { res = await env.fetcher(url, { signal: AbortSignal.timeout(55000), redirect: 'manual' }); }
  catch { throw new Error('가격 제공처에 연결하지 못했어요.'); }
  if (!res.ok) {
    const message = '가격 제공처 응답 오류 (' + res.status + ')';
    throw [401, 403, 429].includes(res.status) ? stopError(message) : new Error(message);
  }
  let raw;
  try { raw = await res.json(); } catch { throw new Error('가격 제공처 응답을 읽지 못했어요.'); }
  const data = normalize(kind, raw, scope, p, Date.now(), ctx.hotel || null);
  // 원본은 숙소 등급·평점 판정에만 쓰고 저장하지 않는다.
  Object.defineProperty(data, 'raw', { value: raw, enumerable: false });
  return data;
}

async function collectFlight(scope, env) {
  const dep = await call('departures', scope, {}, env);
  const sameDay = dep.options.filter(o => o.segments.at(-1)?.arrival?.slice(0, 10) === scope.checkinDate);
  const out = (sameDay.length ? sameDay : dep.options)[0];
  if (!out) throw new Error('출발일에 맞는 직항 출국편이 없어요.');
  const ret = await call('returns', scope, { token: out.token }, env);
  const back = ret.options[0];
  if (!back) throw new Error('귀국일에 맞는 직항편이 없어요.');
  // 귀국편 응답은 출국편 토큰에 묶여 있다. 응답이 출국편을 되돌려 주면 편명·출발일을 대조하고,
  // 되돌려 주지 않으면(실제 응답에서 흔함) 대조 없이 쓰되 그 사실을 기록한다.
  const echo = ret.selectedOutbound?.[0], chosen = out.segments[0];
  if (echo && (echo.number !== chosen.number || echo.departure.slice(0, 10) !== chosen.departure.slice(0, 10))) throw new Error(`선택한 출국편(${chosen.number})과 왕복 결과의 출국편(${echo.number || '편명 없음'})이 달라 가격을 보류했어요.`);
  let flight = { amount: back.price, stage: 'roundtrip_search', outboundEcho: echo ? 'matched' : 'absent', supplier: 'Google Flights', observedAt: ret.observedAt, legs: [out.segments, back.segments], link: ret.googleURL || 'https://www.google.com/travel/flights' };
  if (env.sellerQuote) {
    try {
      const booking = await call('booking', scope, { token: back.token }, env);
      const seller = booking.options.find(x => x.airline) || booking.options[0];
      if (seller && JSON.stringify(booking.legs) === JSON.stringify(flight.legs)) flight = { ...flight, amount: seller.amount, stage: 'seller_quote', supplier: seller.supplier, observedAt: booking.observedAt, link: seller.link || flight.link };
    } catch (e) { if (e.stop) throw e; }
  }
  return flight;
}

// 기존 js/budget.js의 pickHotel 기준에 예약처·객실명 기준을 더했다.
// roomOnly: 객실명이 확인된 요금만 인정 (권역 검색으로 찾은 숙소용).
export function pickHotel(rows, scope, now = Date.now(), { roomOnly = false, rules = HOTEL_RULES } = {}) {
  return rows.filter(x => x.eligible === true && x.room && x.link && !/shared|dorm|capsule|bunk|day use/i.test(x.room))
    .filter(x => rules.sellers.test(x.supplier || '') && !rules.excludeName.test(x.room) && (!roomOnly || x.quoteLevel === 'room'))
    .filter(x => {
      if (!x.cancellation || !x.cancelUntil) return true;
      const year = scope.checkinDate.slice(0, 4);
      const parsed = Date.parse(x.cancelUntil.match(/20\d\d/) ? x.cancelUntil : x.cancelUntil + ' ' + year);
      return Number.isFinite(parsed) && parsed >= now && parsed <= Date.parse(scope.checkinDate) + 86400000;
    })
    .sort((a, b) => Number(a.quoteLevel === 'property') - Number(b.quoteLevel === 'property') || Number(b.taxStatus === 'included') - Number(a.taxStatus === 'included') || (a.warnings?.length || 0) - (b.warnings?.length || 0) || (a.amount + (a.feeReserveKRW || 0)) - (b.amount + (b.feeReserveKRW || 0)))[0];
}

const toHotel = (d, row, quality = null) => ({
  stars: quality?.cls ?? null, rating: quality?.rating ?? null, reviews: quality?.reviews ?? null,
  name: row.name, room: row.room, supplier: row.supplier, amount: row.amount,
  feeReserveKRW: row.feeReserveKRW || 0, taxStatus: row.taxStatus, quoteLevel: row.quoteLevel,
  // link는 조회 시점의 판매처 이동 주소(구글 광고 클릭 주소일 수 있어 오래 유지된다는 보장이 없다).
  // pageLink는 같은 날짜·인원의 구글 호텔 페이지로, 일주일 뒤에도 열리는 주소다.
  link: row.link, pageLink: d.googleURL || null, breakfast: row.profile?.breakfast || 'unknown', cancellation: row.profile?.cancellation || 'unknown',
  zone: row.hotel?.zone || '', station: row.hotel?.station || '', walk: row.hotel?.walk ?? null,
  warnings: (row.warnings || []).slice(0, 6), observedAt: d.observedAt,
});

// 권역 검색 원본에서 숙소별 등급·평점·리뷰 수를 읽는다. 값이 없으면 기준 미달로 본다.
export function hotelQuality(raw) {
  const rows = Array.isArray(raw?.properties) && raw.properties.length ? raw.properties : raw?.property_token ? [raw] : [];
  return new Map(rows.map(h => [h.property_token, {
    cls: Number(h.extracted_hotel_class) || Number(String(h.hotel_class || '').match(/\d/)?.[0]) || 0,
    rating: typeof h.overall_rating === 'number' ? h.overall_rating : 0,
    reviews: Number(h.reviews) || 0,
  }]));
}

async function collectHotel(scope, env) {
  const notes = [];
  const tryOne = async (kind, ctx, label, quality = null) => {
    try {
      const d = await call(kind, scope, ctx, env), row = pickHotel(d.options, scope, Date.now(), { roomOnly: !!quality });
      if (row) return toHotel(d, row, quality);
      notes.push(label + ': ' + (d.emptyReason || (d.options.some(x => x.eligible) ? '인정하는 예약처의 객실 요금이 없어요.' : '조건에 맞는 요금이 없어요.')));
    } catch (e) { if (e.stop) throw e; notes.push(label + ': ' + e.message); }
    return null;
  };
  const curated = scope.adults <= 2 ? (CATALOG[scope.city] || []).slice(0, 2) : [];
  for (const h of curated) { const hotel = await tryOne('budgetHotel', { hotelId: h.id }, h.name); if (hotel) return { hotel, notes }; }
  // 위치 확인 후보가 없거나 모두 실패하면 도심 권역 검색 1회 + 상세 최대 2회.
  let found;
  try { found = await call('discoverHotels', scope, {}, env); }
  catch (e) { if (e.stop) throw e; notes.push('권역 검색: ' + e.message); return { hotel: null, notes }; }
  const quality = hotelQuality(found.raw), R = HOTEL_RULES;
  const passed = found.options.filter(o => !curated.some(c => c.name === o.name)).filter(o => {
    const q = quality.get(o.token);
    return q && q.cls >= R.minClass && q.rating >= R.minRating && q.reviews >= R.minReviews && !R.excludeName.test(o.name);
  });
  // 어떤 후보가 왜 걸러졌는지 나중에 볼 수 있게 등급·평점을 함께 남긴다.
  const search = { found: found.options.length, passed: passed.length, candidates: found.options.map(o => ({ name: o.name, ...quality.get(o.token), ok: passed.includes(o) })) };
  for (const o of passed.slice(0, R.maxTries)) {
    const hotel = await tryOne('customerHotel', { token: o.token, hotel: o.hotel }, o.name, quality.get(o.token));
    if (hotel) return { hotel, notes, search };
  }
  if (!found.options.length) notes.push('도심 검색 권역에서 숙소 후보를 받지 못했어요.');
  else if (!passed.length) notes.push(`권역 후보 ${found.options.length}곳 중 ${R.minClass}성급·평점 ${R.minRating}·리뷰 ${R.minReviews}개 기준을 통과한 숙소가 없어요.`);
  return { hotel: null, notes, search };
}

// env: { fetcher, apiKey, budget:{used,max}, sellerQuote }
export async function collectEntry(job, env) {
  const entry = { city: job.city, patternId: job.patternId, nights: job.nights, adults: job.scope.adults, departureDate: job.scope.departureDate, returnDate: job.scope.returnDate, flight: null, hotel: null, errors: [], stopped: false };
  try { entry.flight = await collectFlight(job.scope, env); }
  catch (e) { entry.errors.push('항공: ' + e.message); if (e.stop) { entry.stopped = true; return entry; } }
  try { const r = await collectHotel(job.scope, env); entry.hotel = r.hotel; if (r.search) entry.hotelSearch = r.search; if (!r.hotel) entry.errors.push(...r.notes.map(n => '숙박: ' + n)); }
  catch (e) { entry.errors.push('숙박: ' + e.message); if (e.stop) entry.stopped = true; }
  return entry;
}
