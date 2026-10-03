const EMO = {
  sadness:{c:'#5b8def',e:'😢'}, joy:{c:'#ffc83d',e:'😀'}, love:{c:'#ff5d8f',e:'❤️'},
  anger:{c:'#ff4b3e',e:'😠'}, fear:{c:'#9b6bff',e:'😨'}, surprise:{c:'#2ee6c5',e:'😮'}
};
const SAMPLES = [
   "I can't believe how happy I am right now, this is amazing!",
    "I feel so alone and hopeless today.",
    "I am furious that they cancelled the trip at the last minute.",
    "I feel terrified when walking down dark alleyways alone.",
    "I was shocked and completely surprised by the unexpected gift!"
];
const $ = id => document.getElementById(id);
const text = $('text'), go = $('go'), orb = $('orb'), err = $('err');

// build probability rows + sample chips
$('bars').innerHTML = Object.keys(EMO).map(k => `
  <div class="bar" id="b-${k}" style="--bc:${EMO[k].c}">
    <span>${EMO[k].e} ${k}</span><div class="track"><div class="fill"></div></div><span class="pct">0%</span>
  </div>`).join('');
SAMPLES.forEach(s => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = s;
  b.onclick = () => { text.value = s; text.dispatchEvent(new Event('input')); detect(); };
  $('chips').appendChild(b);
});

text.addEventListener('input', () => $('count').textContent = text.value.length);
text.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') detect(); });
go.addEventListener('click', detect);

// server status (Render free tier may need a cold start)
(async function ping(tries = 0) {
  const s = $('status');
  try {
    const r = await fetch('/health'); const d = await r.json();
    s.className = 'status ' + (d.model_loaded ? 'ok' : ''); s.querySelector('b').textContent = d.model_loaded ? 'Model ready' : 'Loading model…';
    if (!d.model_loaded) setTimeout(() => ping(tries + 1), 2500);
  } catch {
    s.className = 'status bad'; s.querySelector('b').textContent = 'Server waking up…';
    if (tries < 30) setTimeout(() => ping(tries + 1), 3000);
  }
})();

function setTheme(color){ document.documentElement.style.setProperty('--c', color); }

function countUp(el, to){
  const t0 = performance.now();
  (function f(t){ const p = Math.min((t - t0) / 900, 1);
    el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(1) + '%';
    if (p < 1) requestAnimationFrame(f); })(t0);
}

async function detect(){
  const value = text.value.trim();
  if (!value) { err.hidden = false; err.textContent = 'Write something first, then press detect.'; text.focus(); return; }
  err.hidden = true; go.disabled = true; go.textContent = 'Reading…';
  orb.dataset.state = 'thinking'; $('label').textContent = 'Reading…'; $('conf').textContent = '';
  try {
    const res = await fetch('/predict', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: value }) });
    if (!res.ok) throw new Error(res.status === 503 ? 'The model is still loading. Try again in a few seconds.' : res.status === 422 ? 'Text must be 1–2000 characters.' : 'Something went wrong (' + res.status + ').');
    show(await res.json());
  } catch (e) {
    orb.dataset.state = 'idle'; $('label').textContent = 'No result';
    err.hidden = false; err.textContent = e.message.includes('fetch') ? 'Cannot reach the server. Check your connection and try again.' : e.message;
  } finally { go.disabled = false; go.textContent = 'Detect emotion'; }
}

function show(d){
  const em = d.predicted_emotion, cfg = EMO[em];
  setTheme(cfg.c);
  orb.dataset.state = ''; void orb.offsetWidth; orb.dataset.state = em;
  $('emoji').textContent = cfg.e; orb.classList.remove('pop'); void orb.offsetWidth; orb.classList.add('pop');
  $('label').textContent = em;
  $('conf').textContent = (d.confidence * 100).toFixed(1) + '% confident';
  for (const [k, p] of Object.entries(d.all_probabilities)) {
    const row = $('b-' + k); if (!row) continue;
    row.classList.toggle('top', k === em);
    row.querySelector('.fill').style.transform = `scaleX(${p})`;
    countUp(row.querySelector('.pct'), p * 100);
  }
  burst(cfg);
}

// particle burst from the orb
const cv = $('burst'), cx = cv.getContext('2d'); let parts = [];
function size(){ cv.width = innerWidth; cv.height = innerHeight; } size(); addEventListener('resize', size);
function burst(cfg){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = orb.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * 6.283, v = 2 + Math.random() * 5;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, s: 3 + Math.random() * 5, c: cfg.c });
  }
  if (parts.length === 46) loop();
}
function loop(){
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += .12; p.vx *= .985; p.life -= .017;
    cx.globalAlpha = Math.max(p.life, 0); cx.fillStyle = p.c;
    cx.beginPath(); cx.arc(p.x, p.y, p.s * p.life, 0, 6.283); cx.fill();
  }
  if (parts.length) requestAnimationFrame(loop); else cx.clearRect(0, 0, cv.width, cv.height);
}