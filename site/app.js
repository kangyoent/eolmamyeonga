import { estimate, fmtWon, fmtMan } from './budget.js';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
};
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const day = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`; };
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const stamp = iso => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const safeLink = url => { try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };
const time = s => (s || '').slice(11, 16);

let snapshot = null;
const state = { budget: 2500000, people: 2, pattern: null, nights: null };

function readQuery() {
  const q = new URLSearchParams(location.search), b = Number(q.get('b')), p = Number(q.get('p')), n = Number(q.get('n'));
  if (Number.isInteger(b) && b >= 50 && b <= 5000) state.budget = b * 10000;
  if ([1, 2, 3, 4].includes(p)) state.people = p;
  if (snapshot.patterns.some(x => x.id === q.get('t'))) state.pattern = q.get('t');
  if (Number.isInteger(n)) state.nights = n;
}
function writeQuery() {
  const q = new URLSearchParams({ b: state.budget / 10000, p: state.people, t: state.pattern, n: state.nights });
  history.replaceState(null, '', '?' + q);
}
const pattern = () => snapshot.patterns.find(p => p.id === state.pattern);
const nightChoices = p => p.group === 'long' ? [7, 8, 9, 10] : [2, 3, 4, 5];

function fillControls() {
  $('budget').value = state.budget / 10000;
  $('people').value = state.people;
  $('pattern').replaceChildren(...snapshot.patterns.map(p => el('option', { value: p.id, textContent: `${p.label} · ${day(p.departureDate)} 출발` })));
  $('pattern').value = state.pattern;
  fillNights();
}
function fillNights() {
  const p = pattern(), choices = nightChoices(p);
  if (!choices.includes(state.nights)) state.nights = p.nights;
  $('nights').replaceChildren(...choices.map(n => el('option', { value: n, textContent: n + '박' })));
  $('nights').value = state.nights;
}

function flightLine(f) {
  const [out, back] = f.legs.map(l => l[0]);
  return el('div', {}, el('b', { textContent: '항공 ' }), `${out.airline} ${out.number} ${time(out.departure)} 출발 · 귀국 ${back.number} ${time(back.departure)} `, el('span', { textContent: f.stage === 'seller_quote' ? `· ${f.supplier} 판매가` : '· 왕복 검색가' }));
}
function hotelLine(h) {
  const where = [h.zone, h.station && (h.walk ? `${h.station} 도보 ${h.walk}분` : h.station)].filter(Boolean).join(' · ');
  const grade = [h.stars && `${h.stars}성급`, h.rating && `평점 ${h.rating}`].filter(Boolean).join(' · ');
  return el('div', {}, el('b', { textContent: '숙소 ' }), `${h.name} `, el('span', { textContent: [grade, where, h.supplier].filter(Boolean).join(' · ') }));
}

function card(entry, est) {
  const city = snapshot.cities[entry.city], p = pattern();
  const head = el('div', { className: 'card-head' }, el('div', {}, el('h3', { textContent: `${city.flag} ${city.name}` }), el('div', { className: 'sub', textContent: city.intro })));
  const dates = `${day(entry.departureDate)} ~ ${day(addDays(entry.departureDate, state.nights))} · ${state.people}명`;
  if (!est.complete) {
    head.append(el('span', { className: 'badge hold', textContent: '가격 확인 필요' }));
    return el('article', { className: 'card' }, head, el('div', { className: 'tag', textContent: dates }),
      el('p', { className: 'hold-note', textContent: `${est.missing.join('·')} 가격을 받지 못해 전체 예산을 계산하지 않았어요.` }),
      el('div', { className: 'facts' }, entry.flight && flightLine(entry.flight), entry.hotel && hotelLine(entry.hotel)));
  }
  const diff = state.budget - est.total, fits = diff >= 0;
  head.append(el('span', { className: 'badge' + (fits ? '' : ' over'), textContent: fits ? '예산 안' : '예산 초과' }));
  const rows = [...est.items, { label: '예비비 10%', value: est.buffer }, { label: '전체', value: est.total }];
  const flightURL = safeLink(entry.flight.link), hotelURL = safeLink(entry.hotel.pageLink) || safeLink(entry.hotel.link);
  const observed = [entry.flight.observedAt, entry.hotel.observedAt].sort()[0];
  return el('article', { className: 'card' + (fits ? '' : ' over') }, head,
    el('div', { className: 'tag', textContent: dates }),
    el('div', { className: 'total' }, `약 ${fmtMan(est.total)}`, el('small', { textContent: `1인 약 ${fmtMan(est.perPerson)}` })),
    el('div', { className: 'gap' + (fits ? '' : ' over'), textContent: fits ? `예산에서 ${fmtMan(diff)} 남아요` : `예산보다 ${fmtMan(-diff)} 더 필요해요` }),
    el('div', { className: 'tag', textContent: est.exact ? `${entry.adults}명·${entry.nights}박 조회 조건 그대로` : `${entry.adults}명·${entry.nights}박 조회가를 ${state.people}명·${state.nights}박으로 환산한 추정` }),
    el('div', { className: 'facts' }, flightLine(entry.flight), hotelLine(entry.hotel)),
    el('details', {}, el('summary', { textContent: '항목별 금액' }), el('div', { className: 'rows' }, rows.map(r => el('div', {}, el('span', { textContent: r.label }), el('span', { textContent: fmtWon(r.value) }))))),
    el('div', { className: 'tag', textContent: `${stamp(observed)} 조회 · 지금 가격은 예약처에서 확인` }),
    el('div', { className: 'actions' },
      flightURL && el('a', { href: flightURL, target: '_blank', rel: 'noopener noreferrer', textContent: '항공 보기' }),
      hotelURL && el('a', { className: 'ghost', href: hotelURL, target: '_blank', rel: 'noopener noreferrer', textContent: '숙소 보기' })));
}

function render() {
  const p = pattern();
  const rows = snapshot.entries.filter(e => e.patternId === p.id).map(entry => ({ entry, est: estimate(entry, snapshot.cities[entry.city].costs, state) }));
  const rank = r => !r.est.complete ? 2 : r.est.total <= state.budget ? 0 : 1;
  rows.sort((a, b) => rank(a) - rank(b) || (a.est.total || 0) - (b.est.total || 0));
  const priced = rows.filter(r => r.est.complete), within = priced.filter(r => r.est.total <= state.budget);
  $('summary').textContent = !priced.length ? '이 시기에는 계산할 수 있는 가격이 아직 없어요.'
    : within.length ? `${fmtMan(state.budget)}으로 ${state.people}명이 ${state.nights}박: ${priced.length}곳 중 ${within.length}곳을 갈 수 있어요.`
    : `${fmtMan(state.budget)}으로는 조금 모자라요. 가장 가까운 곳은 ${snapshot.cities[priced[0].entry.city].name}, ${fmtMan(priced[0].est.total - state.budget)} 더 필요해요.`;
  $('cards').replaceChildren(...(rows.length ? rows.map(r => card(r.entry, r.est)) : [el('div', { className: 'empty', textContent: '표시할 여행지가 없어요.' })]));
  writeQuery();
}

function bind() {
  $('controls').addEventListener('submit', e => e.preventDefault());
  $('budget').addEventListener('input', () => { const v = Number($('budget').value); if (Number.isFinite(v) && v >= 50 && v <= 5000) { state.budget = Math.round(v) * 10000; render(); } });
  $('people').addEventListener('change', () => { state.people = Number($('people').value); render(); });
  $('pattern').addEventListener('change', () => { state.pattern = $('pattern').value; state.nights = null; fillNights(); render(); });
  $('nights').addEventListener('change', () => { state.nights = Number($('nights').value); render(); });
}

async function start() {
  try {
    const res = await fetch('data/snapshot.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error();
    snapshot = await res.json();
    if (snapshot.version !== 1 || !snapshot.patterns?.length) throw new Error();
  } catch {
    $('summary').textContent = '가격 자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
    return;
  }
  state.pattern = snapshot.patterns[0].id;
  readQuery();
  $('mock').hidden = !snapshot.mock;
  $('asof').textContent = `${stamp(snapshot.generatedAt)} 가격 기준`;
  fillControls(); bind(); render();
}
start();
