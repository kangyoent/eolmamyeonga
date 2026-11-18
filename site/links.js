// 방문자가 고른 날짜·인원으로 예약처 검색 주소를 만든다.
// 두 형식 모두 2026-11-18에 브라우저에서 날짜·인원이 적용되는 것을 확인했다.
const iso = d => /^\d{4}-\d{2}-\d{2}$/.test(d);

// Google 항공편: 출발지·도착지·날짜·성인 수가 검색 화면에 채워진다.
export function flightLink({ from = 'ICN', to, departureDate, returnDate, people }) {
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !iso(departureDate) || !iso(returnDate) || !Number.isInteger(people) || people < 1 || people > 9) return null;
  const url = new URL('https://www.google.com/travel/flights');
  url.searchParams.set('hl', 'ko'); url.searchParams.set('gl', 'kr'); url.searchParams.set('curr', 'KRW');
  url.searchParams.set('q', `Flights from ${from} to ${to} on ${departureDate} through ${returnDate} for ${people} adults`);
  return url.href;
}

// Booking.com: 숙소 이름으로 검색하고 날짜·성인 수·객실 수(2인 1실)를 넘긴다.
export function hotelLink({ name, checkin, checkout, people }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || !iso(checkin) || !iso(checkout) || checkout <= checkin || !Number.isInteger(people) || people < 1 || people > 9) return null;
  const url = new URL('https://www.booking.com/searchresults.ko.html');
  url.searchParams.set('ss', name.trim());
  url.searchParams.set('checkin', checkin); url.searchParams.set('checkout', checkout);
  url.searchParams.set('group_adults', String(people)); url.searchParams.set('no_rooms', String(Math.ceil(people / 2))); url.searchParams.set('group_children', '0');
  url.searchParams.set('selected_currency', 'KRW');
  return url.href;
}
