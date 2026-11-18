import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs, patternDates, PATTERNS, CITY_INFO } from '../lib/config.mjs';
import { collectEntry } from '../lib/collect-core.mjs';
import { mockProvider } from '../lib/mock-provider.mjs';
import { estimate } from '../site/budget.js';

const NOW = Date.parse('2026-11-18T03:00:00Z');
const env = (provider, max = 100) => ({ fetcher: provider.fetcher, apiKey: 'SECRET-KEY', budget: { used: 0, max }, sellerQuote: false });

test('일정은 지정 요일에 출발하고 박수만큼 떨어져 있다', () => {
  for (const p of PATTERNS) {
    const d = patternDates(p, NOW);
    assert.equal(new Date(d.departureDate).getUTCDay(), p.weekday);
    assert.equal((Date.parse(d.returnDate) - Date.parse(d.departureDate)) / 86400000, p.nights);
    assert.ok(Date.parse(d.departureDate) >= Date.parse('2026-11-18') + p.weeksAhead * 7 * 86400000);
  }
  assert.equal(jobs(NOW).length, 7 * 4 + 2 * 2);
});

test('위치 확인 후보가 있는 도시는 항공 2회 + 숙소 1회로 끝난다', async () => {
  const provider = mockProvider(), e = env(provider);
  const entry = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], e);
  assert.equal(e.budget.used, 3);
  assert.ok(entry.flight.amount > 0 && entry.hotel.amount > 0);
  assert.equal(entry.flight.legs.length, 2);
  assert.equal(entry.hotel.feeReserveKRW, 2 * 3 * 5000); // 일본 숙박세 준비액: 2명 × 3박 × 500엔 × 10원
  assert.deepEqual(entry.errors, []);
});

test('후보가 없는 도시는 권역 검색 후 상세 조회한다', async () => {
  const provider = mockProvider(), e = env(provider);
  const entry = await collectEntry(jobs(Date.now(), ['bangkok'])[0], e);
  assert.equal(e.budget.used, 4);
  assert.ok(entry.hotel);
});

test('숙소 요금이 없으면 가격을 지어내지 않고 비워 둔다', async () => {
  const provider = mockProvider(), e = env(provider);
  const entry = await collectEntry(jobs(Date.now(), ['losangeles'])[0], e);
  assert.equal(entry.hotel, null);
  assert.ok(entry.flight);
  assert.ok(entry.errors.some(x => x.startsWith('숙박')));
  assert.equal(estimate(entry, CITY_INFO.losangeles.costs, { people: 2, nights: 7 }).complete, false);
});

test('조회 상한에 닿으면 멈추고 더 호출하지 않는다', async () => {
  const provider = mockProvider(), e = env(provider, 2);
  const entry = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], e);
  assert.equal(provider.calls.length, 2);
  assert.equal(entry.stopped, true);
  assert.equal(entry.hotel, null);
});

test('수집 결과와 오류 메시지에 키가 남지 않는다', async () => {
  const failing = { fetcher: async url => { throw new Error('connect ' + url); } };
  const entry = await collectEntry(jobs(Date.now(), ['osaka'])[0], env(failing));
  assert.ok(!JSON.stringify(entry).includes('SECRET-KEY'));
  const ok = await collectEntry(jobs(Date.now(), ['osaka'])[0], env(mockProvider()));
  assert.ok(!JSON.stringify(ok).includes('SECRET-KEY'));
});

test('기존 사이트의 11/9 실조회 합계와 같은 금액이 나온다', () => {
  const entry = { adults: 2, nights: 3, flight: { amount: 717000 }, hotel: { amount: 995386, feeReserveKRW: 30000 } };
  const est = estimate(entry, CITY_INFO.fukuoka.costs, { people: 2, nights: 3 });
  assert.equal(est.total, 2486425);
  assert.equal(est.perPerson, 1243212.5);
  assert.equal(est.exact, true);
});

test('인원·박수가 다르면 환산 추정으로 표시한다', () => {
  const entry = { adults: 2, nights: 3, flight: { amount: 600000 }, hotel: { amount: 300000, feeReserveKRW: 0 } };
  const est = estimate(entry, CITY_INFO.bangkok.costs, { people: 3, nights: 4 });
  assert.equal(est.exact, false);
  assert.equal(est.items.find(x => x.id === 'flight').value, 900000);
  assert.equal(est.items.find(x => x.id === 'hotel').value, 800000); // 10만 원/박 × 4박 × 객실 2개
});

test('귀국편 응답이 출국편을 되돌려 주지 않아도 가격을 쓰고 그 사실을 기록한다', async () => {
  const entry = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], env(mockProvider({ echoOutbound: false })));
  assert.ok(entry.flight.amount > 0);
  assert.equal(entry.flight.outboundEcho, 'absent');
});

test('되돌려 준 출국편의 편명이 다르면 항공 가격을 보류한다', async () => {
  const entry = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], env(mockProvider({ echoNumber: 'XX 999' })));
  assert.equal(entry.flight, null);
  assert.ok(entry.errors[0].includes('XX 999'));
});

test('숙소에는 오래 유지되는 구글 호텔 페이지 주소를 함께 저장한다', async () => {
  const entry = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], env(mockProvider()));
  assert.equal(entry.hotel.pageLink, 'https://www.google.com/travel/hotels');
  assert.equal(entry.hotel.link, 'https://example.com/hotel');
});

test('권역 검색 후보는 3성급·평점·리뷰 기준을 통과한 곳만 상세 조회한다', async () => {
  const provider = mockProvider({ properties: [{ extracted_hotel_class: 2, hotel_class: '2-star hotel' }, { name: 'City Backpackers Hostel' }, { overall_rating: 3.8 }, { reviews: 12 }, {}] });
  const e = env(provider), entry = await collectEntry(jobs(Date.now(), ['bangkok'])[0], e);
  assert.equal(e.budget.used, 4); // 항공 2 + 권역 1 + 통과한 한 곳 상세 1
  assert.equal(provider.calls.at(-1).property_token, 'mock-bangkok-4');
  assert.equal(entry.hotel.stars, 3);
  assert.equal(entry.hotel.rating, 4.2);
});

test('기준을 통과한 후보가 없으면 숙소를 비워 두고 이유를 남긴다', async () => {
  const provider = mockProvider({ properties: [{ extracted_hotel_class: 1 }, { hotel_class: undefined, extracted_hotel_class: undefined }] });
  const e = env(provider), entry = await collectEntry(jobs(Date.now(), ['danang'])[0], e);
  assert.equal(entry.hotel, null);
  assert.equal(e.budget.used, 3);
  assert.ok(entry.errors.some(x => x.includes('기준을 통과한 숙소가 없어요')));
});

test('비교사이트 요금과 객실명 없는 요금은 권역 검색 숙소에 쓰지 않는다', async () => {
  const meta = await collectEntry(jobs(Date.now(), ['bangkok'])[0], env(mockProvider({ source: 'Bluepillow.co.uk' })));
  assert.equal(meta.hotel, null);
  const flat = await collectEntry(jobs(Date.now(), ['bangkok'])[0], env(mockProvider({ propertyLevel: true })));
  assert.equal(flat.hotel, null);
});

test('위치 확인 후보 숙소는 객실명 없는 판매처 총액도 인정하되 예약처 기준은 지킨다', async () => {
  const flat = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], env(mockProvider({ propertyLevel: true })));
  assert.equal(flat.hotel.quoteLevel, 'property');
  const meta = await collectEntry(jobs(Date.now(), ['fukuoka'])[0], env(mockProvider({ source: 'momondo.co.uk' })));
  assert.equal(meta.hotel, null);
});

test('예약처 검색 주소에 고른 날짜와 인원이 들어간다', async () => {
  const { flightLink, hotelLink } = await import('../site/links.js');
  const f = new URL(flightLink({ to: 'FUK', departureDate: '2026-12-18', returnDate: '2026-12-22', people: 3 }));
  assert.equal(f.origin + f.pathname, 'https://www.google.com/travel/flights');
  assert.equal(f.searchParams.get('q'), 'Flights from ICN to FUK on 2026-12-18 through 2026-12-22 for 3 adults');
  const h = new URL(hotelLink({ name: 'HOTEL MYSTAYS Fukuoka Tenjin Minami', checkin: '2026-12-18', checkout: '2026-12-22', people: 3 }));
  assert.equal(h.hostname, 'www.booking.com');
  assert.deepEqual([h.searchParams.get('checkin'), h.searchParams.get('checkout'), h.searchParams.get('group_adults'), h.searchParams.get('no_rooms')], ['2026-12-18', '2026-12-22', '3', '2']);
  assert.equal(flightLink({ to: 'fuk', departureDate: '2026-12-18', returnDate: '2026-12-22', people: 3 }), null);
  assert.equal(hotelLink({ name: '', checkin: '2026-12-18', checkout: '2026-12-22', people: 2 }), null);
});
