// Curated locations, checked against official hotel sources on 2026-10-30.
// Walking times describe the named station only; they are not airport/transit estimates.
export const POLICY=2;
export const CATALOG={
 fukuoka:[
  {id:'fuk-mystays',token:'ChkIh8yIm_3fyPGqARoML2cvMWhoeHJ3MnN6EAE',name:'HOTEL MYSTAYS Fukuoka Tenjin Minami',zone:'텐진 남쪽',station:'텐진미나미역',walk:5,address:'3-14-20 Haruyoshi, Chuo-ku, Fukuoka',source:'https://iconia.co.jp/en-us/location-hotel-mystays-fukuoka-tenjin-minami-fukuoka',privateBath:false,breakfast:'room_only',warning:'2026-12-31까지 인근 공사 안내 · 전용 욕실은 판매 객실별 확인'},
  {id:'fuk-koko',token:'ChoI_ebV7MGG7OKjARoNL2cvMTFnZDIwcTMzXxAB',name:'KOKO HOTEL Hakata Shinkansenguchi',zone:'하카타역 동쪽',station:'JR 하카타역 치쿠시 출구',walk:4,address:'1-17-17 Hakataeki Higashi, Hakata-ku, Fukuoka',source:'https://www.hotelwing.co.jp/hakata-shinkansenguchi/',privateBath:true,breakfast:'complimentary_light',warning:'이전 공식 브랜드 안내 기준 무료 간단 조식 · 현 브랜드 제공 여부 재확인'}
 ],
 osaka:[
  {id:'osa-koko',token:'ChoIx4K-w-7khIuvARoNL2cvMTFwNXhoeHNrMhAB',name:'KOKO HOTEL Osaka Namba Ebisucho',zone:'에비스초',station:'에비스초역',walk:2,address:'5-8-25 Nippombashi, Naniwa-ku, Osaka',source:'https://starasia-reit.com/file/ir_library_term-8db37167d5df4eba90a3f9f50f0e0267247039f5.pdf',privateBath:false,breakfast:'room_only',warning:'난바 중심까지 2분이라는 뜻은 아님 · 전용 욕실은 판매 객실별 확인'},
  {id:'osa-vista',token:'ChoIg8WiyYiPgOSkARoNL2cvMTFmbjBibngxbRAB',name:'Hotel Vista Osaka-namba',zone:'도톤보리 동쪽',station:'닛폰바시역',walk:4,address:'1-1 Soemon-cho, Chuo-ku, Osaka',source:'https://osaka-namba.hotel-vista.jp/en/',roomSource:'https://osaka-namba.hotel-vista.jp/en/rooms',privateBath:true,breakfast:'room_only',warning:'Comfort Double은 18㎡, 욕조 없이 샤워실 제공'}
 ],
 taipei:[
  {id:'tpe-cityinn',token:'ChgIle_Lm_iX5aucARoLL2cvMXRyYzJuNmMQAQ',name:'Cityinn Hotel Plus',zone:'시먼',station:'시먼역 3번 출구',walk:1,address:'No.63 Baoqing Rd., Zhongzheng Dist., Taipei',source:'https://c4.cityinn.com.tw/ja/location-j/',roomSource:'https://c4.cityinn.com.tw/en/about-e/',privateBath:true,breakfast:'none',warning:'호텔 조식 미제공 · 창문 유무는 판매 객실별 확인'},
  {id:'tpe-westgate',token:'ChkInq_q6I7Pqe25ARoML2cvMTF5bDZqMWh5EAE',name:'WESTGATE Hotel',zone:'시먼',station:'시먼역 6번 출구',walk:1,address:'No.150 Section 1 Zhonghua Rd., Wanhua Dist., Taipei',source:'https://www.westgatehotel.com.tw/en/',roomSource:'https://www.westgatehotel.com.tw/en/room-detail/DELUXE_ROOM/',privateBath:true,breakfast:'room_only',warning:'Cozy 객실은 창문 없음 · Deluxe 객실과 동일 조건으로 대체하지 않음'}
 ]
};
export const candidates=city=>(CATALOG[city]||[]).map(({token,...h})=>({...h,policy:POLICY,checkedAt:'2026-10-30'}));
export const findHotel=(city,id)=>CATALOG[city]?.find(h=>h.id===id);
const text=x=>typeof x==='string'?x:'';
export function roomPolicy(hotel,room,rate){
 const name=text(room.name),detail=[name,...(Array.isArray(room.amenities)?room.amenities:[]),...(Array.isArray(rate.inclusions)?rate.inclusions:[])].filter(x=>typeof x==='string').join(' ');
 const reasons=[],warnings=[];
 if(/shared|dorm|capsule|bunk|day.?use/i.test(detail))reasons.push('공용·도미토리·시간제 객실 제외');
 const smoking=/non[ -]?smoking|no smoking/i.test(detail)?'non_smoking':/smoking/i.test(detail)?'smoking':'unknown';
 if(smoking==='smoking')reasons.push('흡연 객실 제외');
 const bath=hotel.privateBath||/private bathroom|en.?suite|private bath/i.test(detail)?'private':'unknown';
 if(bath==='unknown')warnings.push('전용 욕실은 판매처 확인 필요');
 let breakfast='unknown';
 if(hotel.breakfast==='none'&&rate.breakfast_included!==true)breakfast='excluded';
 else if(rate.breakfast_included!==true&&(rate.breakfast_included===false||/room only|no meals|without breakfast/i.test(detail)))breakfast='excluded';
 else if(hotel.breakfast==='complimentary_light'&&rate.breakfast_included===true)breakfast='complimentary_light';
 else if(rate.breakfast_included===true)reasons.push('무료 기본 조식 근거 없는 포함 요금 제외');
 if(breakfast==='unknown'&&!reasons.some(x=>x.includes('조식')))warnings.push('식사 조건 확인 필요 · 외부 아침 식사 예산 유지');
 const bed=/twin/i.test(name)?'twin':/double|queen|king/i.test(name)?'double':'unknown';
 const window=/no window|without window|windowless|cozy/i.test(name)?'none':/with window|window view/i.test(name)?'yes':'unknown';
 const size=name.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|sq\.?\s*m)/i);
 const sizeM2=size?Number(size[1]):hotel.id==='osa-vista'&&/comfort double/i.test(name)?18:hotel.id==='tpe-westgate'&&/deluxe/i.test(name)?20:null;
 const sizeBand=sizeM2===null?'unknown':sizeM2<16?'compact':sizeM2<23?'standard':'large';
 const cancellation=rate.free_cancellation===true?'free':rate.free_cancellation===false?'nonrefundable':'unknown';
 if(smoking==='unknown')warnings.push('금연 여부 확인 필요');
 if(bed==='unknown')warnings.push('침대 구성 확인 필요');
 if(window==='unknown')warnings.push('창문 유무 확인 필요');
 if(sizeM2===null)warnings.push('객실 면적 확인 필요');
 if(cancellation==='unknown')warnings.push('취소 조건 확인 필요');
 return {eligible:reasons.length===0,reasons,warnings,conditionsComplete:warnings.length===0,profile:{bath,smoking,bed,window,sizeM2,sizeBand,breakfast,cancellation},policy:POLICY};
}
export function feePlan(city,inclusive,scope,cityTaxIncluded=false){
 // No arbitrary tax percentages. The known local-tax ceiling is a planning allowance,
 // not a verified extra fee. Never infer that Google's aggregate includes city tax.
 const nights=(Date.parse(scope.checkoutDate)-Date.parse(scope.checkinDate))/86400000;
 const japan=city==='fukuoka'||city==='osaka';
 return {feeReserveKRW:japan&&!cityTaxIncluded?scope.adults*nights*500*10:0,taxStatus:inclusive?'included':'unknown',feeStatus:inclusive?(japan&&!cityTaxIncluded?'allowance':'reported_included'):'details_missing',feeNote:cityTaxIncluded?'판매 요금에 도시 숙박세 포함 명시 · 중복 준비액 없음. 다른 현장 요금은 별도 확인.':japan?'숙박세 포함 여부 미확인: 1인 1박 최대 500엔 × 계획 환율 10원/엔을 별도 준비액으로 표시. 실제 세액·환율이 아니며 포함 확인 시 제거 필요.':inclusive?'제공처가 세금·수수료 포함 총액으로 표시. 별도 현장요금은 예약처에서 확인 필요.':'표시가에 세금·수수료 포함 여부가 없어 추가요금 가능. 미확인 비용을 0원으로 확정하지 않음.',feeSource:city==='fukuoka'?'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/syuku001.html':city==='osaka'?'https://www.pref.osaka.lg.jp/o070070/toshimiryoku/syukuhakuzei/index.html':'',deposit:'환급 보증금·가승인 한도 미확인 (여행 지출과 별도)'};
}
