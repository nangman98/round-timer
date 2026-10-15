/* 오프라인 캐시. 앱 파일을 고치면 VERSION을 올려야 기기에 새 버전이 내려간다.
   설치할 때 브라우저 HTTP 캐시를 건너뛰어(cache:"reload") 옛 파일과 새 파일이 섞이지 않게 한다. */
const VERSION = "v10";
const CACHE = "round-timer-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./fonts/BigShouldersDisplay-800.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./sounds/beep-finish.m4a",
  "./sounds/beep-phase.m4a",
  "./sounds/cd-beep.m4a",
  "./sounds/cd-high.m4a",
  "./sounds/cd-rec.m4a",
  "./sounds/cd-whistle.m4a",
  "./sounds/cd-wood.m4a",
  "./sounds/real1-finish.m4a",
  "./sounds/real1-phase.m4a",
  "./sounds/real3-finish.m4a",
  "./sounds/real3-phase.m4a",
  "./sounds/synth-finish.m4a",
  "./sounds/synth-phase.m4a",
  "./sounds/warn-beep.m4a",
  "./sounds/warn-bell.m4a",
  "./sounds/warn-whistle.m4a",
  "./sounds/whistle-calm.m4a",
  "./sounds/whistle-finish.m4a",
  "./sounds/whistle-phase.m4a"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("round-timer-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* iOS Safari는 <audio>를 Range 요청(일부분만)으로 받는다. 캐시에서 꺼낼 때 206으로 잘라 줘야 오프라인에서도 소리가 난다. */
async function ranged(req, res) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mp4", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" }
  });
}

/* 캐시 먼저 보여주고, 온라인이면 뒤에서 새 파일로 갱신 (stale-while-revalidate) */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.headers.has("range")) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req.url, { ignoreSearch: true });
      if (hit) return ranged(req, hit);
      const res = await fetch(req.url, { cache: "no-cache" });   // 범위 없이 통째로 받아 캐시
      if (res.ok) { cache.put(req.url, res.clone()); return ranged(req, res); }
      return res;
    }).catch(() => fetch(req)));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req, { cache: "no-cache" })
        .then((res) => { if (res && res.ok && res.status === 200) cache.put(req, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    })
  );
});
