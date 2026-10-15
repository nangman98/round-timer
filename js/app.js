/* 라운드 타이머 — 빌드 없이 동작하는 단일 스크립트. 구조 설명은 CLAUDE.md 참고. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const uid=()=>"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ---------- data ---------- */
const KEY="round-timer.v1";
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
    settings:{sound:s.sound!==false,voice:s.voice!==false,flash:s.flash!==false,warn:s.warn!==false,tone:s.toneV===2&&["beep","bell","whistle"].includes(s.tone)?s.tone:"bell",toneV:2},
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
const TONES=[["beep","전자음"],["bell","복싱 벨"],["whistle","호루라기"]];
function toneSel(){return '<div class="tones"><span>소리 종류<small>눌러서 미리 들어 보세요</small></span><div class="seg" role="radiogroup" aria-label="소리 종류">'+TONES.map(([k,l])=>'<button role="radio" aria-checked="'+(data.settings.tone===k)+'" data-tone="'+k+'">'+l+'</button>').join("")+'</div></div>';}
const SETS=[["sound","효과음","마지막 3초와 구간이 바뀔 때"],["warn","종료 10초 전 알림","30초 이상인 운동 구간에서"],["voice","음성 안내","구간 이름을 읽어 줘요"],["flash","화면 깜빡임","구간이 바뀔 때 한 번 번쩍"]];
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
  if(b.dataset.tone){data.settings.tone=b.dataset.tone;persist();renderSettings();audioUnlock();beep("phase","work",true);return;}
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
let ac=null,bus=null,noiseBuf=null;
let keepEl=null;
function silentWav(){const n=4410,b=new Uint8Array(44+n*2),v=new DataView(b.buffer),w=(o,t)=>{for(let i=0;i<t.length;i++)b[o+i]=t.charCodeAt(i);};
  w(0,"RIFF");v.setUint32(4,36+n*2,true);w(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,n*2,true);
  return URL.createObjectURL(new Blob([b],{type:"audio/wav"}));}
function audioUnlock(){
  /* iOS: 무음 모드에서도 효과음이 나오도록 재생용 오디오 세션으로 전환 */
  try{if(navigator.audioSession)navigator.audioSession.type="playback";}catch(e){}
  try{if(!navigator.audioSession){if(!keepEl){keepEl=new Audio(silentWav());keepEl.loop=true;keepEl.setAttribute("playsinline","");}keepEl.play().catch(()=>{});}}catch(e){}
  try{
    if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();
      const comp=ac.createDynamicsCompressor();comp.threshold.value=-18;comp.knee.value=8;comp.ratio.value=6;comp.attack.value=.003;comp.release.value=.25;
      const out=ac.createGain();out.gain.value=1.4;comp.connect(out);out.connect(ac.destination);bus=comp;}
    if(ac.state!=="running")ac.resume().catch(()=>{});
    const b=ac.createBuffer(1,1,22050),s=ac.createBufferSource();s.buffer=b;s.connect(ac.destination);s.start(0);
  }catch(e){}
}
function env(g,t,peak,att,dur){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+att);g.gain.exponentialRampToValueAtTime(.0001,t+dur);}
function osc(type,f,t,dur,peak,att){const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=f;env(g,t,peak,att||.008,dur);o.connect(g);g.connect(bus);o.start(t);o.stop(t+dur+.05);}
function ding(t,f,dur){[[1,.34,1],[1.006,.22,1],[2,.14,.55],[2.76,.16,.45],[4.07,.08,.3],[5.4,.06,.22]].forEach(([r,a,d])=>osc("sine",f*r,t,dur*d,a,.002));}
function noise(){if(!noiseBuf){const n=ac.sampleRate|0;noiseBuf=ac.createBuffer(1,n,ac.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;}return noiseBuf;}
function whistle(t,dur){
  const hold=(g,p)=>{g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(p,t+.02);g.gain.setValueAtTime(p,t+Math.max(.03,dur-.04));g.gain.exponentialRampToValueAtTime(.0001,t+dur);};
  const o=ac.createOscillator(),g=ac.createGain(),l=ac.createOscillator(),lg=ac.createGain();
  o.type="sine";o.frequency.value=2850;l.frequency.value=34;lg.gain.value=120;l.connect(lg);lg.connect(o.frequency);hold(g,.32);o.connect(g);g.connect(bus);
  const s=ac.createBufferSource(),bp=ac.createBiquadFilter(),ng=ac.createGain();s.buffer=noise();bp.type="bandpass";bp.frequency.value=2850;bp.Q.value=5;hold(ng,.5);s.connect(bp);bp.connect(ng);ng.connect(bus);
  [o,l,s].forEach(x=>{x.start(t);x.stop(t+dur+.05);});
}
function beep(kind,seg,force){
  if(!ac||!bus||(!data.settings.sound&&!force))return;
  if(ac.state!=="running"){ac.resume().then(()=>play(kind,seg)).catch(()=>{});return;}
  play(kind,seg);
}
/* 땡땡땡: 복싱 벨 세 번 */
function bell3(t,last){ding(t,740,1.2);ding(t+.3,740,1.2);ding(t+.6,740,last?2.6:1.8);}
function play(kind,seg){
  try{
    const t=ac.currentTime+.01,st=data.settings.tone,calm=!!seg&&seg!=="work"&&seg!=="prepare";
    if(kind==="warn"){
      if(st==="bell"){osc("triangle",1500,t,.06,.45,.002);osc("triangle",1500,t+.14,.06,.45,.002);}
      else if(st==="whistle"){whistle(t,.08);whistle(t+.16,.08);}
      else{osc("square",988,t,.09,.3);osc("square",988,t+.15,.09,.3);}
      return;
    }
    if(st==="bell"){
      if(kind==="tick")osc("square",880,t,.12,.3);
      else if(kind==="phase"){if(seg!=="prepare")bell3(t);}
      else bell3(t,true);
    }else if(st==="whistle"){
      if(kind==="tick")whistle(t,.09);
      else if(kind==="phase"){if(calm){whistle(t,.18);whistle(t+.26,.18);}else whistle(t,.7);}
      else{whistle(t,.15);whistle(t+.24,.15);whistle(t+.48,.9);}
    }else{
      if(kind==="tick")osc("square",880,t,.12,.3);
      else if(kind==="phase")osc("square",1320,t,.45,.34);
      else{osc("square",1046,t,.16,.3);osc("square",1318,t+.2,.16,.3);osc("square",1568,t+.4,.5,.3);}
    }
  }catch(e){}
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
const RUN=$("#run"),DIG=$("#digits"),TRACK=$("#track");
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
  $("#next").innerHTML=n?"다음 <b>"+LABEL[n.k]+" "+fmt(n.d)+"</b>":"마지막 구간";
  const W=R.w,parts=[];
  const r=s.r||(s.k==="cooldown"?W.rounds:0),c=s.c||(s.k==="cooldown"?W.cycles:1);
  parts.push('<div><b>'+r+"/"+W.rounds+'</b><small>라운드</small></div>');
  if(W.cycles>1)parts.push('<div><b>'+c+"/"+W.cycles+'</b><small>세트</small></div>');
  $("#meta").innerHTML=parts.join("");
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
      if(sec>=1&&sec<=3&&s.d>=5)beep("tick");
      else if(sec===10&&s.k==="work"&&s.d>=30&&data.settings.warn){beep("warn");speak("10초");}
    }
    R.lastSec=sec;
  }
  setDigits(fmt(sec));
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
  RUN.dataset.kind="done";R.trackEls.forEach((el,i)=>{el.className="k-"+R.segs[i].k+" past";el.firstChild.style.width="";});
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
}
function askClose(){
  if(R.finished||elapsed()<3000)return closeRun();
  if(R.exitArm>Date.now())return closeRun();
  R.exitArm=Date.now()+2500;toast("한 번 더 누르면 운동을 끝내요");
}
$("#bPlay").addEventListener("click",toggle);
$("#bNext").addEventListener("click",next);
$("#bPrev").addEventListener("click",prev);
$("#bClose").addEventListener("click",askClose);
$("#center").addEventListener("click",toggle);
$("#bDoneClose").addEventListener("click",closeRun);
$("#bAgain").addEventListener("click",()=>{const id=data.workouts.find(w=>w.id===(R.w&&R.w.id))?R.w.id:null;if(id){start(id);}else closeRun();});
document.addEventListener("keydown",e=>{
  if(RUN.hidden)return;
  if(e.key===" "&&!e.target.closest("button")){e.preventDefault();toggle();}
  else if(e.key==="ArrowRight")next();else if(e.key==="ArrowLeft")prev();else if(e.key==="Escape")askClose();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&ac&&ac.state!=="running")ac.resume().catch(()=>{});
  if(document.visibilityState==="visible"&&R.w&&R.running&&!R.finished){wakeOn();R.lastTick=0;cancelAnimationFrame(R.raf);frame();}
});

render();

/* ---------- offline / install ---------- */
if("serviceWorker" in navigator&&location.protocol!=="file:"){
  window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").catch(()=>{});});
}
})();
