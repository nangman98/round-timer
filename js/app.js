/* 라운드 타이머 — 빌드 없이 동작하는 단일 스크립트. 구조 설명은 CLAUDE.md 참고. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const uid=()=>"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ---------- data ---------- */
const KEY="round-timer.v1";
/* 소리 선택지: 카운트다운(구간 마지막 N초) / 라운드 시작·끝. 파일은 sounds/cd-<키>.m4a, sounds/<키>-phase|finish.m4a */
const CD=[["rec","삐 (녹음)"],["beep","띠 (전자음)"],["high","띡 (높은음)"],["wood","딱 (우드블록)"],["whistle","호루라기"]];
const CDLEN=[["3","3초"],["5","5초"],["10","10초"]];
const BELL=[["real","시작 땡 · 끝 땡땡땡"],["real3","땡땡땡 (복싱 벨)"],["real1","땡 (복싱 벨)"],["synth","땡땡땡 (합성음)"],["beep","삐- (전자음)"],["whistle","호루라기"]];
const LIMITS={prepare:[0,600],work:[1,3600],rest:[0,3600],rounds:[1,99],cycles:[1,20],cycleRest:[0,3600],cooldown:[0,3600]};
const PRESETS=[
  {name:"스파링 5분",prepare:10,work:300,rest:60,rounds:6,cycles:1,cycleRest:0,cooldown:0},
  {name:"스파링 6분",prepare:10,work:360,rest:60,rounds:5,cycles:1,cycleRest:0,cooldown:0},
  {name:"드릴 3분",prepare:10,work:180,rest:20,rounds:5,cycles:1,cycleRest:0,cooldown:0},
  {name:"타바타",prepare:10,work:20,rest:10,rounds:8,cycles:1,cycleRest:0,cooldown:0}
];
function normW(w){
  const o={id:w&&w.id||uid(),name:String(w&&w.name||"새 운동").slice(0,40)};
  for(const k in LIMITS){const n=Math.round(Number(w&&w[k]));o[k]=clamp(isFinite(n)?n:LIMITS[k][0],LIMITS[k][0],LIMITS[k][1]);}
  return o;
}
function normalize(d){
  d=d&&typeof d==="object"?d:{};
  const s=d.settings||{};
  return{
    workouts:Array.isArray(d.workouts)?d.workouts.map(normW):PRESETS.map(normW),
    history:Array.isArray(d.history)?d.history.filter(h=>h&&h.at).slice(0,80).map(h=>({at:+h.at,name:String(h.name||"").slice(0,40),ms:+h.ms||0,done:!!h.done})):[],
    settings:{sound:s.sound!==false,voice:s.v>=3?s.voice===true:false,flash:s.flash!==false,warn:s.warn!==false,
      cd:CD.some(o=>o[0]===s.cd)?s.cd:"rec",cdLen:CDLEN.some(o=>o[0]===s.cdLen)?s.cdLen:"10",bell:s.v>=5&&BELL.some(o=>o[0]===s.bell)?s.bell:"real",v:5},
    updatedAt:+d.updatedAt||0
  };
}
function loadLocal(){try{const r=localStorage.getItem(KEY);return r?normalize(JSON.parse(r)):null}catch(e){return null}}
function saveLocal(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}}
let data=loadLocal()||normalize({});

function persist(){data.updatedAt=Date.now();saveLocal();}

/* ---------- formatting ---------- */
function fmt(sec){sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
  return h?h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):m+":"+String(s).padStart(2,"0");}
function fmtWords(sec){const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;const p=[];
  if(h)p.push(h+"시간");if(m)p.push(m+"분");if(s||!p.length)p.push(s+"초");return p.join(" ");}
function clock(sec){sec=Math.max(0,Math.round(sec));return sec>=3600?fmt(sec):String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");}
function short(sec){return sec<60?String(sec):fmt(sec);}
function parseTime(str){str=String(str).trim().replace(/[.\s]/g,":");if(!str)return null;
  if(str.includes(":")){const [m,s]=str.split(":");const v=(parseInt(m)||0)*60+(parseInt(s)||0);return isFinite(v)?v:null;}
  const v=parseInt(str);return isFinite(v)?v:null;}
function spec(w){let s=short(w.work)+" / "+short(w.rest)+" × "+w.rounds;if(w.cycles>1)s+=" × "+w.cycles+"세트";return s;}
function dateStr(t){const d=new Date(t);return (d.getMonth()+1)+"월 "+d.getDate()+"일 "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}

/* ---------- schedule ---------- */
function buildSegments(w){
  const s=[];const R=w.rounds,C=w.cycles;
  if(w.prepare>0)s.push({k:"prepare",d:w.prepare});
  for(let c=1;c<=C;c++)for(let r=1;r<=R;r++){
    s.push({k:"work",d:w.work,r,c});
    if(r<R){if(w.rest>0)s.push({k:"rest",d:w.rest,r,c});}
    else if(c<C){if(w.cycleRest>0)s.push({k:"cycleRest",d:w.cycleRest,r,c});else if(w.rest>0)s.push({k:"rest",d:w.rest,r,c});}
  }
  if(w.cooldown>0)s.push({k:"cooldown",d:w.cooldown});
  let t=0;for(const x of s){x.t0=t;t+=x.d*1000;x.t1=t;}
  return s;
}
const totalSec=w=>buildSegments(w).reduce((a,s)=>a+s.d,0);
function rhythm(w,big){const segs=buildSegments(w);
  return '<span class="rhythm'+(big?" big":"")+(segs.length>50?" dense":"")+'" aria-hidden="true">'+segs.map(s=>'<i class="k-'+s.k+'" style="flex-grow:'+s.d+'"></i>').join("")+"</span>";}
const LABEL={prepare:"준비",work:"운동",rest:"휴식",cycleRest:"세트 휴식",cooldown:"쿨다운"};

/* ---------- views ---------- */
let view="home",editId=null,clearArm=0;
const V=$("#view");
const ICON_PLAY='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a.7.7 0 0 0 1.06.6l10.6-6.8a.7.7 0 0 0 0-1.2L9.06 4.6A.7.7 0 0 0 8 5.2z"/></svg>';
const CHEV='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';

function render(){
  if(view==="edit")return renderEdit();
  if(view==="history")return renderHistory();
  if(view==="settings")return renderSettings();
  renderHome();
}
function renderHome(){
  const ws=data.workouts;
  V.innerHTML='<header class="top"><h1>라운드 타이머</h1><nav class="nav"><button data-go="history">기록</button><button data-go="settings">설정</button></nav></header>'+
    (ws.length?'<div class="list">'+ws.map(w=>
      '<article class="wk"><button class="wk-main" data-edit="'+esc(w.id)+'" aria-label="'+esc(w.name)+' 편집">'+
      '<span class="wk-name">'+esc(w.name)+'</span><span class="wk-total">'+fmt(totalSec(w))+'</span>'+rhythm(w)+
      '<span class="wk-spec">'+spec(w)+'</span></button>'+
      '<button class="wk-play" data-play="'+esc(w.id)+'" aria-label="'+esc(w.name)+' 시작">'+ICON_PLAY+'</button></article>').join("")+'</div>'
      :'<p class="empty">저장된 운동이 없어요. 아래에서 새로 만들어 보세요.</p>')+
    '<button class="add" data-new>새 운동 만들기</button>';
}
const FIELDS=[
  ["prepare","준비","시작 전 카운트다운","t"],
  ["work","운동","라운드마다 운동하는 시간","t"],
  ["rest","휴식","라운드 사이 쉬는 시간","t"],
  ["rounds","라운드","한 세트의 라운드 수","n"],
  ["cycles","세트","전체를 몇 번 반복할지","n"],
  ["cycleRest","세트 간 휴식","세트가 끝나고 쉬는 시간","t"],
  ["cooldown","쿨다운","마지막 정리 시간","t"]
];
function curW(){return data.workouts.find(w=>w.id===editId);}
function renderEdit(){
  const w=curW();if(!w){view="home";return renderHome();}
  V.innerHTML='<header class="top"><button class="back" data-go="home">'+CHEV+'목록</button><button class="btn danger" data-del>삭제</button></header>'+
    '<input class="name" id="fName" value="'+esc(w.name)+'" maxlength="40" placeholder="운동 이름" aria-label="운동 이름">'+
    '<div id="preview">'+rhythm(w,true)+'</div>'+
    '<div class="total"><span id="fSpec">'+spec(w)+'</span><span>총 <b id="fTotal">'+fmtWords(totalSec(w))+'</b></span></div>'+
    '<div class="fields">'+FIELDS.map(([k,l,h,t])=>
      '<div class="field" data-row="'+k+'"'+(k==="cycleRest"&&w.cycles<2?" hidden":"")+'><label for="f-'+k+'">'+l+'<small>'+h+'</small></label>'+
      '<div class="stepper"><button data-step="-1" data-k="'+k+'" aria-label="'+l+' 줄이기">−</button>'+
      '<input id="f-'+k+'" data-k="'+k+'" inputmode="'+(t==="t"?"decimal":"numeric")+'" value="'+(t==="t"?fmt(w[k]):w[k])+'" autocomplete="off">'+
      '<button data-step="1" data-k="'+k+'" aria-label="'+l+' 늘리기">+</button></div></div>').join("")+'</div>'+
    '<div class="actions"><button class="btn primary" data-play="'+esc(w.id)+'">시작</button></div>';
}
function refreshEdit(){
  const w=curW();if(!w)return;
  $("#preview").innerHTML=rhythm(w,true);
  $("#fSpec").textContent=spec(w);
  $("#fTotal").textContent=fmtWords(totalSec(w));
  for(const [k,,,t] of FIELDS){const el=$("#f-"+k);if(el&&document.activeElement!==el)el.value=t==="t"?fmt(w[k]):w[k];}
  const cr=V.querySelector('[data-row="cycleRest"]');if(cr)cr.hidden=w.cycles<2;
}
function stepSize(v,dir){if(dir<0)v-=1;return v<60?5:v<300?15:30;}
function stepField(k,dir){
  const w=curW();if(!w)return;const isT=FIELDS.find(f=>f[0]===k)[3]==="t";
  let v=w[k];
  if(isT){const s=stepSize(v,dir);v=dir>0?Math.floor(v/s)*s+s:Math.ceil(v/s)*s-s;}else v+=dir;
  w[k]=clamp(v,LIMITS[k][0],LIMITS[k][1]);refreshEdit();persist();
}
function renderHistory(){
  const h=data.history;
  V.innerHTML='<header class="top"><button class="back" data-go="home">'+CHEV+'목록</button><h2>기록</h2></header>'+
    (h.length?'<div class="hist">'+h.map(x=>'<div class="hrow'+(x.done?"":" cut")+'"><span class="n">'+esc(x.name)+'</span><span class="d">'+dateStr(x.at)+'</span><span class="t">'+fmt(x.ms/1000)+'<small>'+(x.done?"완료":"중단")+'</small></span></div>').join("")+'</div>'+
      '<button class="linkbtn" data-clear>'+(clearArm>Date.now()?"한 번 더 누르면 모두 지워져요":"기록 지우기")+'</button>'
      :'<p class="empty">끝낸 운동이 여기에 쌓여요.</p>');
}
function pick(key,title,opts){return '<div class="tones"><span>'+title+'<small>눌러서 미리 들어 보세요</small></span><div class="seg wrap" role="radiogroup" aria-label="'+title+'">'+
  opts.map(([k,l])=>'<button role="radio" aria-checked="'+(data.settings[key]===k)+'" data-pick="'+key+'" data-val="'+k+'">'+l+'</button>').join("")+'</div></div>';}
function toneSel(){return pick("cdLen","카운트다운 길이 (구간이 끝나기 전)",CDLEN)+pick("cd","카운트다운 소리",CD)+pick("bell","라운드 시작·끝 소리",BELL);}
const SETS=[["sound","효과음","카운트다운과 구간이 바뀔 때"],["warn","종료 10초 전 알림","30초 이상인 운동 구간에서 (카운트다운이 10초면 생략)"],["voice","음성 안내","구간 이름을 읽어 줘요"],["flash","화면 깜빡임","구간이 바뀔 때 한 번 번쩍"]];
function renderSettings(){
  V.innerHTML='<header class="top"><button class="back" data-go="home">'+CHEV+'목록</button><h2>설정</h2></header><div style="border-top:1px solid var(--line)">'+
    SETS.map(([k,l,h])=>'<button class="set" role="switch" aria-checked="'+data.settings[k]+'" data-set="'+k+'"><span>'+l+'<small>'+h+'</small></span><span class="sw"></span></button>'+(k==="sound"?toneSel():"")).join("")+
    '</div><p class="note">아이폰·아이패드가 무음 모드면 효과음이 안 들릴 수 있어요. 운동 중에는 화면이 켜진 채로 두세요. 화면이 꺼지면 소리 안내가 멈추고, 다시 켜면 시간은 맞춰서 이어져요.</p>';
}

/* events: views */
V.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.go){view=b.dataset.go;render();window.scrollTo(0,0);return;}
  if(b.dataset.edit){editId=b.dataset.edit;view="edit";render();window.scrollTo(0,0);return;}
  if(b.dataset.play){start(b.dataset.play);return;}
  if(b.hasAttribute("data-new")){const w=normW({name:"새 운동",prepare:10,work:30,rest:15,rounds:8,cycles:1});data.workouts.push(w);persist();editId=w.id;view="edit";render();window.scrollTo(0,0);setTimeout(()=>{const n=$("#fName");n&&n.select();},50);return;}
  if(b.hasAttribute("data-del")){data.workouts=data.workouts.filter(w=>w.id!==editId);persist();view="home";render();return;}
  if(b.dataset.set){const k=b.dataset.set;data.settings[k]=!data.settings[k];persist();renderSettings();return;}
  if(b.dataset.pick){const k=b.dataset.pick;data.settings[k]=b.dataset.val;persist();renderSettings();audioUnlock();beep(k==="bell"?"phase":"tick","work",true);return;}
  if(b.hasAttribute("data-clear")){if(clearArm>Date.now()){data.history=[];clearArm=0;persist();}else{clearArm=Date.now()+3000;setTimeout(()=>{if(view==="history")renderHistory();},3100);}renderHistory();return;}
});
/* steppers with press-and-hold */
let holdT=0,holdI=0;
function stopHold(){clearTimeout(holdT);clearInterval(holdI);}
V.addEventListener("pointerdown",e=>{
  const b=e.target.closest("[data-step]");if(!b)return;e.preventDefault();
  const k=b.dataset.k,dir=+b.dataset.step;stepField(k,dir);
  stopHold();holdT=setTimeout(()=>{holdI=setInterval(()=>stepField(k,dir),90);},420);
});
["pointerup","pointercancel"].forEach(t=>window.addEventListener(t,stopHold));V.addEventListener("pointerout",e=>{if(e.target.closest("[data-step]"))stopHold();});
V.addEventListener("keydown",e=>{const b=e.target.closest("[data-step]");if(b&&(e.key==="Enter"||e.key===" ")){e.preventDefault();stepField(b.dataset.k,+b.dataset.step);}
  if(e.target.matches(".stepper input")&&e.key==="Enter")e.target.blur();});
V.addEventListener("input",e=>{if(e.target.id==="fName"){const w=curW();if(w){w.name=e.target.value.slice(0,40)||"새 운동";persist();}}});
V.addEventListener("change",e=>{
  const el=e.target;if(!el.matches(".stepper input"))return;const k=el.dataset.k,w=curW();if(!w)return;
  const isT=FIELDS.find(f=>f[0]===k)[3]==="t";const v=isT?parseTime(el.value):parseInt(el.value);
  if(v!=null&&isFinite(v)){w[k]=clamp(v,LIMITS[k][0],LIMITS[k][1]);persist();}
  el.value=isT?fmt(w[k]):w[k];refreshEdit();
});

/* ---------- audio, voice, wake lock ---------- */
/* 효과음은 sounds/*.m4a (tools/make-sounds.py로 직접 합성). <audio>로 재생해야 iPad 무음 모드에서도 들린다. */
const sndEl={},primed=new Set();
function snd(name){
  if(!sndEl[name]){const a=new Audio("sounds/"+name+".m4a");a.preload="auto";a.setAttribute("playsinline","");sndEl[name]=a;}
  return sndEl[name];
}
function sndName(kind,seg){
  const st=data.settings,b=st.bell;
  if(kind==="tick")return "cd-"+st.cd;
  if(kind==="warn")return "warn-"+(b==="beep"||b==="whistle"?b:"bell");
  if(kind==="phase"&&b==="whistle"&&seg&&seg!=="work")return "whistle-calm";
  if(b==="real")return kind==="phase"&&seg==="work"?"real1-phase":"real3-phase";   // 시작은 땡, 끝·완료는 땡땡땡
  return b+"-"+kind;
}
/* iOS는 사용자가 누른 순간에 한 번 재생해 둔 <audio>만 나중에 자동 재생을 허락한다 */
function audioUnlock(){
  try{if(navigator.audioSession)navigator.audioSession.type="playback";}catch(e){}
  for(const name of [sndName("tick"),sndName("warn"),sndName("phase","work"),sndName("phase","rest"),sndName("finish")]){
    if(primed.has(name))continue;primed.add(name);
    const a=snd(name);a.muted=true;const p=a.play();
    const done=()=>{if(a.muted){a.pause();a.currentTime=0;a.muted=false;}};
    if(p&&p.then)p.then(done,()=>{a.muted=false;primed.delete(name);});else done();}
}
function beep(kind,seg,force){
  if(!data.settings.sound&&!force)return;
  if(kind==="phase"&&seg==="prepare")return;
  try{const a=snd(sndName(kind,seg));a.muted=false;a.currentTime=0;const p=a.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}
}
function speak(t){
  if(!data.settings.voice||!("speechSynthesis" in window))return;
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang="ko-KR";u.rate=1.05;speechSynthesis.speak(u);}catch(e){}
}
let wl=null,speakT=0;
async function wakeOn(){
  try{if("wakeLock" in navigator){wl=await navigator.wakeLock.request("screen");wl.addEventListener("release",()=>{wl=null;});return true;}}catch(e){}
  return false;
}
function wakeOff(){try{wl&&wl.release();}catch(e){}wl=null;}
let toastT=0;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("on");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("on"),4200);}
function flash(){if(!data.settings.flash)return;const f=$("#flash");f.classList.remove("on");void f.offsetWidth;f.classList.add("on");}

/* ---------- runner ---------- */
const RUN=$("#run"),DIG=$("#digits"),TRACK=$("#track"),NXT=$("#next"),RING=$("#ringFg"),RING_C=282.74;
const R={w:null,segs:[],total:0,base:0,runAt:0,running:false,idx:-1,lastSec:-1,lastTick:0,raf:0,cue:false,finished:false,lastDig:"",exitArm:0,trackEls:[]};
const ICON_PAUSE='<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const ICON_RESUME='<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a.7.7 0 0 0 1.06.6l10.6-6.8a.7.7 0 0 0 0-1.2L9.06 4.6A.7.7 0 0 0 8 5.2z"/></svg>';

function elapsed(){return R.base+(R.running?Date.now()-R.runAt:0);}
function idxAt(ms){const s=R.segs;let lo=0,hi=s.length-1;while(lo<hi){const m=(lo+hi)>>1;if(ms<s[m].t1)hi=m;else lo=m+1;}return lo;}

function start(id){
  const w=data.workouts.find(x=>x.id===id);if(!w)return;
  audioUnlock();
  R.w=JSON.parse(JSON.stringify(w));R.segs=buildSegments(R.w);R.total=R.segs.length?R.segs[R.segs.length-1].t1:0;
  if(!R.total)return;
  R.base=0;R.idx=-1;R.lastLeft="";R.lastSec=-1;R.finished=false;R.cue=true;R.lastDig="";R.exitArm=0;
  TRACK.className="track"+(R.segs.length>50?" dense":"");
  TRACK.innerHTML=R.segs.map(s=>'<span class="k-'+s.k+'" style="flex-grow:'+s.d+'"><b></b></span>').join("");
  R.trackEls=[...TRACK.children];
  $("#rName").textContent=R.w.name;
  $("#done").hidden=true;RUN.hidden=false;document.body.style.overflow="hidden";
  resume();
  wakeOn().then(ok=>{if(!ok)toast("화면이 꺼지지 않게 자동 잠금 시간을 늘려 두세요");});
  $("#bPlay").focus({preventScroll:true});
}
function resume(){if(R.finished)return;R.runAt=Date.now();R.running=true;R.lastTick=Date.now();RUN.classList.remove("paused");if(R.idx>=0)$("#phase").textContent=LABEL[R.segs[R.idx].k];
  $("#bPlay").innerHTML=ICON_PAUSE;$("#bPlay").setAttribute("aria-label","일시정지");frame();}
function pause(){if(!R.running)return;R.base=elapsed();R.running=false;cancelAnimationFrame(R.raf);RUN.classList.add("paused");
  $("#bPlay").innerHTML=ICON_RESUME;$("#bPlay").setAttribute("aria-label","계속");$("#phase").textContent="일시정지";clearTimeout(speakT);if("speechSynthesis" in window)speechSynthesis.cancel();}
function toggle(){if(R.finished)return;audioUnlock();R.running?pause():resume();}
function seek(ms){R.base=clamp(ms,0,R.total);if(R.running)R.runAt=Date.now();R.idx=-1;R.cue=true;R.lastTick=Date.now();
  if(!R.running){cancelAnimationFrame(R.raf);frame();}}
function next(){if(R.idx<0||R.finished)return;audioUnlock();seek(R.segs[R.idx].t1);}
function prev(){if(R.idx<0||R.finished)return;audioUnlock();const s=R.segs[R.idx];seek(elapsed()-s.t0<2000&&R.idx>0?R.segs[R.idx-1].t0:s.t0);}

function phrase(s){
  if(s.k==="work"){const lastW=R.segs.filter(x=>x.k==="work").pop();if(s===lastW&&R.w.rounds*R.w.cycles>1)return "마지막 라운드";return R.idx===0||R.segs[R.idx-1].k==="prepare"?"시작":"운동";}
  if(s.k==="prepare")return "준비하세요";
  return LABEL[s.k];
}
function setDigits(str){
  if(str===R.lastDig)return;R.lastDig=str;
  let w=0;for(const c of str)w+=c===":"?.24:.5;
  DIG.style.setProperty("--w",w.toFixed(2));
  DIG.innerHTML=[...str].map(c=>c===":"?'<span class="c">:</span>':'<span class="d">'+c+"</span>").join("");
}
function onSegment(s,cue){
  RUN.dataset.kind=s.k;
  if(R.running)$("#phase").textContent=LABEL[s.k];
  R.trackEls.forEach((el,i)=>{el.className="k-"+R.segs[i].k+(i<R.idx?" past":i===R.idx?" now":"");if(i!==R.idx)el.firstChild.style.width="";});
  const n=R.segs[R.idx+1];
  NXT.dataset.k=n?n.k:"end";
  $("#nLabel").textContent=n?LABEL[n.k]+":":"마지막 구간";$("#nTime").textContent=n?clock(n.d):"";
  /* 남은 라운드: 지금 세트에서 아직 끝나지 않은 운동 구간 수 (진행 중인 것 포함), 남은 세트: 아직 남은 세트 수 */
  const ahead=R.segs.slice(R.idx).filter(x=>x.k==="work"),curC=ahead.length?ahead[0].c:0;
  $("#cRound").textContent=ahead.filter(x=>x.c===curC).length;
  $("#cSet").textContent=new Set(ahead.map(x=>x.c)).size;
  if(cue){beep("phase",s.k);const ph=phrase(s);clearTimeout(speakT);speakT=setTimeout(()=>speak(ph),data.settings.sound&&s.k!=="prepare"?1100:0);flash();}
}
function frame(){
  const now=Date.now(),e=elapsed();
  if(e>=R.total){finish();return;}
  const i=idxAt(e),s=R.segs[i],rem=s.t1-e,sec=Math.ceil(rem/1000);
  const fresh=now-R.lastTick<1500;
  if(i!==R.idx){R.idx=i;onSegment(s,R.cue||(R.running&&fresh));R.cue=false;R.lastSec=sec;}
  else if(sec!==R.lastSec){
    if(R.running&&fresh){
      if(sec>=1&&sec<=+data.settings.cdLen)beep("tick");
      else if(sec===10&&s.k==="work"&&s.d>=30&&data.settings.warn){beep("warn");speak("10초");}
    }
    R.lastSec=sec;
  }
  setDigits(clock(sec));
  RING.style.strokeDashoffset=(RING_C*(1-(e-s.t0)/(s.t1-s.t0))).toFixed(1);
  const lt=fmt(Math.ceil((R.total-e)/1000));if(lt!==R.lastLeft){R.lastLeft=lt;$("#mLeft").textContent=lt;}
  const cur=R.trackEls[i];if(cur)cur.firstChild.style.width=((e-s.t0)/(s.t1-s.t0)*100).toFixed(2)+"%";
  R.lastTick=now;
  if(R.running)R.raf=requestAnimationFrame(frame);
}
function logHistory(ms,done){
  if(ms<15000&&!done)return;
  data.history.unshift({at:Date.now(),name:R.w.name,ms:Math.round(ms),done});
  data.history=data.history.slice(0,80);persist();
}
function finish(){
  cancelAnimationFrame(R.raf);R.running=false;R.finished=true;R.base=R.total;
  RUN.dataset.kind="done";RING.style.strokeDashoffset=0;R.trackEls.forEach((el,i)=>{el.className="k-"+R.segs[i].k+" past";el.firstChild.style.width="";});
  beep("finish");clearTimeout(speakT);speakT=setTimeout(()=>speak("운동 완료"),data.settings.sound?1400:0);flash();wakeOff();
  $("#doneTime").textContent=fmt(R.total/1000);
  $("#doneSub").textContent=R.w.name+"  "+R.w.rounds*R.w.cycles+"라운드";
  $("#done").hidden=false;$("#bAgain").focus({preventScroll:true});
  logHistory(R.total,true);
}
function closeRun(){
  if(!R.finished)logHistory(elapsed(),false);
  cancelAnimationFrame(R.raf);R.running=false;R.w=null;wakeOff();
  clearTimeout(speakT);if("speechSynthesis" in window)speechSynthesis.cancel();
  RUN.hidden=true;document.body.style.overflow="";render();
  if(window.__swPending)location.reload();
}
function askClose(){
  if(R.finished||elapsed()<3000)return closeRun();
  if(R.exitArm>Date.now())return closeRun();
  R.exitArm=Date.now()+2500;toast("한 번 더 누르면 운동을 끝내요");
}
$("#bPlay").addEventListener("click",toggle);
$("#bClose").addEventListener("click",askClose);
/* 숫자 화면: 탭하면 일시정지/계속, 왼쪽으로 밀면 다음 구간, 오른쪽으로 밀면 이전 구간 */
let swX=null,swY=0,swiped=false;
$("#center").addEventListener("pointerdown",e=>{swX=e.clientX;swY=e.clientY;swiped=false;});
$("#center").addEventListener("pointerup",e=>{
  if(swX===null)return;const dx=e.clientX-swX,dy=e.clientY-swY;swX=null;
  if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=true;dx<0?next():prev();}
});
$("#center").addEventListener("click",()=>{if(swiped){swiped=false;return;}toggle();});
$("#bDoneClose").addEventListener("click",closeRun);
$("#bAgain").addEventListener("click",()=>{const id=data.workouts.find(w=>w.id===(R.w&&R.w.id))?R.w.id:null;if(id){start(id);}else closeRun();});
document.addEventListener("keydown",e=>{
  if(RUN.hidden)return;
  if(e.key===" "&&!e.target.closest("button")){e.preventDefault();toggle();}
  else if(e.key==="ArrowRight")next();else if(e.key==="ArrowLeft")prev();else if(e.key==="Escape")askClose();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&R.w&&R.running&&!R.finished){wakeOn();R.lastTick=0;cancelAnimationFrame(R.raf);frame();}
});

render();

/* ---------- offline / install ---------- */
if("serviceWorker" in navigator&&location.protocol!=="file:"){
  window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").catch(()=>{});});
  /* 새 버전이 설치되면 한 번 새로고침해서 바로 적용 (운동 중이면 끝난 뒤에) */
  const had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!had)return;if(RUN.hidden)location.reload();else window.__swPending=true;});
  document.addEventListener("visibilitychange",()=>{if(window.__swPending&&RUN.hidden&&document.visibilityState==="visible")location.reload();});
}
})();
