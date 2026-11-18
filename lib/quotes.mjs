import {CATALOG,candidates,findHotel,roomPolicy,feePlan} from './stays.mjs';
// Only normalized quotes leave this module. Never return upstream errors or URLs containing keys.
export const CITIES={
 fukuoka:{name:'후쿠오카',airport:'FUK',query:'Fukuoka Tenjin hotels',zone:'텐진·하카타 도심',center:[33.5902,130.4017],radius:6},
 osaka:{name:'오사카',airport:'KIX',query:'Osaka Namba hotels',zone:'난바 도심',center:[34.666,135.501],radius:5},
 taipei:{name:'타이베이',airport:'TPE',query:'Taipei Ximending hotels',zone:'시먼·타이베이 도심',center:[25.042,121.508],radius:5},
 tokyo:{name:'도쿄',airport:'NRT',query:'Tokyo Shinjuku hotels',zone:'신주쿠 주변',center:[35.6938,139.7034],radius:5},
 danang:{name:'다낭',airport:'DAD',query:'Da Nang My Khe hotels',zone:'미케 해변·도심',center:[16.0544,108.2448],radius:5},
 nhatrang:{name:'나트랑',airport:'CXR',query:'Nha Trang beach hotels',zone:'나트랑 시내 해변',center:[12.2416,109.1967],radius:5},
 bangkok:{name:'방콕',airport:'BKK',query:'Bangkok Sukhumvit Asok hotels',zone:'아속·수쿰윗 주변',center:[13.738,100.56],radius:6},
 paris:{name:'파리',airport:'CDG',query:'Paris city centre hotels',zone:'파리 중심부',center:[48.8566,2.3522],radius:6,minNights:7},
 losangeles:{name:'로스앤젤레스',airport:'LAX',query:'Los Angeles Hollywood hotels',zone:'할리우드 주변',center:[34.0928,-118.3287],radius:10,minNights:7}
};
// Explicit app search-area anchors; straight-line distances are not walking/transit times.
export function distanceKm(a,b){const rad=x=>x*Math.PI/180,dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);const h=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
function discoveredHotel(h,city){
 const c=CITIES[city],g=h.gps_coordinates,lat=g?.latitude,lon=g?.longitude;
 if(h.type!=='hotel'||typeof h.property_token!=='string'||h.property_token.length>18000||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||/dorm|capsule|hostel|love hotel|hourly/i.test(h.name||''))return null;
 const distance=distanceKm(c.center,[lat,lon]);if(distance>c.radius||(typeof h.overall_rating==='number'&&h.overall_rating<3.5))return null;
 return {id:h.property_token,name:str(h.name),zone:c.zone,station:'도심 기준점에서 직선 '+distance.toFixed(1)+'km',walk:null,privateBath:false,breakfast:'room_only',source:'https://www.google.com/maps/search/?api=1&query='+lat+','+lon,warning:'도심 기준 반경 '+c.radius+'km 안의 검색 후보 · 직선거리는 실제 이동거리와 달라요. 욕실·조식은 객실별 확인.',location:{latitude:lat,longitude:lon,distanceKm:Number(distance.toFixed(2))}};
}

export const CACHE_MS=10*60*1000;
export const TOTAL_LIMIT=408; // Paid Starter confirmed 2026-11-06; approved +200 attempts, hourly cap unchanged.
// Explicit user approval: 2026-11-06, one hour only; cumulative cap stays 200.
export const PILOT_BOOST_UNTIL=Date.parse('2026-11-06T13:07:32Z');
export const hourlyLimit=now=>now>=Date.parse('2026-11-06T12:07:32Z')&&now<PILOT_BOOST_UNTIL?80:40;
export class QuoteError extends Error { constructor(code,message,status=400){super(message);this.code=code;this.status=status;} }
const fail=(code,message,status)=>{throw new QuoteError(code,message,status)};
const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=100000000?Math.round(x):null;
const str=x=>typeof x==='string'?x.slice(0,350):'';
const list=x=>Array.isArray(x)?x:[];
export function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!/serpapi\.com$/i.test(u.hostname)&&!/(api[_-]?key|access[_-]?token)=/i.test(u.search)?u.href:null}catch{return null}}
// Only Google's documented flight handoff endpoint may receive opaque POST data.
export function safeBookingRequest(value){
 if(!value||value.url!=='https://www.google.com/travel/clk/f'||typeof value.post_data!=='string'||value.post_data.length>70000)return null;
 const fields=[...new URLSearchParams(value.post_data)].map(([name,value])=>({name,value}));
 return fields.length===1&&fields[0].name==='u'&&fields[0].value.length>0&&fields[0].value.length<=50000?{url:value.url,fields}:null;
}
export function validateScope(s,now=Date.now()){
 if(!s||!Object.hasOwn(CITIES,s.city)||!Number.isInteger(s.adults)||s.adults<1||s.adults>4)fail('conditions','9개 여행지, 성인 1~4명, 인원에 맞는 객실 1개를 검색해요.');
 const out={city:s.city,adults:s.adults};
 for(const key of ['departureDate','returnDate','checkinDate','checkoutDate']){
  const v=s[key];if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('dates','항공·숙박 날짜 네 개를 정확히 입력해 주세요.');out[key]=v;
 }
 const start=Date.parse(out.departureDate),end=Date.parse(out.returnDate),today=Date.parse(new Date(now+9*3600000).toISOString().slice(0,10));
 if(start<today||start>today+330*86400000||end-start<2*86400000||end-start>10*86400000||out.checkinDate<out.departureDate||out.checkoutDate>out.returnDate||out.checkoutDate<=out.checkinDate)fail('dates','오늘 이후 330일 이내, 2~10박 여행으로 설정해 주세요. 숙박은 여행 기간 안에 있어야 해요.');
 if(CITIES[s.city].minNights&&(Date.parse(out.checkoutDate)-Date.parse(out.checkinDate))/86400000<CITIES[s.city].minNights)fail('duration','파리·LA는 현지 숙박 7박 이상으로 검색해 주세요.');
 return out;
}
export function parameters(kind,s,token,hotelId){
 const common={currency:'KRW',hl:'en',gl:'kr',adults:String(s.adults),no_cache:'true'};
 if(['departures','returns','booking'].includes(kind))return {...common,engine:'google_flights',departure_id:'ICN',arrival_id:CITIES[s.city].airport,type:'1',outbound_date:s.departureDate,return_date:s.returnDate,travel_class:'1',stops:'1',deep_search:'true',...(kind==='returns'?{departure_token:token}:kind==='booking'?{booking_token:token}:{})};
 if(kind==='discoverHotels')return {...common,engine:'google_hotels',check_in_date:s.checkinDate,check_out_date:s.checkoutDate,children:'0',q:CITIES[s.city].query};
 if(kind==='customerHotel'){if(typeof token!=='string'||!token)fail('hotel','검색에서 선택한 숙소가 필요해요.');return {...common,engine:'google_hotels',check_in_date:s.checkinDate,check_out_date:s.checkoutDate,children:'0',property_token:token};}
 if(kind==='budgetHotel'){const hotel=findHotel(s.city,hotelId||CATALOG[s.city]?.[0]?.id);if(!hotel)fail('hotel','이 도시의 확인된 숙소 후보만 조회할 수 있어요.');return {...common,engine:'google_hotels',check_in_date:s.checkinDate,check_out_date:s.checkoutDate,children:'0',property_token:hotel.token};}
 if(['hotels','hotel'].includes(kind))return {...common,engine:'google_hotels',check_in_date:s.checkinDate,check_out_date:s.checkoutDate,children:'0',...(kind==='hotel'?{property_token:token}:{q:CITIES[s.city].query})};
 fail('operation','지원하지 않는 조회입니다.');
}
function checkResponse(raw,p){
 if(raw?.error||raw?.search_metadata?.status!=='Success')fail('provider','가격 제공처에서 정상 결과를 받지 못했어요. 잠시 뒤 다시 확인해 주세요.',502);
 const actual=raw.search_parameters||{};
 for(const k of ['currency','adults','children','departure_id','arrival_id','type','outbound_date','return_date','check_in_date','check_out_date','property_token'])if(p[k]!==undefined&&String(actual[k])!==String(p[k]))fail('mismatch','응답의 날짜·인원·통화가 요청과 달라 가격을 표시하지 않았어요.',502);
}
function segments(x){return list(x?.flights).map(f=>({number:str(f.flight_number),airline:str(f.airline),from:str(f.departure_airport?.id),to:str(f.arrival_airport?.id),departure:str(f.departure_airport?.time),arrival:str(f.arrival_airport?.time)}));}
function validLeg(leg,from,to,date){return leg.length===1&&leg[0].from===from&&leg[0].to===to&&leg[0].departure.slice(0,10)===date&&!!leg[0].number;}
export function normalize(kind,raw,s,p,now=Date.now(),selectedHotel=null){
 checkResponse(raw,p);
 if(['budgetHotel','customerHotel'].includes(kind)&&raw.property_token!==p.property_token)fail('hotel_identity','조회된 숙소 식별자가 달라 가격 반영을 보류했어요.',502);
 const meta=raw.search_metadata||{},time=Date.parse(meta.processed_at||meta.created_at);
 if(!Number.isFinite(time)||time>now+300000||now-time>CACHE_MS)fail('stale','가격 수집 시각을 확인할 수 없거나 오래된 응답이라 표시하지 않았어요.',502);
 const base={source:'SerpApi · Google Travel',verificationStage:'search_only',currency:'KRW',observedAt:new Date(time).toISOString(),retrievedAt:new Date(now).toISOString(),scope:s,searchId:str(meta.id),cached:false};
 const googleURL=safeURL(meta.google_flights_url||meta.google_hotels_url);
 if(kind==='departures'||kind==='returns'){
  const returning=kind==='returns';
  return {...base,kind,googleURL,...(returning?{selectedOutbound:segments(list(raw.selected_flights)[0])}:{}),options:[...list(raw.best_flights),...list(raw.other_flights)].map(f=>({segments:segments(f),price:amount(f.price),token:f[returning?'booking_token':'departure_token'],notes:list(f.extensions).map(str)})).filter(f=>f.price&&typeof f.token==='string'&&f.token.length<18000&&validLeg(f.segments,returning?CITIES[s.city].airport:'ICN',returning?'ICN':CITIES[s.city].airport,returning?s.returnDate:s.departureDate)).sort((a,b)=>a.price-b.price).slice(0,12)};
 }
 if(kind==='booking'){
  const legs=list(raw.selected_flights).map(segments);
  if(legs.length!==2||!validLeg(legs[0],'ICN',CITIES[s.city].airport,s.departureDate)||!validLeg(legs[1],CITIES[s.city].airport,'ICN',s.returnDate))fail('itinerary','선택한 왕복 여정의 편명·날짜를 확인할 수 없어 가격을 보류했어요.',502);
  return {...base,kind,googleURL,legs,separateTickets:list(raw.booking_options).some(x=>!!x.separate_tickets),options:list(raw.booking_options).filter(x=>!x.separate_tickets&&x.together).map(x=>({supplier:str(x.together.book_with),airline:x.together.airline===true,amount:amount(x.together.price),notes:[...list(x.together.extensions),...list(x.together.baggage_prices),...list(raw.baggage_prices?.together)].map(str),baggage:'판매처에서 무게·개수 재확인',mandatoryFees:'검색 표시가 기준 · 최종 결제 수수료 미확인',refund:'판매처 재확인',fare:str(x.together.option_title),link:safeURL(x.together.link),bookingRequest:safeBookingRequest(x.together.booking_request)})).filter(x=>x.amount&&x.supplier).sort((a,b)=>Number(b.airline)-Number(a.airline)||a.amount-b.amount).slice(0,12)};
 }
 if(kind==='discoverHotels'){
  const rows=list(raw.properties).length?raw.properties:raw.property_token?[raw]:[];
  return {...base,kind,googleURL,options:rows.map(h=>{const hotel=discoveredHotel(h,s.city);return hotel?{name:str(h.name),token:h.property_token,hotel,amount:amount(h.total_rate?.extracted_after_taxes_fees)||amount(h.total_rate?.extracted_display_price),rating:amount(h.overall_rating),link:safeURL(h.link)}:null;}).filter(Boolean).sort((a,b)=>(a.amount||Infinity)-(b.amount||Infinity)).slice(0,8)};
 }
 if(kind==='hotels')return {...base,kind,googleURL,options:list(raw.properties).filter(h=>h.type==='hotel'&&typeof h.property_token==='string').slice(0,8).map(h=>({name:str(h.name),token:h.property_token,amount:amount(h.total_rate?.extracted_after_taxes_fees),rating:amount(h.overall_rating),link:safeURL(h.link)}))};
 const curated=CATALOG[s.city]?.find(h=>h.token===p.property_token)||(kind==='customerHotel'?selectedHotel:null);
 const hotel=curated?(candidates(s.city).find(h=>h.id===curated.id)||selectedHotel):null;
 const options=[],offers=[],detailedSuppliers=new Set();
 const diagnostics={roomRates:0,propertyPrices:0,missingTotal:0,guestMismatch:0,unsafeLink:0,conditionalRate:0,policyExcluded:0,acceptedRoomRates:0,acceptedPropertyPrices:0};
 // Google sometimes supplies only `prices`, without `featured_prices.rooms`.
 // Keep these exact-stay seller quotes distinct from identified room rates.
 for(const source of list(raw.featured_prices))for(const room of list(source.rooms)){
  if(str(room.name))detailedSuppliers.add(str(source.source).trim().toLowerCase());
  const rates=list(room.rates);
  for(const rate of rates.length?rates:room.total_rate?[room]:[])offers.push({source,room,rate,level:'room'});
 }
 for(const source of [...list(raw.prices),...list(raw.featured_prices).filter(x=>!list(x.rooms).length)]){
  if(detailedSuppliers.has(str(source.source).trim().toLowerCase()))continue;
  offers.push({source,room:{name:'객실명은 예약처에서 확인'},rate:source,level:'property'});
 }
 const seen=new Set();
 for(const {source,room,rate,level} of offers){
  diagnostics[level==='room'?'roomRates':'propertyPrices']++;
  const inclusive=amount(rate.total_rate?.extracted_after_taxes_fees);
  const total=inclusive||(['budgetHotel','customerHotel'].includes(kind)?amount(rate.total_rate?.extracted_display_price):null),capacity=rate.num_guests??room.num_guests;
  if(!total){diagnostics.missingTotal++;continue;}
  if(!Number.isInteger(capacity)||capacity<s.adults||(rate.num_guests!==undefined&&rate.num_guests!==s.adults)||(level==='property'&&capacity!==s.adults)){diagnostics.guestMismatch++;continue;}
  const link=safeURL(rate.link||room.link||source.link);
  if(!link){diagnostics.unsafeLink++;continue;}
  const restricted=[...list(source.discount_remarks),...list(room.discount_remarks),...list(rate.discount_remarks)].some(x=>typeof x==='string'&&/member|sign[ -]?in|log[ -]?in|mobile[ -]?only|app[ -]?only|coupon/i.test(x));
  if(restricted){diagnostics.conditionalRate++;continue;}
  const policy=curated?roomPolicy(curated,room,rate):{eligible:false,reasons:['위치·객실 정책이 확인된 후보가 아니에요.'],profile:{},warnings:[],policy:2};
  if(!policy.eligible)diagnostics.policyExcluded++;
  if(level==='property'){
   policy.conditionsComplete=false;
   policy.warnings=['선택한 날짜·인원의 판매처 숙박 총액이에요. 객실명·침대 구성·재고는 예약처에서 확인해 주세요.',...policy.warnings];
  }
  const cityTaxIncluded=list(rate.inclusions).some(x=>typeof x==='string'&&/^(?:city|accommodation|lodging) tax(?:es)? included$/i.test(x.trim()));
  const fees=feePlan(s.city,inclusive,s,cityTaxIncluded);
  const row={...fees,...policy,hotel,name:str(raw.name),room:str(room.name),quoteLevel:level,supplier:str(source.source),amount:total,capacity,link,breakfast:typeof rate.breakfast_included==='boolean'?rate.breakfast_included:null,cancellation:typeof rate.free_cancellation==='boolean'?rate.free_cancellation:null,cancelUntil:[str(rate.free_cancellation_until_date),str(rate.free_cancellation_until_time)].filter(Boolean).join(' '),notes:list(rate.inclusions).map(str),mandatoryFees:inclusive?'검색에 제공된 세금·수수료 포함':'세금 포함 여부 미확인 · 별도 준비금 적용',payAtPropertyFees:'현장 세금·추가요금 미확인'};
  if(!row.name||!row.room||!row.supplier)continue;
  const identity=JSON.stringify([row.supplier,row.room,row.amount,row.link]);if(seen.has(identity))continue;seen.add(identity);
  if(row.eligible)diagnostics[level==='room'?'acceptedRoomRates':'acceptedPropertyPrices']++;
  options.push(row);
 }
 const emptyReason=options.some(x=>x.eligible)?null:!offers.length?'제공처 응답에 판매 요금이 없어요. 매진으로 확정한 것은 아니에요.':diagnostics.policyExcluded?'받은 요금 중 조식·흡연 등 선택 조건에 맞는 상품이 없어요.':'요금은 받았지만 전체 숙박 금액·인원·예약 링크를 함께 확인하지 못했어요.';
 return {...base,kind,name:str(raw.name),googleURL,diagnostics,emptyReason,options:options.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(a.quoteLevel==='property')-Number(b.quoteLevel==='property')||Number(b.taxStatus==='included')-Number(a.taxStatus==='included')||(a.warnings?.length||0)-(b.warnings?.length||0)||a.amount-b.amount).slice(0,10)};
}
const encoder=new TextEncoder();
const b64=x=>btoa(String.fromCharCode(...x)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function unb64(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));}
async function hmac(key){return crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signContext(data,key){const payload=b64(encoder.encode(JSON.stringify(data)));const sig=await crypto.subtle.sign('HMAC',await hmac(key),encoder.encode(payload));return payload+'.'+b64(new Uint8Array(sig));}
export async function verifyContext(value,key,kind,scope,now=Date.now()){
 try{if(typeof value!=='string'||value.length>30000)throw 0;const [p,s,...rest]=value.split('.');if(rest.length||!await crypto.subtle.verify('HMAC',await hmac(key),unb64(s),encoder.encode(p)))throw 0;const v=JSON.parse(new TextDecoder().decode(unb64(p)));if(v.kind!==kind||JSON.stringify(v.scope)!==JSON.stringify(scope)||v.expires<now)throw 0;return v;}catch{fail('selection','선택 결과가 만료됐거나 여행 조건이 바뀌었어요. 첫 검색부터 다시 진행해 주세요.');}
}
// Reuse only a previously successful property's identity, never its stored price.
// Each selected property still requires a new exact-date/guest provider request.
export async function previousProperties(env,scope){
 const rows=await env.DB.prepare("SELECT payload FROM quote_cache WHERE json_extract(payload, '$.kind') = 'customerHotel' AND json_extract(payload, '$.scope.city') = ? AND json_extract(payload, '$.scope.adults') = ? AND json_extract(payload, '$.options[0].eligible') = 1 ORDER BY expires DESC LIMIT 6").bind(scope.city,scope.adults).all();
 const found=[];
 for(const row of rows.results||[])try{const d=JSON.parse(row.payload),h=d.options?.find(x=>x.eligible)?.hotel;if(!h?.location||typeof h.id!=='string')continue;
  const checked=discoveredHotel({type:'hotel',property_token:h.id,name:h.name,gps_coordinates:{latitude:h.location.latitude,longitude:h.location.longitude}},scope.city);
  if(checked&&!found.some(x=>x.token===checked.id))found.push({name:checked.name,token:checked.id,hotel:checked,basis:'property_identity_only_fresh_rate_required'});
 }catch{}return found.slice(0,2);
}
export async function quotaStatus(env,now=Date.now()){
 const row=await env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS hourUsed FROM search_attempts').bind(now-3600000).first();
 if(!Number.isFinite(row?.total))return null;
 return {total:row.total,limit:TOTAL_LIMIT,remaining:Math.max(0,TOTAL_LIMIT-row.total),hourUsed:row.hourUsed||0,hourLimit:hourlyLimit(now)};
}
async function runSearchCore(body,env,fetcher=fetch,now=Date.now()){
 const scope=validateScope(body.scope,now),kind=body.kind;
 let context=null;
 if(['returns','booking','hotel','customerHotel'].includes(kind))context=await verifyContext(body.selection,env.SERPAPI_API_KEY,kind,scope,now);
 const p=parameters(kind,scope,context?.token,body.hotelId);
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify({normalizer:18,parameters:p,scope}))),key=b64(new Uint8Array(digest));
 const cached=body.fresh===true?null:await env.DB.prepare('SELECT payload FROM quote_cache WHERE key = ? AND expires > ?').bind(key,now).first();
 if(cached)return {...JSON.parse(cached.payload),cached:true};
 // A single conditional INSERT makes the pilot cap durable and atomic across workers.
 const reserve=await env.DB.prepare('INSERT INTO search_attempts (id, at, operation) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM search_attempts) < 408 AND (SELECT COUNT(*) FROM search_attempts WHERE at > ?) < ?').bind(crypto.randomUUID(),now,kind,now-3600000,hourlyLimit(now)).run();
 if(!reserve.meta?.changes){const q=await quotaStatus(env,now);if(q?.remaining===0)fail('pilot_total','이번 검증의 누적 '+TOTAL_LIMIT+'회를 모두 사용했어요. 새 가격 검색은 중지되며, 시간이 지나도 자동으로 재개되지 않아요.',429);fail('quota','최근 1시간 조회 한도 '+hourlyLimit(now)+'회에 도달했어요. 기존 결과는 볼 수 있고, 시간이 지난 뒤 새 조회를 다시 시도할 수 있어요.',429);}
 const url=new URL('https://serpapi.com/search.json');for(const [k,v]of Object.entries({...p,api_key:env.SERPAPI_API_KEY}))url.searchParams.set(k,v);
 let raw;
 try{const response=await fetcher(url,{signal:AbortSignal.timeout(55000),redirect:'manual'});if(!response.ok)fail(response.status===429?'provider_quota':'provider','가격 제공처 조회를 완료하지 못했어요. 키·무료 잔여 횟수 또는 연결 상태를 확인해 주세요.',response.status===429?429:502);raw=await response.json();}catch(e){if(e instanceof QuoteError)throw e;console.error('serpapi_fetch_failed',JSON.stringify({name:e?.name==='TimeoutError'?'TimeoutError':'NetworkError',code:['ENOTFOUND','ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(e?.cause?.code)?e.cause.code:'unclassified'}));fail('network','조회 시간이 초과됐거나 연결되지 않았어요. 자동 재시도는 하지 않아요.',502);}
 const data=normalize(kind,raw,scope,p,Date.now(),context?.hotel);
 if(body.fresh===true&&Date.parse(data.observedAt)<now-120000)fail('stale','새 조회 요청보다 오래된 가격을 받아 다시 확인이 필요해요.',502);
 data.requestedAt=new Date(now).toISOString();data.freshRequest=body.fresh===true;
 if(kind==='discoverHotels'){const previous=await previousProperties(env,scope),seen=new Set();data.options=[...previous,...data.options].filter(x=>{if(seen.has(x.token))return false;seen.add(x.token);return true;}).slice(0,8);}
 if(kind==='returns'&&context?.outbound){data.outbound=context.outbound;data.roundtripEstimate=JSON.stringify(data.selectedOutbound)===JSON.stringify(context.outbound);delete data.selectedOutbound;}
 if(kind==='booking'&&context?.outbound){if(JSON.stringify(data.legs[0])!==JSON.stringify(context.outbound)||JSON.stringify(data.legs[1])!==JSON.stringify(context.returning))fail('itinerary','선택한 편명과 판매처 여정이 달라 가격을 보류했어요.',502);}
 for(const row of data.options||[])if(row.token){const next={departures:'returns',returns:'booking',hotels:'hotel',discoverHotels:'customerHotel'}[kind];row.selection=await signContext({kind:next,scope,token:row.token,expires:now+20*60000,...(kind==='discoverHotels'?{hotel:row.hotel}:{}),...(kind==='departures'?{outbound:row.segments}:kind==='returns'?{outbound:context?.outbound,returning:row.segments}: {})},env.SERPAPI_API_KEY);delete row.token;}
 await env.DB.prepare('INSERT INTO quote_cache (key, expires, payload) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires, payload=excluded.payload').bind(key,Math.min(now+CACHE_MS,Date.parse(data.observedAt)+CACHE_MS),JSON.stringify(data)).run();
 return data;
}
// Customer requests share a durable lease across Worker instances. Only the lease
// owner can spend a provider request. Completed prices keep their original timestamp.
export const REUSE_MS=120000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function recent(data,now){const t=Date.parse(data?.observedAt);return Number.isFinite(t)&&t<=now+300000&&now-t<=REUSE_MS;}
export async function runSearch(body,env,fetcher=fetch,now=Date.now()){
 const usage={providerCalls:0,billableSearches:0,unknownCharges:0,reusedRequests:0};
 const metered=async(...args)=>{
  usage.providerCalls++;usage.unknownCharges++;
  const response=await fetcher(...args);
  if(!response.ok){usage.unknownCharges--;return response;}
  try{const d=await response.clone().json();if(d.search_metadata?.status==='Success'){usage.billableSearches++;usage.unknownCharges--;}else if(d.error||d.search_metadata?.status==='Error')usage.unknownCharges--;}catch{}
  return response;
 };
 const report=async(code)=>{
  // Counters only: no API key, provider selection token, or personal booking details.
  if(body.dedupe!==true)return;
  try{await env.DB.prepare('INSERT INTO search_events (id, search_id, at, operation, provider_calls, billable_searches, unknown_charges, reused_requests, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),/^[a-zA-Z0-9-]{1,80}$/.test(body.searchId||'')?body.searchId:null,Date.now(),String(body.kind||'').slice(0,30),usage.providerCalls,usage.billableSearches,usage.unknownCharges,usage.reusedRequests,code).run();}catch{console.error('search_metrics_write_failed');}
 };
 let lease=null;
 try{
  if(body.dedupe===true){
   const scope=validateScope(body.scope,now),kind=body.kind;
   const context=['returns','booking','hotel','customerHotel'].includes(kind)?await verifyContext(body.selection,env.SERPAPI_API_KEY,kind,scope,now):null;
   const params=parameters(kind,scope,context?.token,body.hotelId);
   const key=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify({v:2,scope,params})))));
   const read=()=>env.DB.prepare('SELECT owner, expires, payload FROM query_runs WHERE key = ?').bind(key).first();
   const unpack=(row,reason)=>{
    const saved=JSON.parse(row.payload);usage.reusedRequests=1;
    if(saved.error)throw new QuoteError(saved.error.code,saved.error.message,saved.error.status);
    return {...saved.data,cached:true,freshRequest:false,reuseReason:reason,reuseWindowMs:REUSE_MS};
   };
   const old=await read();
   if(old?.payload&&old.expires>now&&body.forceRefresh!==true){
    const saved=JSON.parse(old.payload);
    if(saved.error||recent(saved.data,now)){const data=unpack(old,'recent');await report('reused');return {...data,usage};}
   }
   const owner=crypto.randomUUID();
   const won=await env.DB.prepare('INSERT INTO query_runs (key, owner, expires, payload) VALUES (?, ?, ?, NULL) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner, expires=excluded.expires, payload=NULL WHERE query_runs.expires <= ? OR (query_runs.payload IS NOT NULL AND query_runs.owner = ? AND ? = 1)').bind(key,owner,now+90000,now,old?.owner||'',body.forceRefresh===true?1:0).run();
   if(!won.meta?.changes){
    for(let i=0;i<85;i++){
     const row=await read();
     if(row?.payload){const saved=JSON.parse(row.payload);if(row.expires>Date.now()&&(saved.error||recent(saved.data,Date.now()))){const data=unpack(row,'concurrent');await report('shared');return {...data,usage};}}
     if(!row||row.expires<=Date.now())break;
     await pause(700);
    }
    fail('in_progress','같은 조건의 조회가 진행 중이에요. 잠시 뒤 다시 확인해 주세요. 중복 요청은 보내지 않았어요.',409);
   }
   lease={key,owner};
  }
  const data=await runSearchCore(lease?{...body,fresh:true}:body,env,metered,now);
  if(lease)await env.DB.prepare('UPDATE query_runs SET payload = ?, expires = ? WHERE key = ? AND owner = ?').bind(JSON.stringify({data}),Math.min(Date.now()+REUSE_MS,Date.parse(data.observedAt)+REUSE_MS),lease.key,lease.owner).run();
  await report('ok');return {...data,usage};
 }catch(e){
  const error=e instanceof QuoteError?e:new QuoteError('server','조회 준비 중 오류가 생겼어요. 잠시 뒤 다시 확인해 주세요.',500);
  if(lease)try{await env.DB.prepare('UPDATE query_runs SET payload = ?, expires = ? WHERE key = ? AND owner = ?').bind(JSON.stringify({error:{code:error.code,message:error.message,status:error.status}}),Date.now()+5000,lease.key,lease.owner).run();}catch{}
  await report(error.code);error.usage=usage;throw error;
 }
}
export async function handleRequest(request,env,fetcher=fetch){
 const response=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 const user=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase(),allowed=env.SERPAPI_OWNER_EMAIL?.trim().toLowerCase();
 if(!allowed||!user||user!==allowed)return response({code:'owner_only',message:'현재 실제 가격 조회는 운영자 계정으로 로그인한 경우에만 사용할 수 있어요.'},403);
 if(request.method==='GET')return response({quota:env.DB?await quotaStatus(env):null,cities:Object.entries(CITIES).map(([id,c])=>({id,name:c.name,airport:c.airport,minNights:c.minNights||2,zone:c.zone})),hotels:Object.fromEntries(Object.keys(CITIES).map(city=>[city,candidates(city)])),ready:!!env.SERPAPI_API_KEY&&!!env.DB,message:env.SERPAPI_API_KEY?'가격 조회 연결 준비됨 · 판매처 최종 가격 별도 확인':'API 키 등록 대기 · 실제 조회는 아직 시작하지 않았어요.'});
 if(request.method!=='POST')return response({message:'지원하지 않는 요청'},405);
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return response({message:'사이트 안에서 다시 조회해 주세요.'},403);
 if(!env.SERPAPI_API_KEY||!env.DB)return response({code:'setup_required',message:'API 키 등록 대기 · 아직 실제 가격을 조회하지 않았어요.'},503);
 try{const text=await request.text();if(text.length>40000)fail('size','조회 요청이 너무 큽니다.',413);let body;try{body=JSON.parse(text)}catch{fail('format','조회 조건을 다시 입력해 주세요.');}return response(await runSearch(body,env,fetcher));}catch(e){return response({code:e instanceof QuoteError?e.code:'server',message:e instanceof QuoteError?e.message:'조회 준비 중 오류가 생겼어요. 잠시 뒤 다시 확인해 주세요.',usage:e.usage||{providerCalls:0,billableSearches:0,unknownCharges:0,reusedRequests:0}},e instanceof QuoteError?e.status:500);}
}
