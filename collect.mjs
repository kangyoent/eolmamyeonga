#!/usr/bin/env node
// 주간 가격 스냅샷 수집.
//   node collect.mjs            조회 계획만 출력 (외부 호출 0회)
//   node collect.mjs --mock     가상 응답으로 스냅샷 생성 (외부 호출 0회)
//   node collect.mjs --live     실제 SerpApi 조회 (유료 한도 사용)
// 옵션: --max-calls N (기본 160) · --cities fukuoka,osaka · --seller-quote (판매처 운임까지, 일정당 +1회)
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { jobs, CITY_INFO, PATTERNS, BASIS, patternDates } from './lib/config.mjs';
import { collectEntry } from './lib/collect-core.mjs';
import { mockProvider } from './lib/mock-provider.mjs';
import { CATALOG } from './lib/stays.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), flag = n => args.includes(n), value = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const mock = flag('--mock'), live = flag('--live'), sellerQuote = flag('--seller-quote');
const maxCalls = Number(value('--max-calls') || 160);
const cityFilter = value('--cities')?.split(',').filter(c => CITY_INFO[c]) || null;
const outPath = value('--out') || join(here, 'site', 'data', 'snapshot.json');
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 1000) { console.error('--max-calls는 1~1000 사이 정수로 지정해 주세요.'); process.exit(2); }
if (mock && live) { console.error('--mock과 --live는 함께 쓸 수 없어요.'); process.exit(2); }

const patternFilter = value('--patterns')?.split(',') || null; // 예: --patterns w4-fri-3n
const now = Date.now(), list = jobs(now, cityFilter).filter(j => !patternFilter || patternFilter.includes(j.patternId));
if (!list.length) { console.error('조건에 맞는 일정이 없어요.'); process.exit(2); }
// 항공 2회(판매처 운임 포함 시 3회) + 숙소: 위치 확인 후보가 있으면 1회, 없으면 권역 검색 1회 + 상세 1회.
const flightCalls = sellerQuote ? 3 : 2, expected = list.reduce((n, j) => n + flightCalls + (CATALOG[j.city]?.length ? 1 : 2), 0);
const worst = list.reduce((n, j) => n + flightCalls + (CATALOG[j.city]?.length ? 5 : 3), 0);
console.log(`일정 ${list.length}개 · 예상 ${expected}회 (숙소 재시도 포함 최악 ${worst}회) · 상한 ${maxCalls}회`);
if (!mock && !live) { for (const j of list) console.log(`  ${CITY_INFO[j.city].name} ${j.scope.departureDate}~${j.scope.returnDate}`); console.log('계획만 출력했어요. 실제 조회는 --live, 가상 데이터는 --mock.'); process.exit(0); }

function readKey() {
  if (process.env.SERPAPI_API_KEY) return process.env.SERPAPI_API_KEY.trim();
  const file = join(here, '.env.local');
  if (!existsSync(file)) return '';
  return (readFileSync(file, 'utf8').match(/^SERPAPI_API_KEY=(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
}
const apiKey = mock ? 'mock' : readKey();
if (!apiKey) { console.error('SERPAPI_API_KEY가 없어요. snapshot-site/.env.local에 SERPAPI_API_KEY=... 한 줄을 넣어 주세요.'); process.exit(2); }

const env = { fetcher: mock ? mockProvider().fetcher : fetch, apiKey, budget: { used: 0, max: maxCalls }, sellerQuote };
const entries = [];
for (const job of list) {
  const entry = await collectEntry(job, env);
  const state = entry.flight && entry.hotel ? '완료' : entry.flight || entry.hotel ? '일부' : '실패';
  console.log(`  [${state}] ${CITY_INFO[job.city].name} ${job.scope.departureDate} · 누적 ${env.budget.used}회`);
  const stopped = entry.stopped; delete entry.stopped; entries.push(entry);
  if (stopped) { console.log('  한도 또는 인증 문제로 남은 일정을 건너뜁니다.'); break; }
}

const snapshot = {
  version: 1, mock, generatedAt: new Date().toISOString(), basis: { ...BASIS, rooms: 1 }, callsUsed: env.budget.used,
  cities: Object.fromEntries(Object.entries(CITY_INFO).filter(([id]) => entries.some(e => e.city === id))),
  patterns: PATTERNS.filter(p => entries.some(e => e.patternId === p.id)).map(p => ({ id: p.id, label: p.label, nights: p.nights, group: p.group, ...patternDates(p, now) })),
  entries,
};
const text = JSON.stringify(snapshot, null, 1);
if (text.includes(apiKey) && !mock) { console.error('결과에 키가 포함되어 저장을 중단했어요.'); process.exit(1); }
const complete = entries.filter(e => e.flight && e.hotel).length;
mkdirSync(dirname(outPath), { recursive: true });
// 절반 미만만 성공한 수집은 기존 스냅샷을 덮어쓰지 않는다.
if (complete * 2 < list.length) {
  const failed = outPath.replace(/\.json$/, '.failed.json'); writeFileSync(failed, text);
  console.error(`완료 ${complete}/${list.length}개라 기존 스냅샷을 유지했어요. 결과는 ${failed}`); process.exit(1);
}
writeFileSync(outPath + '.tmp', text); renameSync(outPath + '.tmp', outPath);
console.log(`저장: ${outPath} · 완료 ${complete}/${list.length} · 외부 조회 ${mock ? 0 : env.budget.used}회${mock ? ' (가상 데이터)' : ''}`);
