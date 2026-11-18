// 스냅샷 한 줄(2명 기준 실조회가)에서 전체 여행 예산을 계산한다.
// 인원·박수가 조회 조건과 다르면 비례 환산한 추정이며 exact=false로 표시한다.
export const BUFFER = 0.10;

export function estimate(entry, costs, { people, nights }) {
  if (!entry.flight || !entry.hotel) return { complete: false, missing: [!entry.flight && '항공', !entry.hotel && '숙박'].filter(Boolean) };
  const days = nights + 1, rooms = Math.ceil(people / 2);
  const exact = people === entry.adults && nights === entry.nights;
  const items = [
    { id: 'flight', label: '왕복 항공', value: Math.round(entry.flight.amount / entry.adults * people) },
    { id: 'hotel', label: `숙박 ${nights}박${rooms > 1 ? ' · 객실 ' + rooms + '개' : ''}`, value: Math.round(entry.hotel.amount / entry.nights * nights * rooms) },
    { id: 'fee', label: '숙박세 준비', value: Math.round((entry.hotel.feeReserveKRW || 0) / (entry.adults * entry.nights) * people * nights) },
    { id: 'food', label: '식비', value: costs.foodPPDay * people * days },
    { id: 'transit', label: '현지 교통', value: costs.transitPPDay * people * days },
    { id: 'activity', label: '체험·관광', value: costs.activityPP * people },
    { id: 'misc', label: '보험·통신 등', value: costs.miscPP * people },
  ].filter(x => x.value > 0);
  const subtotal = items.reduce((s, x) => s + x.value, 0), buffer = Math.round(subtotal * BUFFER);
  const total = subtotal + buffer;
  return { complete: true, exact, items, buffer, total, perPerson: total / people };
}

export const fmtWon = n => new Intl.NumberFormat('ko-KR').format(Math.round(n)) + '원';
export const fmtMan = n => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(n / 10000) + '만 원';
