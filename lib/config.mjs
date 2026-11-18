// 수집 대상과 화면 표시용 도시 정보.
// 현지 경비(costs)는 기존 사이트의 계획용 추정 단가를 그대로 옮긴 값이며 실측 자료가 아니다.
export const BASIS = { adults: 2 };

// 숙소 선택 기준. 최저가만 고르면 호스텔·캡슐호텔·비교사이트 요금이 섞이므로 걸러 낸다.
export const HOTEL_RULES = {
  // 요금을 인정하는 예약처. 비교사이트(Bluepillow, momondo, HomeToGo 등)와 타국어판 사이트는 제외.
  sellers: /^(agoda|booking\.com|expedia|hotels\.com|trip\.com)\b/i,
  // 숙소명·객실명에 이 말이 있으면 제외.
  excludeName: /hostel|capsule|dorm|bunk|pod\b|cabin|backpack|guest ?house|homestay|shared|mixed|female only|male only|men only|women only/i,
  // 아래는 위치 확인 후보가 없는 도시에서 권역 검색으로 찾은 숙소에만 적용.
  minClass: 3,      // 3성급 이상
  minRating: 4.0,   // 구글 평점
  minReviews: 100,  // 리뷰 수
  maxTries: 3,      // 기준을 통과한 후보 중 상세 조회할 최대 수
};

export const CITY_INFO = {
  fukuoka: { name: '후쿠오카', country: '일본', flag: '🇯🇵', intro: '짧은 일정에도 부담 없는 먹거리와 산책', group: 'short', costs: { foodPPDay: 40000, transitPPDay: 11000, activityPP: 40000, miscPP: 15000 } },
  osaka: { name: '오사카', country: '일본', flag: '🇯🇵', intro: '쇼핑·먹거리·대도시 관광을 가득', group: 'short', costs: { foodPPDay: 50000, transitPPDay: 19000, activityPP: 70000, miscPP: 20000 } },
  taipei: { name: '타이베이', country: '대만', flag: '🇹🇼', intro: '야시장과 골목, 근교까지 골고루', group: 'short', costs: { foodPPDay: 38000, transitPPDay: 13000, activityPP: 60000, miscPP: 20000 } },
  tokyo: { name: '도쿄', country: '일본', flag: '🇯🇵', intro: '쇼핑과 전시, 골목 맛집과 도심 전망', group: 'short', costs: { foodPPDay: 55000, transitPPDay: 22000, activityPP: 90000, miscPP: 20000 } },
  danang: { name: '다낭', country: '베트남', flag: '🇻🇳', intro: '바다·휴식·근교 관광을 함께', group: 'short', costs: { foodPPDay: 35000, transitPPDay: 11000, activityPP: 65000, miscPP: 20000 } },
  nhatrang: { name: '나트랑', country: '베트남', flag: '🇻🇳', intro: '해변과 리조트에서 느긋하게', group: 'short', costs: { foodPPDay: 35000, transitPPDay: 15000, activityPP: 55000, miscPP: 20000 } },
  bangkok: { name: '방콕', country: '태국', flag: '🇹🇭', intro: '로컬 맛집, 야시장, 사원과 루프톱', group: 'short', costs: { foodPPDay: 38000, transitPPDay: 16000, activityPP: 85000, miscPP: 20000 } },
  paris: { name: '파리', country: '프랑스', flag: '🇫🇷', intro: '센강 산책과 미술관, 카페의 일주일', group: 'long', costs: { foodPPDay: 70000, transitPPDay: 25000, activityPP: 180000, miscPP: 40000 } },
  losangeles: { name: '로스앤젤레스', country: '미국', flag: '🇺🇸', intro: '햇살과 해변, 영화 속 거리', group: 'long', costs: { foodPPDay: 85000, transitPPDay: 45000, activityPP: 200000, miscPP: 40000 } },
};

// weekday: 0=일 … 5=금. 수집일 기준 weeksAhead주 뒤의 첫 해당 요일에 출발.
export const PATTERNS = [
  { id: 'w4-fri-3n', label: '약 한 달 뒤 주말', weeksAhead: 4, weekday: 5, nights: 3, group: 'short' },
  { id: 'w8-fri-3n', label: '약 두 달 뒤 주말', weeksAhead: 8, weekday: 5, nights: 3, group: 'short' },
  { id: 'w12-fri-3n', label: '약 석 달 뒤 주말', weeksAhead: 12, weekday: 5, nights: 3, group: 'short' },
  { id: 'w6-tue-3n', label: '평일 출발', weeksAhead: 6, weekday: 2, nights: 3, group: 'short' },
  { id: 'w8-fri-7n', label: '약 두 달 뒤 일주일', weeksAhead: 8, weekday: 5, nights: 7, group: 'long' },
  { id: 'w16-fri-7n', label: '약 넉 달 뒤 일주일', weeksAhead: 16, weekday: 5, nights: 7, group: 'long' },
];

const DAY = 86400000;
export const todayKST = (now = Date.now()) => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

export function patternDates(pattern, now = Date.now()) {
  let d = addDays(todayKST(now), pattern.weeksAhead * 7);
  while (new Date(d).getUTCDay() !== pattern.weekday) d = addDays(d, 1);
  return { departureDate: d, returnDate: addDays(d, pattern.nights) };
}

// 한 번의 수집에서 조회할 (도시, 일정) 목록.
export function jobs(now = Date.now(), cityFilter = null) {
  const out = [];
  for (const [city, info] of Object.entries(CITY_INFO)) {
    if (cityFilter && !cityFilter.includes(city)) continue;
    for (const p of PATTERNS.filter(p => p.group === info.group)) {
      const { departureDate, returnDate } = patternDates(p, now);
      out.push({ city, patternId: p.id, nights: p.nights, scope: { city, adults: BASIS.adults, departureDate, returnDate, checkinDate: departureDate, checkoutDate: returnDate } });
    }
  }
  return out;
}
