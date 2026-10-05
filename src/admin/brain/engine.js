/*
 * «Miya» — tizimning 3D galaktika ko'rinishi.
 *
 * Oddiy JavaScript (TypeScript emas): bu Canvas va Web Audio bilan
 * ishlaydigan, React'dan butunlay mustaqil dvigatel. Turlari engine.d.ts
 * da. React sahifasi (BrainPage.tsx) faqat konteyner beradi va jonli
 * ma'lumotni `setData` bilan uzatib turadi.
 *
 * Tuzilma:
 *   markaz — MUSA yadrosi
 *   ichki orbita — tizim a'zolari (Mini app, Server, Firestore...)
 *   galaktika qo'llari — kategoriyalar; qo'l bo'ylab bo'limlar va mahsulotlar
 *   server yonida — buyurtmalar, Mini app yonida — mijozlar
 *
 * Impulslar HAQIQIY hodisalardan: yangi buyurtma tushdi, holati o'zgardi.
 * Sahifa ochilganda bir marta yadrodan tizim a'zolariga «uyg'onish» nuri
 * yuguradi — bu bezak, hodisa emas.
 */

const RGB = {
  gold: [242, 201, 76], green: [46, 229, 140], teal: [62, 207, 190], ice: [143, 211, 255],
  violet: [183, 156, 255], amber: [255, 181, 71], rose: [255, 107, 125], white: [232, 243, 238],
}
const css = (c, a = 1) => `rgba(${RGB[c][0]},${RGB[c][1]},${RGB[c][2]},${a})`

const STATUS = {
  'Yangi': 'amber', 'Qabul qilindi': 'ice', 'Yetkazilmoqda': 'violet',
  'Yetkazildi': 'green', 'Bekor qilingan': 'rose', 'Rad etildi': 'rose',
}
const KIND = {
  core: 'Yadro', system: 'Tizim a’zosi', category: 'Kategoriya', section: 'Bo‘lim',
  product: 'Mahsulot', order: 'Buyurtma', customer: 'Mijoz', staff: 'Xodim',
}
const ROLE = { owner: 'Ega', admin: 'Admin', courier: 'Kuryer' }

const SYSTEMS = [
  { key: 'miniapp', label: 'Mini app', sub: 'Telegram ichidagi do‘kon', info: 'Mijoz shu yerda katalogni ko‘radi, savatni to‘ldiradi va buyurtma beradi. Kuryer esa o‘z sahifasida buyurtmani oladi, marshrutni ko‘radi va yetkazadi.' },
  { key: 'server', label: 'Server', sub: 'Vercel · /api', info: 'Buyurtma narxini qayta hisoblaydi, qoldiqni kamaytiradi, promokodni tekshiradi va Telegram xabarlarini jo‘natadi.' },
  { key: 'firestore', label: 'Firestore', sub: 'Ma’lumotlar bazasi', info: 'Mahsulotlar, bo‘limlar, buyurtmalar va mijozlar shu yerda jonli saqlanadi — o‘zgarish ilova va panelga darhol yetib boradi.' },
  { key: 'admin', label: 'Admin panel', sub: '/admin', info: 'Ega va adminlar buyurtmani tasdiqlaydi, katalog va bo‘limlarni boshqaradi.' },
  { key: 'bot', label: 'Bot', sub: '@musauz_bot', info: 'Admindagi «Qabul qilindi» tugmasini va eski xabarlardagi kuryer tugmalarini qabul qiladi. Yangi buyurtmani kuryerga server o‘zi yozadi.' },
  { key: 'telegram', label: 'Telegram', sub: 'Xabarlar va kuryerlar guruhi', info: 'Admin, kuryer va mijozga buyurtma haqidagi xabarlar shu yo‘l bilan boradi.' },
  { key: 'storage', label: 'Storage', sub: 'Mahsulot rasmlari', info: 'Har rasmning asl fayli va ikki siqilgan nusxasi (480 px va 1200 px WebP) saqlanadi.' },
]
const SYSTEM_LINKS = [
  ['miniapp', 'server'], ['miniapp', 'firestore'], ['miniapp', 'storage'],
  ['server', 'firestore'], ['server', 'telegram'], ['admin', 'server'],
  ['admin', 'firestore'], ['admin', 'storage'], ['bot', 'firestore'], ['bot', 'telegram'],
]

const DIST = { far: 2150, mid: 980, near: 380 }
const FLY_D = 30
const FLY_LIMIT = 3200
const ARM_START = 300, ARM_LEN = 760, ARM_TURN = 2.05

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const num = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/ /g, ' ')
const som = (n) => `${num(n)} so‘m`
const when = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (x) => String(x).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const MARKUP = `
<canvas class="brain__sky" data-el="sky" aria-label="MUSA tizimi galaktika ko‘rinishida"></canvas>

<header class="brain__hud brain__brand">
  <div class="brain__mark">
    <span class="brain__core"></span>
    <span class="brain__name">MUSA</span>
    <span class="brain__sub">Miyasi</span>
    <span class="brain__live"><i></i>jonli</span>
  </div>
  <nav class="brain__counts" data-el="counts" aria-label="Tizim tarkibi"></nav>
</header>

<div class="brain__hud brain__search" role="search">
  <input data-el="find" type="search" autocomplete="off" aria-label="Yulduz qidirish" placeholder="Mahsulot, bo‘lim, buyurtma…  ( / )">
  <div class="brain__results" data-el="results" hidden></div>
</div>

<div class="brain__hud brain__controls">
  <div class="brain__row">
    <div class="brain__scale" data-el="scale" role="group" aria-label="Masofa va parvoz">
      <button type="button" data-dist="far" aria-pressed="true">Uzoqdan</button>
      <button type="button" data-dist="mid" aria-pressed="false">O‘rtadan</button>
      <button type="button" data-dist="near" aria-pressed="false">Yaqindan</button>
      <button type="button" data-mode="fly" aria-pressed="false">Parvoz</button>
    </div>
    <button class="brain__sound" data-el="sound" type="button" aria-pressed="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" />
        <path class="wave" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        <path class="mute" d="M16 9.5l5 5M21 9.5l-5 5" />
      </svg>
      <span data-el="soundLabel">Ovoz</span>
    </button>
    <button class="brain__sound brain__full" data-el="full" type="button" aria-pressed="false" aria-label="To‘liq ekran">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path class="enter" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        <path class="leave" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      </svg>
      <span data-el="fullLabel">To‘liq ekran</span>
    </button>
  </div>
  <div class="brain__layers" data-el="layers" role="group" aria-label="Qatlamlar"></div>
</div>

<div class="brain__reticle" aria-hidden="true"></div>
<div class="brain__hud brain__flight" data-el="flight"></div>
<div class="brain__flypad">
  <div class="brain__stick" data-el="stick" aria-label="Harakat joystigi"><div class="brain__knob" data-el="knob"></div></div>
  <div class="brain__flybtns">
    <button type="button" data-hold="up" aria-label="Yuqoriga">▲</button>
    <button type="button" data-hold="down" aria-label="Pastga">▼</button>
    <button type="button" data-hold="boost">Turbo</button>
  </div>
</div>

<div class="brain__hud brain__toast" data-el="toast" hidden></div>

<aside class="brain__panel" data-el="panel" hidden aria-live="polite">
  <button class="brain__close" data-el="close" type="button" aria-label="Yopish">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
  </button>
  <div class="brain__panel-head" data-el="panelHead"></div>
  <div class="brain__panel-body" data-el="panelBody"></div>
</aside>
`

// ── Ovoz ─────────────────────────────────────────────────
// Hech qanday audio fayl yo'q — hammasi Web Audio'da sintez qilinadi.
// Brauzer ovozni faqat birinchi bosish yoki tugmadan keyin ruxsat beradi.
function createSound() {
  const STORE = 'musaMiyaSound'
  let enabled = true
  try { const v = localStorage.getItem(STORE); if (v !== null) enabled = v === '1' } catch { /* saqlanmasa ham ishlaydi */ }
  let ac = null, master, fx, verb, engGain, engFilter, hum, humGain
  let started = false, lastEngine = 0, lastTick = 0, lastPing = 0, sparkleTimer = 0, destroyed = false
  const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66]
  const BASE = { core: 130.81, system: 196, category: 164.81, section: 220, product: 329.63, order: 261.63, customer: 293.66, staff: 246.94 }
  const t0 = () => ac.currentTime
  const live = () => ac && enabled && started && ac.state === 'running'
  let ui = () => {}

  function buffer(seconds, channels, fill) {
    const len = Math.floor(ac.sampleRate * seconds)
    const buf = ac.createBuffer(channels, len, ac.sampleRate)
    for (let c = 0; c < channels; c++) fill(buf.getChannelData(c), len)
    return buf
  }
  const brown = (s) => buffer(s, 1, (d, len) => {
    let last = 0
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 }
  })
  const white = (s) => buffer(s, 1, (d, len) => { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1 })
  const space = (s, decay) => buffer(s, 2, (d, len) => {
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  })
  function lfo(freq, depth, param) {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.frequency.value = freq; g.gain.value = depth
    o.connect(g).connect(param); o.start()
  }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ac = new AC()
    master = ac.createGain(); master.gain.value = 0
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -16; comp.ratio.value = 3
    master.connect(comp).connect(ac.destination)

    // Katta zal aks-sadosi — kosmik kenglik hissi shundan
    verb = ac.createConvolver(); verb.buffer = space(4.5, 2.4)
    const wet = ac.createGain(); wet.gain.value = 0.55
    verb.connect(wet).connect(master)
    fx = ac.createGain(); fx.gain.value = 0.85
    fx.connect(master); fx.connect(verb)

    // Fon: past chastotali akkord, sekin nafas olayotgan filtr
    const pad = ac.createGain(); pad.gain.value = 0.085
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460; lp.Q.value = 0.5
    lp.connect(pad); pad.connect(master); pad.connect(verb)
    ;[[55, 'sine', 1], [82.41, 'triangle', 0.55], [110, 'sine', 0.5], [164.81, 'triangle', 0.22], [246.94, 'sine', 0.1]]
      .forEach(([f, type, amp], i) => [-7, 7].forEach((det) => {
        const o = ac.createOscillator()
        const g = ac.createGain()
        o.type = type; o.frequency.value = f; o.detune.value = det + i * 1.3
        g.gain.value = amp * 0.5
        o.connect(g).connect(lp); o.start()
        lfo(0.03 + i * 0.011, amp * 0.16, g.gain)
      }))
    lfo(0.045, 240, lp.frequency)

    // Kosmik shamol
    const wind = ac.createBufferSource(); wind.buffer = brown(6); wind.loop = true
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 540; bp.Q.value = 0.9
    const wg = ac.createGain(); wg.gain.value = 0.05
    wind.connect(bp).connect(wg); wg.connect(master); wg.connect(verb); wind.start()
    lfo(0.06, 340, bp.frequency); lfo(0.037, 0.028, wg.gain)

    // Dvigatel — faqat parvozda eshitiladi
    const eng = ac.createBufferSource(); eng.buffer = brown(4); eng.loop = true
    engFilter = ac.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 120
    engGain = ac.createGain(); engGain.gain.value = 0
    eng.connect(engFilter).connect(engGain).connect(master); eng.start()
    hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 46
    const hf = ac.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 240
    humGain = ac.createGain(); humGain.gain.value = 0
    hum.connect(hf).connect(humGain).connect(master); hum.start()

    sparkle()
    return true
  }

  function voice(freq, { type = 'sine', dur = 1.2, gain = 0.2, attack = 0.005, when: w = 0 } = {}) {
    const t = t0() + w
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(fx)
    o.start(t); o.stop(t + dur + 0.05)
  }
  function sweep(dur, gain, from, peak, to) {
    const t = t0()
    const src = ac.createBufferSource(); src.buffer = white(dur + 0.1)
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1
    bp.frequency.setValueAtTime(from, t)
    bp.frequency.exponentialRampToValueAtTime(peak, t + dur * 0.45)
    bp.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(g).connect(fx)
    src.start(t); src.stop(t + dur + 0.1)
  }
  // Uzoq yulduzlardan kelgan qo'ng'iroqchalar — tasodifiy, kamdan-kam
  function sparkle() {
    sparkleTimer = setTimeout(() => {
      if (destroyed) return
      if (live() && !document.hidden) {
        const n = PENTA[6 + Math.floor(Math.random() * 6)]
        voice(n, { gain: 0.028, dur: 3.2, attack: 0.25 })
        voice(n * 1.5, { gain: 0.014, dur: 3.6, attack: 0.5, when: 0.35 })
      }
      sparkle()
    }, 4200 + Math.random() * 6500)
  }

  const onVisibility = () => {
    if (!ac) return
    if (document.hidden) ac.suspend()
    else if (enabled && started) ac.resume()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    onChange(fn) { ui = fn; ui() },
    get on() { return enabled },
    get started() { return started },
    unlock() {
      if (started || !enabled || destroyed) return
      if (!ac && !init()) return
      ac.resume()
      started = true
      master.gain.setTargetAtTime(0.8, t0(), 0.9)
      ui()
    },
    toggle() {
      enabled = !enabled
      try { localStorage.setItem(STORE, enabled ? '1' : '0') } catch { /* e'tiborsiz */ }
      if (enabled) {
        if (!ac && !init()) { enabled = false; ui(); return }
        ac.resume(); started = true
        master.gain.setTargetAtTime(0.8, t0(), 0.3)
        this.click()
      } else if (ac) {
        master.gain.setTargetAtTime(0, t0(), 0.12)
      }
      ui()
    },
    chime(type) {
      if (!live()) return
      const b = BASE[type] || 261.63
      voice(b * 2, { gain: 0.13, dur: 2.4 })
      voice(b * 4, { gain: 0.05, dur: 1.6, when: 0.02 })
      voice(b * 3, { type: 'triangle', gain: 0.05, dur: 2, when: 0.09 })
    },
    alert() {
      if (!live()) return
      ;[523.25, 659.25, 783.99].forEach((f, i) => voice(f, { gain: 0.09, dur: 1.4, when: i * 0.12 }))
    },
    tick() {
      if (!live()) return
      const now = performance.now()
      if (now - lastTick < 70) return
      lastTick = now
      voice(2600, { type: 'triangle', gain: 0.02, dur: 0.07, attack: 0.002 })
    },
    click() {
      if (!live()) return
      voice(1320, { type: 'triangle', gain: 0.05, dur: 0.1, attack: 0.002 })
      voice(1980, { type: 'sine', gain: 0.02, dur: 0.08, attack: 0.002, when: 0.03 })
    },
    ping(step) {
      if (!live()) return
      const now = performance.now()
      if (now - lastPing < 130) return
      lastPing = now
      voice(PENTA[(step % 6) + 5], { gain: 0.032, dur: 0.9, attack: 0.004 })
    },
    whoosh() { if (live()) sweep(1.15, 0.2, 260, 2200, 320) },
    pass() { if (live()) sweep(0.6, 0.11, 700, 3200, 500) },
    warp(up) {
      if (!live()) return
      const t = t0()
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(up ? 110 : 880, t)
      o.frequency.exponentialRampToValueAtTime(up ? 880 : 90, t + 0.9)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1)
      o.connect(g).connect(fx); o.start(t); o.stop(t + 1.05)
      sweep(1, 0.14, up ? 300 : 2400, up ? 2600 : 900, up ? 900 : 200)
    },
    engine(level, boost) {
      if (!ac) return
      const now = performance.now()
      if (now - lastEngine < 60) return
      lastEngine = now
      const t = t0()
      const on = live() ? level : 0
      engGain.gain.setTargetAtTime(on * 0.55, t, 0.15)
      engFilter.frequency.setTargetAtTime(120 + on * 900 + (boost ? 700 : 0), t, 0.2)
      humGain.gain.setTargetAtTime(on * 0.045, t, 0.2)
      hum.frequency.setTargetAtTime(44 + on * 32 + (boost ? 26 : 0), t, 0.3)
    },
    destroy() {
      destroyed = true
      clearTimeout(sparkleTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      if (ac) ac.close().catch(() => {})
    },
  }
}

// ── Dvigatel ─────────────────────────────────────────────
export function createBrain(root, { onNavigate } = {}) {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches
  const COARSE = matchMedia('(pointer: coarse)').matches
  root.innerHTML = MARKUP
  const $ = (name) => root.querySelector(`[data-el="${name}"]`)

  const disposers = []
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts)
    disposers.push(() => target.removeEventListener(type, fn, opts))
  }

  const Sound = createSound()

  // Barqaror tasodif: har qayta qurishda galaktika bir xil joyda turadi
  let seed = 1
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const gauss = () => {
    let u = 0, v = 0
    while (!u) u = rand()
    while (!v) v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  // ── Sahna ──────────────────────────────────────────────
  let DATA = null
  let nodes = [], byId = new Map(), edges = [], adj = new Map(), DUST = [], FAR = []
  let armBase = []
  const dustColors = ['gold', 'amber', 'green', 'teal', 'ice', 'white']

  function add(n) {
    n.flash = 0
    nodes.push(n); byId.set(n.id, n); adj.set(n.id, new Set())
    return n
  }
  function link(a, b, kind) {
    const A = byId.get(a), B = byId.get(b)
    if (!A || !B || A === B) return
    edges.push({ a: A, b: B, kind })
    adj.get(a).add(b); adj.get(b).add(a)
  }
  function armPoint(k, t, lateral = 0, lift = 0) {
    const th = armBase[k] + t * ARM_TURN
    const r = ARM_START + t * ARM_LEN + lateral
    return { x: Math.cos(th) * r, y: lift, z: Math.sin(th) * r }
  }

  function build(data) {
    seed = 20260914
    nodes = []; byId = new Map(); edges = []; adj = new Map()
    const { products, sections, categories, orders, customers, staff } = data

    add({ id: 'core', type: 'core', label: 'MUSA', x: 0, y: 0, z: 0, r: 16, color: 'gold', layer: null })

    SYSTEMS.forEach((s, i) => {
      const a = -Math.PI / 2 + (i / SYSTEMS.length) * Math.PI * 2
      add({ id: `sys:${s.key}`, type: 'system', label: s.label, sub: s.sub, info: s.info,
        x: Math.cos(a) * 118, y: Math.sin(i * 1.7) * 14, z: Math.sin(a) * 118, r: 6.5, color: 'teal', layer: null, angle: a })
      link('core', `sys:${s.key}`, 'core')
    })
    SYSTEM_LINKS.forEach(([a, b]) => link(`sys:${a}`, `sys:${b}`, 'flow'))

    armBase = categories.map((_, i) => 0.35 + (i / Math.max(1, categories.length)) * Math.PI * 2)
    categories.forEach((cat, k) => {
      const inCat = products.filter((p) => p.category === cat.name).sort((a, b) => a.order - b.order)
      const catSecs = sections.filter((s) => s.category === cat.name).sort((a, b) => a.order - b.order)
      const secIds = new Set(catSecs.map((s) => s.id))
      const cid = `cat:${cat.id}`
      add({ id: cid, type: 'category', label: cat.name, ...armPoint(k, 0.02, 0, 10), r: 10, color: 'green', layer: 'catalog', count: inCat.length })
      link('sys:firestore', cid, 'data')

      catSecs.forEach((sec, j) => {
        const t = 0.2 + (catSecs.length === 1 ? 0.3 : (j / (catSecs.length - 1)) * 0.72)
        const pos = armPoint(k, t, (j % 2 ? 1 : -1) * 34, ((j % 3) - 1) * 16)
        const sid = `sec:${sec.id}`
        const own = inCat.filter((p) => p.sectionId === sec.id)
        add({ id: sid, type: 'section', label: sec.name, ...pos, r: 5.5, color: 'green', layer: 'catalog', category: cat.name, count: own.length })
        link(cid, sid, 'tree')
        own.forEach((p, i) => {
          const rr = 16 + 8.5 * Math.sqrt(i + 1)
          const ang = i * 2.39996 + j
          add({ id: `p:${p.id}`, type: 'product', label: p.name,
            x: pos.x + Math.cos(ang) * rr, y: pos.y + gauss() * 7, z: pos.z + Math.sin(ang) * rr,
            r: 2.6, color: p.stock === 0 ? 'rose' : 'green', layer: 'catalog', data: p, category: cat.name, section: sec.name })
          link(sid, `p:${p.id}`, 'tree')
        })
      })

      const loose = inCat.filter((p) => !p.sectionId || !secIds.has(p.sectionId))
      loose.forEach((p, i) => {
        const t = 0.12 + ((i + 0.5) / loose.length) * 0.84
        const pos = armPoint(k, t, (i % 2 ? 1 : -1) * (70 + rand() * 60), gauss() * 12)
        add({ id: `p:${p.id}`, type: 'product', label: p.name, ...pos, r: 2.6, color: p.stock === 0 ? 'rose' : 'green', layer: 'catalog', data: p, category: cat.name, section: null })
        link(cid, `p:${p.id}`, 'tree')
      })
    })

    const miniA = byId.get('sys:miniapp').angle
    customers.forEach((c, i) => {
      const a = miniA + (i - (customers.length - 1) / 2) * 0.12
      add({ id: `u:${c.id}`, type: 'customer', label: c.name, x: Math.cos(a) * (200 + (i % 3) * 18), y: 40 + (i % 4) * 8, z: Math.sin(a) * (200 + (i % 3) * 18), r: 3.6, color: 'ice', layer: 'customers', data: c })
      link('sys:miniapp', `u:${c.id}`, 'customer')
    })

    const staffAnchor = { owner: 'admin', admin: 'admin', courier: 'telegram' }
    staff.forEach((s, i) => {
      const anchor = byId.get(`sys:${staffAnchor[s.role] || 'admin'}`)
      const a = anchor.angle + ((i % 2 ? 1 : -1) * (0.16 + 0.06 * Math.floor(i / 2)))
      add({ id: `s:${s.id}`, type: 'staff', label: s.name || ROLE[s.role] || 'Xodim', x: Math.cos(a) * 195, y: -40 - (i % 3) * 10, z: Math.sin(a) * 195, r: 3.6, color: 'violet', layer: 'staff', data: s })
      link(anchor.id, `s:${s.id}`, 'staff')
    })

    const serverA = byId.get('sys:server').angle
    orders.forEach((o, i) => {
      const a = serverA + (i - (orders.length - 1) / 2) * 0.09
      const oid = `o:${o.id}`
      add({ id: oid, type: 'order', label: o.number, x: Math.cos(a) * (205 + (i % 4) * 14), y: -30 + (i % 3) * 14, z: Math.sin(a) * (205 + (i % 4) * 14), r: 3.8, color: STATUS[o.status] || 'amber', layer: 'orders', data: o })
      link('sys:server', oid, 'orderSys')
      if (o.customerId) link(oid, `u:${o.customerId}`, 'order')
      if (o.courierId) link(oid, `s:${o.courierId}`, 'staff')
      o.items.forEach((it) => link(oid, `p:${it.id}`, 'order'))
    })

    // Orqa fon: qo'llar bo'ylab yulduz changi va uzoq yulduzlar
    DUST = []
    for (let i = 0; i < 1200; i++) {
      const r = Math.abs(gauss()) * 95
      const th = rand() * Math.PI * 2
      DUST.push({ x: Math.cos(th) * r, y: gauss() * 22 * Math.exp(-r / 120), z: Math.sin(th) * r, c: rand() < 0.7 ? 0 : 1, s: 0.6 + rand() * 0.9, a: 0.35 + rand() * 0.5 })
    }
    const arms = Math.max(3, categories.length)
    for (let k = 0; k < arms; k++) {
      if (armBase[k] === undefined) armBase[k] = 0.35 + (k / arms) * Math.PI * 2
      for (let i = 0; i < Math.round(4500 / arms); i++) {
        const t = Math.pow(rand(), 0.9) * 1.08
        const p = armPoint(k, t, gauss() * (26 + t * 70), gauss() * (6 + t * 12))
        const tone = t < 0.25 ? (rand() < 0.5 ? 1 : 2) : rand() < 0.55 ? 2 : rand() < 0.6 ? 3 : rand() < 0.5 ? 4 : 5
        DUST.push({ ...p, c: tone, s: 0.5 + rand() * 0.9, a: 0.18 + rand() * 0.45 })
      }
    }
    for (let i = 0; i < 900; i++) {
      const th = rand() * Math.PI * 2, r = 520 + rand() * 1100
      DUST.push({ x: Math.cos(th) * r, y: gauss() * 30, z: Math.sin(th) * r, c: rand() < 0.5 ? 5 : 4, s: 0.4 + rand() * 0.6, a: 0.08 + rand() * 0.22 })
    }
    DUST.sort((a, b) => a.c - b.c)
    if (!FAR.length) {
      for (let i = 0; i < 1100; i++) {
        const u = rand() * 2 - 1, th = rand() * Math.PI * 2, q = Math.sqrt(1 - u * u)
        FAR.push({ x: q * Math.cos(th), y: u, z: q * Math.sin(th), s: 0.3 + rand() * 0.9, a: 0.15 + rand() * 0.55, tw: rand() * 6.28 })
      }
    }
  }

  // ── Kamera ─────────────────────────────────────────────
  const cam = { yaw: 0.55, pitch: 0.64, dist: 2600, tx: 0, ty: 0, tz: 0 }
  const goal = { yaw: 0.55, pitch: 0.64, dist: DIST.far, tx: 0, ty: 0, tz: 0 }
  let W = 0, H = 0, F = 1, DPR = 1
  const B = { px: 0, py: 0, pz: 0, fx: 0, fy: 0, fz: 0, rx: 0, rz: 0, ux: 0, uy: 0, uz: 0 }
  function basis() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw)
    B.px = cam.tx + cam.dist * cp * sy; B.py = cam.ty + cam.dist * sp; B.pz = cam.tz + cam.dist * cp * cy
    B.fx = -cp * sy; B.fy = -sp; B.fz = -cp * cy
    B.rx = -B.fz / cp; B.rz = B.fx / cp
    B.ux = -B.rz * B.fy; B.uy = B.rz * B.fx - B.rx * B.fz; B.uz = B.rx * B.fy
  }
  const P = [0, 0, 0, 0]
  function project(x, y, z) {
    const dx = x - B.px, dy = y - B.py, dz = z - B.pz
    const zc = dx * B.fx + dy * B.fy + dz * B.fz
    if (zc < 8) return null
    const s = F / zc
    P[0] = W / 2 + (dx * B.rx + dz * B.rz) * s
    P[1] = H / 2 - (dx * B.ux + dy * B.uy + dz * B.uz) * s
    P[2] = s; P[3] = zc
    return P
  }

  // Yorug'lik sprite'lari
  const SPRITE = {}
  Object.keys(RGB).forEach((k) => {
    const c = document.createElement('canvas')
    c.width = c.height = 96
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(48, 48, 0, 48, 48, 48)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.1, css(k, 0.95))
    grd.addColorStop(0.28, css(k, 0.38))
    grd.addColorStop(0.55, css(k, 0.09))
    grd.addColorStop(1, css(k, 0))
    g.fillStyle = grd
    g.fillRect(0, 0, 96, 96)
    SPRITE[k] = c
  })

  // ── Holat ──────────────────────────────────────────────
  const layers = { catalog: true, orders: true, customers: true, staff: true, flow: true }
  let selected = null, hover = null
  let lastInput = performance.now()
  const shown = (n) => !n.layer || layers[n.layer]
  const pilot = { on: false, vx: 0, vy: 0, vz: 0, speed: 0, boost: false, stickX: 0, stickY: 0, lift: 0, aim: null, passed: new Map() }
  const keys = new Set()
  const pulses = []

  const canvas = $('sky')
  const ctx = canvas.getContext('2d')
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2)
    W = root.clientWidth; H = root.clientHeight
    canvas.width = Math.max(1, Math.round(W * DPR)); canvas.height = Math.max(1, Math.round(H * DPR))
    F = Math.min(W, H) * 0.95 + Math.max(0, W - H) * 0.12
  }
  const ro = new ResizeObserver(resize)
  ro.observe(root)
  resize()

  const toastEl = $('toast')
  let toastTimer = 0
  function toast(text) {
    toastEl.textContent = text
    toastEl.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 5200)
  }

  function pulse(ids, color, speed = 1.7) {
    if (REDUCE) return
    const path = ids.map((id) => byId.get(id)).filter(Boolean)
    if (path.length > 1) pulses.push({ ids: path.map((n) => n.id), seg: 0, t: 0, color, speed })
  }

  // ── Chizish ────────────────────────────────────────────
  const LABEL_BOXES = []
  const overlaps = (x, y, w, h) => LABEL_BOXES.some((b) => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1])

  function draw(time, dt) {
    basis()
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#02050b'
    ctx.fillRect(0, 0, W, H)
    const zoomT = Math.min(1, Math.max(0, (cam.dist - DIST.near) / (DIST.far - DIST.near)))

    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = '#dfe9ff'
    for (const s of FAR) {
      const zc = s.x * B.fx + s.y * B.fy + s.z * B.fz
      if (zc <= 0.05) continue
      const x = W / 2 + ((s.x * B.rx + s.z * B.rz) / zc) * F * 0.9
      const y = H / 2 - ((s.x * B.ux + s.y * B.uy + s.z * B.uz) / zc) * F * 0.9
      if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue
      ctx.globalAlpha = s.a * (REDUCE ? 1 : 0.75 + 0.25 * Math.sin(time * 0.0012 + s.tw))
      ctx.fillRect(x, y, s.s, s.s)
    }

    const core = project(0, 0, 0)
    if (core) {
      const cx = core[0], cy = core[1]
      const R = Math.max(140, core[2] * 900)
      let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      g.addColorStop(0, 'rgba(242,201,76,0.20)')
      g.addColorStop(0.18, 'rgba(242,170,60,0.08)')
      g.addColorStop(0.5, 'rgba(46,229,140,0.035)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 1
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22)
      g.addColorStop(0, 'rgba(255,236,170,0.28)')
      g.addColorStop(1, 'rgba(255,236,170,0)')
      ctx.fillStyle = g
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    }

    let lastColor = -1
    for (const d of DUST) {
      const p = project(d.x, d.y, d.z)
      if (!p || p[0] < -4 || p[1] < -4 || p[0] > W + 4 || p[1] > H + 4) continue
      if (d.c !== lastColor) { ctx.fillStyle = css(dustColors[d.c]); lastColor = d.c }
      const size = Math.min(2.6, Math.max(0.5, d.s * p[2] * 1.9))
      ctx.globalAlpha = d.a * Math.min(1, 0.45 + p[2] * 1.2)
      ctx.fillRect(p[0], p[1], size, size)
    }

    for (const n of nodes) {
      const p = project(n.x, n.y, n.z)
      n.vis = Boolean(p) && shown(n)
      if (p) { n.sx = p[0]; n.sy = p[1]; n.ss = p[2]; n.zc = p[3] }
    }

    const focus = selected ? adj.get(selected.id) : null
    const lit = (n) => !selected || n === selected || focus.has(n.id)

    if (pilot.on) {
      let best = null, bestD = 70
      for (const n of nodes) {
        if (!n.vis) continue
        const dd = Math.hypot(n.sx - W / 2, n.sy - H / 2)
        if (dd < bestD) { best = n; bestD = dd }
      }
      if (best !== pilot.aim) { pilot.aim = best; if (best) Sound.tick() }
    } else {
      pilot.aim = null
    }

    ctx.lineCap = 'round'
    const EDGE = {
      core: ['gold', 0.22, 0.9], flow: ['teal', 0.34, 1.2], data: ['teal', 0.12, 1],
      tree: ['green', 0.05 + 0.13 * (1 - zoomT), 0.8], order: ['ice', 0.3, 0.9],
      orderSys: ['amber', 0.16, 0.8], customer: ['ice', 0.22, 0.9], staff: ['violet', 0.3, 0.9],
    }
    for (const e of edges) {
      if (!e.a.vis || !e.b.vis) continue
      if (e.kind === 'flow' && !layers.flow && !selected) continue
      const [color, alpha, width] = EDGE[e.kind]
      const touches = selected && (e.a === selected || e.b === selected)
      ctx.globalAlpha = selected ? (touches ? 0.95 : alpha * 0.28) : alpha
      ctx.strokeStyle = css(touches ? 'white' : color)
      ctx.lineWidth = touches ? 1.6 : width
      ctx.beginPath()
      ctx.moveTo(e.a.sx, e.a.sy)
      ctx.lineTo(e.b.sx, e.b.sy)
      ctx.stroke()
    }

    const order = nodes.filter((n) => n.vis).sort((a, b) => b.zc - a.zc)
    for (const n of order) {
      n.flash = Math.max(0, n.flash - dt * 1.6)
      const breathe = REDUCE ? 1 : 1 + 0.07 * Math.sin(time * 0.0016 + n.x * 0.01)
      // Yangi buyurtma e'tibor talab qiladi — kuchliroq miltillaydi
      const urgent = n.type === 'order' && n.data.status === 'Yangi' && !REDUCE ? 1 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.006)) : 1
      const dim = lit(n) ? 1 : 0.22
      const px = n.r * n.ss
      const glow = Math.min(n.type === 'core' ? 520 : 150, Math.max(n.type === 'product' ? 5 : 9, px * (n.type === 'core' ? 13 : 7))) * breathe * urgent * (1 + n.flash * 1.4)
      ctx.globalAlpha = dim * (n.type === 'product' ? 0.85 : 1)
      ctx.drawImage(SPRITE[n.color], n.sx - glow / 2, n.sy - glow / 2, glow, glow)
      ctx.globalAlpha = dim
      ctx.fillStyle = n.type === 'core' ? '#fff6d6' : '#f4fff9'
      const dot = Math.min(10, Math.max(n.type === 'product' ? 0.7 : 1.2, px * 0.55))
      ctx.beginPath()
      ctx.arc(n.sx, n.sy, dot, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
    if (selected && selected.vis) {
      const rr = Math.max(14, selected.r * selected.ss * 3.2) + (REDUCE ? 0 : Math.sin(time * 0.004) * 2)
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = css('gold', 0.9)
      ctx.lineWidth = 1.2
      ctx.setLineDash([3, 5])
      ctx.beginPath()
      ctx.arc(selected.sx, selected.sy, rr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    const aim = pilot.aim
    if (aim && aim.vis) {
      const rr = Math.max(12, aim.r * aim.ss * 2.6) + 6
      const arm = 6
      ctx.globalAlpha = 0.95
      ctx.strokeStyle = css('gold', 0.95)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = aim.sx + sx * rr, cy = aim.sy + sy * rr
        ctx.moveTo(cx, cy - sy * arm); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * arm, cy)
      }
      ctx.stroke()
    }

    // Impulslar
    ctx.globalCompositeOperation = 'lighter'
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pu = pulses[i]
      const path = pu.ids.map((id) => byId.get(id))
      if (path.some((n) => !n)) { pulses.splice(i, 1); continue }
      pu.t += dt * pu.speed
      while (pu.t >= 1 && pu.seg < path.length - 1) {
        pu.t -= 1; pu.seg++
        const reached = path[pu.seg]
        reached.flash = 1
        if (reached.vis && reached.sx > 0 && reached.sx < W && reached.sy > 0 && reached.sy < H) Sound.ping(pu.seg)
      }
      if (pu.seg >= path.length - 1) { pulses.splice(i, 1); continue }
      const a = path[pu.seg], b = path[pu.seg + 1]
      if (!shown(a) || !shown(b)) continue
      const ease = pu.t * pu.t * (3 - 2 * pu.t)
      for (let k = 0; k < 6; k++) {
        const tt = Math.max(0, ease - k * 0.045)
        const p = project(a.x + (b.x - a.x) * tt, a.y + (b.y - a.y) * tt, a.z + (b.z - a.z) * tt)
        if (!p) continue
        const size = (k === 0 ? 26 : 14 - k * 1.6) * Math.min(1.6, Math.max(0.55, p[2] * 2.2))
        ctx.globalAlpha = k === 0 ? 1 : 0.5 - k * 0.07
        ctx.drawImage(SPRITE[pu.color], p[0] - size / 2, p[1] - size / 2, size, size)
      }
    }

    // Yozuvlar
    ctx.globalCompositeOperation = 'source-over'
    LABEL_BOXES.length = 0
    const want = []
    for (const n of order) {
      let pri = { core: 100, system: 90, category: 86, section: 62, order: 58, staff: 56, customer: 56, product: 30 }[n.type]
      const scr = n.r * n.ss
      if (n.type === 'section' && zoomT > 0.72) pri = -1
      if ((n.type === 'order' || n.type === 'customer' || n.type === 'staff') && zoomT > 0.8) pri = -1
      if (n.type === 'product' && scr < 0.9) pri = -1
      if (selected && n === selected) pri = 200
      else if (selected && focus.has(n.id)) pri = Math.max(pri, 80)
      if (hover === n) pri = 190
      if (pilot.aim === n) pri = 195
      if (pri < 0) continue
      if (n.sx < -60 || n.sx > W + 60 || n.sy < -30 || n.sy > H + 30) continue
      want.push([pri - n.zc * 0.0005, n])
    }
    want.sort((a, b) => b[0] - a[0])
    let placed = 0
    ctx.textBaseline = 'middle'
    for (const [, n] of want) {
      if (placed > 46) break
      const big = n.type === 'core' || n.type === 'category'
      const font = big ? `800 ${n.type === 'core' ? 15 : 13}px Montserrat, sans-serif` : n.type === 'system' ? '700 12px Montserrat, sans-serif' : '600 11px Montserrat, sans-serif'
      ctx.font = font
      let text = n.label
      if (n.type === 'product' && text.length > 26) text = `${text.slice(0, 25)}…`
      const extra = n.type === 'category' || n.type === 'section' ? `${n.count}` : n.type === 'system' ? n.sub : ''
      const tw = ctx.measureText(text).width
      ctx.font = '400 10px "JetBrains Mono", ui-monospace, monospace'
      const ew = extra ? ctx.measureText(extra).width + 7 : 0
      const off = Math.max(8, n.r * n.ss * 2.4)
      const bx = n.sx + off, by = n.sy - 8
      if (overlaps(bx - 3, by - 2, tw + ew + 6, 20) && !(selected === n || hover === n || pilot.aim === n)) continue
      LABEL_BOXES.push([bx - 3, by - 2, tw + ew + 6, 20])
      placed++
      ctx.globalAlpha = lit(n) ? 1 : 0.35
      ctx.font = font
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 6
      ctx.fillStyle = n.type === 'core' ? '#f7e3a1' : n.type === 'product' ? '#c9ddd3' : '#e6f2ec'
      ctx.fillText(text, bx, n.sy)
      if (extra) {
        ctx.font = '400 10px "JetBrains Mono", ui-monospace, monospace'
        ctx.fillStyle = n.type === 'system' ? '#6f8a80' : css(n.color, 0.95)
        ctx.fillText(extra, bx + tw + 7, n.sy + 0.5)
      }
      ctx.shadowBlur = 0
    }
    ctx.globalAlpha = 1
  }

  // ── Parvoz ─────────────────────────────────────────────
  const flightEl = $('flight')
  let lastReadout = 0
  function steer(dt, now) {
    basis()
    const held = (...codes) => codes.some((c) => keys.has(c))
    const look = 1.5 * dt
    if (held('ArrowLeft')) { goal.yaw += look; cam.yaw += look }
    if (held('ArrowRight')) { goal.yaw -= look; cam.yaw -= look }
    if (held('ArrowUp')) { goal.pitch = cam.pitch = Math.max(-1.45, cam.pitch - look * 0.8) }
    if (held('ArrowDown')) { goal.pitch = cam.pitch = Math.min(1.45, cam.pitch + look * 0.8) }

    let fwd = (held('KeyW') ? 1 : 0) - (held('KeyS') ? 1 : 0) - pilot.stickY
    let side = (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0) + pilot.stickX
    let lift = (held('KeyE', 'Space') ? 1 : 0) - (held('KeyQ', 'KeyC') ? 1 : 0) + pilot.lift
    const len = Math.hypot(fwd, side, lift)
    if (len > 1) { fwd /= len; side /= len; lift /= len }
    const boost = held('ShiftLeft', 'ShiftRight') || pilot.boost
    const max = boost ? 780 : 240

    const wx = (B.fx * fwd + B.rx * side) * max
    const wy = (B.fy * fwd + lift) * max
    const wz = (B.fz * fwd + B.rz * side) * max
    const ease = 1 - Math.exp(-dt * (len ? 3.4 : 2.1))
    pilot.vx += (wx - pilot.vx) * ease
    pilot.vy += (wy - pilot.vy) * ease
    pilot.vz += (wz - pilot.vz) * ease

    goal.tx += pilot.vx * dt; goal.ty += pilot.vy * dt; goal.tz += pilot.vz * dt
    const far = Math.hypot(goal.tx, goal.ty, goal.tz)
    if (far > FLY_LIMIT) { const s = FLY_LIMIT / far; goal.tx *= s; goal.ty *= s; goal.tz *= s }
    cam.tx = goal.tx; cam.ty = goal.ty; cam.tz = goal.tz
    goal.dist = cam.dist = FLY_D

    pilot.speed = Math.hypot(pilot.vx, pilot.vy, pilot.vz)
    Sound.engine(Math.min(1, pilot.speed / 780), boost && pilot.speed > 300)

    if (pilot.speed > 60) {
      for (const n of nodes) {
        if (!shown(n) || (n.type === 'product' && pilot.speed < 150)) continue
        const d = Math.hypot(n.x - B.px, n.y - B.py, n.z - B.pz)
        if (d < 24 + n.r * 4 && now - (pilot.passed.get(n.id) || 0) > 1600) {
          pilot.passed.set(n.id, now)
          n.flash = 0.8
          Sound.pass()
        }
      }
    }

    if (now - lastReadout > 120) {
      lastReadout = now
      const label = pilot.aim ? pilot.aim.label : ''
      const target = pilot.aim ? ` · nishon <em>${esc(label.length > 22 ? `${label.slice(0, 21)}…` : label)}</em>` : ''
      flightEl.innerHTML = `tezlik <b>${Math.round(pilot.speed)}</b> · yadrodan <b>${num(Math.round(Math.hypot(B.px, B.py, B.pz)))}</b>${target}${boost ? ' · <em>turbo</em>' : ''}`
    }
  }

  function enterFlight() {
    if (pilot.on) return
    basis()
    goal.tx = cam.tx = B.px + B.fx * FLY_D
    goal.ty = cam.ty = B.py + B.fy * FLY_D
    goal.tz = cam.tz = B.pz + B.fz * FLY_D
    goal.dist = cam.dist = FLY_D
    goal.yaw = cam.yaw; goal.pitch = cam.pitch
    pilot.vx = pilot.vy = pilot.vz = 0
    pilot.on = true
    root.classList.add('is-flying')
    Sound.warp(true)
  }
  function exitFlight() {
    if (!pilot.on) return
    basis()
    const d = 480
    goal.tx = cam.tx = B.px + B.fx * d
    goal.ty = cam.ty = B.py + B.fy * d
    goal.tz = cam.tz = B.pz + B.fz * d
    goal.dist = cam.dist = d
    pilot.on = false
    pilot.stickX = pilot.stickY = pilot.lift = 0
    pilot.boost = false
    keys.clear()
    root.classList.remove('is-flying')
    Sound.warp(false)
  }
  const toggleFlight = () => (pilot.on ? exitFlight() : enterFlight())

  function flyTo(n) {
    const d = { core: DIST.far * 0.9, system: 560, category: 820, section: 360, product: 190, order: 330, customer: 300, staff: 300 }[n.type]
    goal.tx = n.type === 'core' ? 0 : n.x
    goal.ty = n.type === 'core' ? 0 : n.y
    goal.tz = n.type === 'core' ? 0 : n.z
    goal.dist = d
  }
  function resetView() {
    select(null)
    Object.assign(goal, { tx: 0, ty: 0, tz: 0, dist: DIST.far, pitch: 0.64 })
  }
  function goHome() {
    exitFlight()
    resetView()
    Sound.whoosh()
  }

  // ── Kadr sikli ─────────────────────────────────────────
  let raf = 0
  let prev = performance.now()
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000)
    prev = now
    const k = REDUCE ? 1 : 1 - Math.pow(0.0025, dt)
    if (!REDUCE && !selected && !pilot.on && now - lastInput > 5000) goal.yaw += dt * 0.035
    if (pilot.on) steer(dt, now)
    else Sound.engine(0, false)
    for (const key of ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz']) cam[key] += (goal[key] - cam[key]) * k
    if (DATA && W > 0 && H > 0) draw(now, dt)
    syncScale()
    raf = requestAnimationFrame(frame)
  }

  // ── Sichqoncha va sensor ───────────────────────────────
  const pointers = new Map()
  let downAt = null, pinch = null, lastTap = 0
  const local = (e) => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  function pick(x, y) {
    let best = null, bestD = Infinity
    for (const n of nodes) {
      if (!n.vis) continue
      const d = Math.hypot(n.sx - x, n.sy - y)
      const reach = Math.max(n.type === 'product' ? 9 : 14, n.r * n.ss * 2.2)
      if (d < reach && d - n.zc * 0.0004 < bestD) { best = n; bestD = d - n.zc * 0.0004 }
    }
    return best
  }
  const clampDist = (d) => Math.max(110, Math.min(3400, d))
  function pan(dx, dy) {
    const s = cam.dist / F
    goal.tx -= (dx * B.rx - dy * B.ux) * s; goal.tz -= (dx * B.rz - dy * B.uz) * s
    goal.ty += dy * B.uy * s
    cam.tx = goal.tx; cam.ty = goal.ty; cam.tz = goal.tz
  }

  listen(canvas, 'pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId) } catch { /* sun'iy hodisa */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    lastInput = performance.now()
    if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      downAt = null
    }
  })
  listen(canvas, 'pointermove', (e) => {
    const p = pointers.get(e.pointerId)
    if (!p) {
      const n = pick(...local(e))
      if (n && n !== hover) Sound.tick()
      hover = n
      canvas.classList.toggle('is-pointing', Boolean(n))
      return
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    lastInput = performance.now()
    if (pointers.size === 1) {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) downAt.moved = true
      canvas.classList.add('is-dragging')
      goal.yaw -= dx * 0.0052; cam.yaw -= dx * 0.0052
      goal.pitch = Math.max(-1.25, Math.min(1.4, goal.pitch + dy * 0.004))
      cam.pitch = Math.max(-1.25, Math.min(1.4, cam.pitch + dy * 0.004))
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      if (!pilot.on) goal.dist = clampDist(goal.dist * (pinch.d / Math.max(20, d)))
      pan(mx - pinch.mx, my - pinch.my)
      pinch = { d, mx, my }
    }
  })
  const endPointer = (e) => {
    pointers.delete(e.pointerId)
    canvas.classList.remove('is-dragging')
    if (pointers.size < 2) pinch = null
    if (downAt && !downAt.moved && performance.now() - downAt.t < 450 && pointers.size === 0) {
      const now = performance.now()
      const n = pick(...local(e))
      if (n) select(n, true)
      else if (now - lastTap < 350) goHome()
      else if (selected) select(null)
      lastTap = now
    }
    downAt = null
  }
  listen(canvas, 'pointerup', endPointer)
  listen(canvas, 'pointercancel', endPointer)
  listen(canvas, 'pointerleave', () => {
    if (!pointers.size) { hover = null; canvas.classList.remove('is-pointing') }
  })
  listen(canvas, 'wheel', (e) => {
    e.preventDefault()
    lastInput = performance.now()
    if (pilot.on) {
      basis()
      const step = -e.deltaY * 0.9
      goal.tx = cam.tx += B.fx * step; goal.ty = cam.ty += B.fy * step; goal.tz = cam.tz += B.fz * step
      return
    }
    goal.dist = clampDist(goal.dist * Math.exp(e.deltaY * 0.0012))
  }, { passive: false })

  // ── Klaviatura ─────────────────────────────────────────
  const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
  const editable = (el) => el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]')
  listen(document, 'keyup', (e) => keys.delete(e.code))
  listen(window, 'blur', () => keys.clear())
  listen(document, 'keydown', (e) => {
    if (!root.isConnected) return
    const findEl = $('find')
    if (e.target === findEl) {
      if (e.key === 'Escape') { findEl.blur(); hideResults() }
      return
    }
    if (editable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target.closest && e.target.closest('button') && (e.code === 'Space' || e.key === 'Enter')) return
    lastInput = performance.now()

    if (FLY_KEYS.has(e.code)) {
      keys.add(e.code)
      if (!pilot.on && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) enterFlight()
      if (pilot.on) { e.preventDefault(); return }
    }

    if (e.key === '/' && !pilot.on) { e.preventDefault(); findEl.focus() }
    else if (e.code === 'KeyF') toggleFlight()
    else if (e.code === 'KeyM') Sound.toggle()
    else if (e.code === 'KeyH') goHome()
    else if (e.key === 'Enter' && pilot.on && pilot.aim) select(pilot.aim, false)
    else if (e.key === 'Escape') { if (pilot.on && !selected) exitFlight(); else select(null) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goal.yaw += 0.15 }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goal.yaw -= 0.15 }
    else if (e.key === 'ArrowUp') { e.preventDefault(); goal.pitch = Math.min(1.4, goal.pitch + 0.1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); goal.pitch = Math.max(-1.25, goal.pitch - 0.1) }
    else if (e.key === '+' || e.key === '=') goal.dist = clampDist(goal.dist * 0.8)
    else if (e.key === '-') goal.dist = clampDist(goal.dist * 1.25)
  })

  // ── Sensorli parvoz tugmalari ──────────────────────────
  const stick = $('stick'), knob = $('knob')
  let stickId = null
  function moveStick(e) {
    const r = stick.getBoundingClientRect()
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2)
    const max = r.width / 2 - 12
    const l = Math.hypot(x, y)
    if (l > max) { x = (x / l) * max; y = (y / l) * max }
    knob.style.transform = `translate(${x}px, ${y}px)`
    pilot.stickX = x / max; pilot.stickY = y / max
  }
  listen(stick, 'pointerdown', (e) => {
    stickId = e.pointerId
    try { stick.setPointerCapture(e.pointerId) } catch { /* e'tiborsiz */ }
    moveStick(e)
  })
  listen(stick, 'pointermove', (e) => { if (e.pointerId === stickId) moveStick(e) })
  const releaseStick = (e) => {
    if (e.pointerId !== stickId) return
    stickId = null
    knob.style.transform = ''
    pilot.stickX = pilot.stickY = 0
  }
  listen(stick, 'pointerup', releaseStick)
  listen(stick, 'pointercancel', releaseStick)
  root.querySelectorAll('[data-hold]').forEach((b) => {
    const set = (on) => {
      b.classList.toggle('is-held', on)
      if (b.dataset.hold === 'boost') pilot.boost = on
      else pilot.lift = on ? (b.dataset.hold === 'up' ? 1 : -1) : 0
    }
    listen(b, 'pointerdown', (e) => { try { b.setPointerCapture(e.pointerId) } catch { /* e'tiborsiz */ } set(true) })
    listen(b, 'pointerup', () => set(false))
    listen(b, 'pointercancel', () => set(false))
    listen(b, 'contextmenu', (e) => e.preventDefault())
  })

  // ── Ovoz tugmasi ───────────────────────────────────────
  const soundBtn = $('sound'), soundLabel = $('soundLabel')
  Sound.onChange(() => {
    soundBtn.setAttribute('aria-pressed', String(Sound.on && Sound.started))
    soundBtn.classList.toggle('is-waiting', Sound.on && !Sound.started)
    soundLabel.textContent = !Sound.on ? 'Ovoz o‘chiq' : Sound.started ? 'Ovoz' : 'Ovozni yoqish'
  })
  listen(soundBtn, 'click', () => { if (Sound.on && !Sound.started) Sound.unlock(); else Sound.toggle() })
  const firstGesture = (e) => {
    if (!root.contains(e.target) && e.type === 'pointerdown') return
    if (e.target.closest && e.target.closest('[data-el="sound"]')) return
    Sound.unlock()
  }
  listen(window, 'pointerdown', firstGesture, true)
  listen(window, 'keydown', firstGesture, true)

  // ── To'liq ekran ───────────────────────────────────────
  // Galaktika (menyu va sarlavhasiz) butun ekranni egallaydi. Brauzer
  // qo'llamasa (masalan iPhone Safari) tugma ko'rsatilmaydi.
  const fullBtn = $('full'), fullLabel = $('fullLabel')
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement
  const canFullscreen = Boolean(root.requestFullscreen || root.webkitRequestFullscreen)
  fullBtn.hidden = !canFullscreen
  function syncFull() {
    const on = fsElement() === root
    fullBtn.setAttribute('aria-pressed', String(on))
    fullBtn.setAttribute('aria-label', on ? 'To‘liq ekrandan chiqish' : 'To‘liq ekran')
    fullLabel.textContent = on ? 'Chiqish' : 'To‘liq ekran'
    root.classList.toggle('is-full', on)
  }
  function toggleFull() {
    Sound.click()
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root)?.catch?.(() => {})
  }
  listen(fullBtn, 'click', toggleFull)
  listen(document, 'fullscreenchange', syncFull)
  listen(document, 'webkitfullscreenchange', syncFull)

  // ── Masofa, qatlamlar, hisoblagichlar ──────────────────
  const scaleEl = $('scale')
  listen(scaleEl, 'click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    lastInput = performance.now()
    if (b.dataset.mode === 'fly') { toggleFlight(); return }
    exitFlight()
    Sound.click()
    goal.dist = DIST[b.dataset.dist]
    if (!selected) { goal.tx = goal.ty = goal.tz = 0 }
  })
  let lastBand = ''
  function syncScale() {
    const band = pilot.on ? 'fly' : cam.dist > 1500 ? 'far' : cam.dist > 600 ? 'mid' : 'near'
    if (band === lastBand) return
    lastBand = band
    scaleEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.dist || b.dataset.mode) === band)))
  }

  const LAYERS = [['catalog', 'Katalog', 'green'], ['orders', 'Buyurtmalar', 'amber'], ['customers', 'Mijozlar', 'ice'], ['staff', 'Xodimlar', 'violet'], ['flow', 'Oqim', 'teal']]
  const layersEl = $('layers')
  layersEl.innerHTML = LAYERS.map(([key, label, color]) =>
    `<button class="brain__layer" type="button" data-layer="${key}" aria-pressed="${layers[key]}"><i style="background:${css(color)};box-shadow:0 0 8px ${css(color, 0.8)}"></i>${label}</button>`).join('')
  listen(layersEl, 'click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const key = b.dataset.layer
    layers[key] = !layers[key]
    b.setAttribute('aria-pressed', String(layers[key]))
    Sound.click()
    if (selected && !shown(selected)) select(null)
  })

  const countsEl = $('counts')
  function renderCounts() {
    const cats = nodes.filter((n) => n.type === 'category').sort((a, b) => b.count - a.count)
    const waiting = DATA.orders.filter((o) => o.status === 'Yangi')
    const items = [
      [DATA.products.length, 'mahsulot', 'green', cats[0]?.id],
      [DATA.sections.length, 'bo‘lim', 'green', nodes.find((n) => n.type === 'section')?.id],
      [DATA.totalOrders, 'buyurtma', 'amber', DATA.orders[0] && `o:${DATA.orders[0].id}`],
      [DATA.totalCustomers, 'mijoz', 'ice', DATA.customers[0] && `u:${DATA.customers[0].id}`],
      [DATA.staff.length, 'xodim', 'violet', DATA.staff[0] && `s:${DATA.staff[0].id}`],
    ]
    if (waiting.length) items.splice(2, 0, [waiting.length, 'kutmoqda', 'rose', `o:${waiting[0].id}`])
    countsEl.innerHTML = items.map(([n, label, color, id]) =>
      `<button class="brain__count" type="button" data-go="${esc(id || '')}"><i style="background:${css(color)};box-shadow:0 0 8px ${css(color, 0.8)}"></i><b>${num(n)}</b><span>${label}</span></button>`).join('')
  }
  listen(countsEl, 'click', (e) => {
    const b = e.target.closest('[data-go]')
    const n = b && byId.get(b.dataset.go)
    if (n) select(n, true)
  })

  // ── Qidiruv ────────────────────────────────────────────
  const findEl = $('find'), resultsEl = $('results')
  let matches = [], active = 0
  function hideResults() { resultsEl.hidden = true; matches = [] }
  function renderResults() {
    resultsEl.innerHTML = matches.map((n, i) =>
      `<button type="button" data-go="${esc(n.id)}" class="${i === active ? 'is-active' : ''}"><i style="background:${css(n.color)}"></i><span>${esc(n.label)}</span><small>${KIND[n.type]}</small></button>`).join('')
    resultsEl.hidden = !matches.length
  }
  listen(findEl, 'input', () => {
    const q = findEl.value.trim().toLowerCase()
    active = 0
    matches = q ? nodes.filter((n) => shown(n) && n.label.toLowerCase().includes(q))
      .sort((a, b) => a.label.toLowerCase().indexOf(q) - b.label.toLowerCase().indexOf(q)).slice(0, 8) : []
    renderResults()
  })
  listen(findEl, 'keydown', (e) => {
    if (!matches.length) return
    if (e.key === 'ArrowDown') { active = (active + 1) % matches.length; renderResults(); e.preventDefault() }
    if (e.key === 'ArrowUp') { active = (active - 1 + matches.length) % matches.length; renderResults(); e.preventDefault() }
    if (e.key === 'Enter') { select(matches[active], true); findEl.blur(); hideResults() }
  })
  listen(resultsEl, 'click', (e) => {
    const b = e.target.closest('[data-go]')
    if (!b) return
    select(byId.get(b.dataset.go), true)
    hideResults()
    findEl.value = ''
  })

  // ── Tafsilot paneli ────────────────────────────────────
  const panel = $('panel'), headEl = $('panelHead'), bodyEl = $('panelBody')
  listen($('close'), 'click', () => select(null))
  listen(bodyEl, 'click', (e) => {
    const nav = e.target.closest('[data-nav]')
    if (nav) { onNavigate?.(nav.dataset.nav); return }
    const b = e.target.closest('[data-go]')
    const n = b && byId.get(b.dataset.go)
    if (n) select(n, true)
  })

  const fact = (label, value) => `<div class="brain__fact"><dt>${label}</dt><dd>${value}</dd></div>`
  const facts = (items) => `<dl class="brain__facts">${items.join('')}</dl>`
  const small = (text) => `<span style="font:600 12px var(--brain-body)">${esc(text)}</span>`
  const action = (label, hash) => `<button type="button" class="brain__action" data-nav="${esc(hash)}">${label} <span aria-hidden="true">→</span></button>`
  function list(title, items) {
    if (!items.length) return ''
    return `<section class="brain__links"><h3>${title}</h3><ul>${items.map(([n, note]) =>
      `<li><button type="button" data-go="${esc(n.id)}"><i style="background:${css(n.color)};box-shadow:0 0 6px ${css(n.color, 0.7)}"></i><span>${esc(n.label)}</span><small>${esc(note ?? '')}</small></button></li>`).join('')}</ul></section>`
  }
  const neighbors = (n, type) => [...adj.get(n.id)].map((id) => byId.get(id)).filter((x) => x && (!type || x.type === type))

  function detail(n) {
    const color = n.color
    let sub = '', body = '', image = ''

    if (n.type === 'core') {
      sub = 'Butun tizimning markazi'
      const today = new Date().toDateString()
      const todays = DATA.orders.filter((o) => new Date(o.createdAt).toDateString() === today)
      body = `<p>Hamma yo‘l shu yerga olib keladi: mijoz ilovasi, server, baza, admin panel va Telegram. Galaktikaning har bir qo‘li — bitta kategoriya.</p>`
        + facts([
          fact('Bugun buyurtma', num(todays.length)),
          fact('Bugungi tushum', small(som(todays.filter((o) => !/Bekor|Rad/.test(o.status)).reduce((s, o) => s + Number(o.total || 0), 0)))),
          fact('Kutmoqda', num(DATA.orders.filter((o) => o.status === 'Yangi').length)),
          fact('Tugagan mahsulot', num(DATA.products.filter((p) => p.stock === 0).length)),
        ])
        + list('Tizim a’zolari', neighbors(n, 'system').map((x) => [x, x.sub]))
        + (DATA.hiddenOrders || DATA.hiddenCustomers
          ? `<p class="brain__muted">Galaktikada oxirgi ${num(DATA.orders.length)} ta buyurtma va faol mijozlar ko‘rsatiladi${DATA.hiddenOrders ? ` · yana ${num(DATA.hiddenOrders)} ta eski buyurtma` : ''}${DATA.hiddenCustomers ? ` · yana ${num(DATA.hiddenCustomers)} ta mijoz` : ''}.</p>`
          : '')
    } else if (n.type === 'system') {
      sub = n.sub
      body = `<p>${esc(n.info)}</p>` + list('Bog‘langan', neighbors(n).filter((x) => x.type !== 'core').slice(0, 30).map((x) => [x, KIND[x.type]]))
    } else if (n.type === 'category') {
      const secs = neighbors(n, 'section')
      const loose = neighbors(n, 'product').length
      sub = 'Galaktika qo‘li'
      body = facts([fact('Mahsulot', num(n.count)), fact('Bo‘lim', num(secs.length)), fact('Bo‘limsiz', num(loose)), fact('Tugagan', num(DATA.products.filter((p) => p.category === n.label && p.stock === 0).length))])
        + list('Bo‘limlar', secs.map((x) => [x, `${x.count} ta`]))
        + action('Bo‘limlar va tartib', '#/sections')
    } else if (n.type === 'section') {
      sub = n.category
      const items = neighbors(n, 'product')
      body = facts([fact('Mahsulot', num(items.length)), fact('Kategoriya', small(n.category))])
        + list('Mahsulotlar', items.map((x) => [x, som(x.data.price)]))
        + (items.length ? '' : '<p>Bo‘lim bo‘sh — ilovada ko‘rinmaydi, toki mahsulot biriktirilmaguncha.</p>')
        + action('Bo‘limlar va tartib', '#/sections')
    } else if (n.type === 'product') {
      const p = n.data
      const sold = neighbors(n, 'order')
      sub = n.section ? `${n.category} · ${n.section}` : n.category
      if (p.thumb) image = `<img class="brain__thumb" src="${esc(p.thumb)}" alt="" loading="lazy">`
      const stock = p.stock === null || p.stock === undefined ? '—' : p.stock === 0 ? '<span style="color:var(--brain-rose)">tugagan</span>' : num(p.stock)
      body = facts([fact('Narx', small(som(p.price))), fact('Qoldiq', stock), fact('Buyurtmada', `${sold.length} marta`), fact('Bo‘lim', small(n.section || 'bo‘limsiz'))])
        + list('Yuqoriga', neighbors(n).filter((x) => x.type === 'section' || x.type === 'category').map((x) => [x, KIND[x.type]]))
        + list('Buyurtmalar', sold.map((x) => [x, x.data.status]))
        + action('Mahsulotlar sahifasi', '#/products')
    } else if (n.type === 'order') {
      const o = n.data
      const c = STATUS[o.status] || 'amber'
      sub = when(o.createdAt)
      body = `<span class="brain__pill" style="color:${css(c)};background:${css(c, 0.12)}"><i></i>${esc(o.status)}</span>`
        + facts([fact('Summa', small(som(o.total))), fact('Mahsulot', num(o.items.length)), fact('To‘lov', small(o.payment || 'Naqd')), fact('Kuryer', small(o.courierName || '—'))])
        + list('Tarkibi', o.items.map((it) => [byId.get(`p:${it.id}`) || { id: '', label: it.name, color: 'green' }, `× ${it.q}`]))
        + list('Kim', neighbors(n).filter((x) => x.type === 'customer' || x.type === 'staff').map((x) => [x, KIND[x.type]]))
        + action('Buyurtmani ochish', `#/orders/${o.id}`)
    } else if (n.type === 'customer') {
      const mine = neighbors(n, 'order')
      sub = n.data.phone || 'Telegram mijozi'
      body = facts([fact('Buyurtma', num(mine.length)), fact('Jami xarid', small(som(mine.reduce((s, x) => s + Number(x.data.total || 0), 0))))])
        + list('Buyurtmalari', mine.map((x) => [x, x.data.status]))
        + action('Mijozlar sahifasi', '#/customers')
    } else if (n.type === 'staff') {
      const s = n.data
      sub = ROLE[s.role] || s.role
      const mine = neighbors(n, 'order')
      body = facts([fact('Rol', small(ROLE[s.role] || s.role)), fact('Holat', s.active === false ? 'bloklangan' : 'faol')])
        + list('Buyurtmalari', mine.map((x) => [x, x.data.status]))
    }

    headEl.innerHTML = image
      + `<div class="brain__kind" style="color:${css(color)}"><i style="background:${css(color)};box-shadow:0 0 8px ${css(color, 0.8)}"></i>${KIND[n.type]}</div>`
      + `<h2 class="brain__title">${esc(n.label)}</h2>${sub ? `<p class="brain__panel-sub">${esc(sub)}</p>` : ''}`
    bodyEl.innerHTML = body
  }

  function select(n, fly) {
    const changed = n !== selected
    selected = n
    lastInput = performance.now()
    if (!n) { panel.hidden = true; return }
    detail(n)
    if (changed) bodyEl.scrollTop = 0
    panel.hidden = false
    if (changed) Sound.chime(n.type)
    if (fly && !pilot.on) { flyTo(n); Sound.whoosh() }
  }

  // ── Jonli ma'lumot ─────────────────────────────────────
  let prevStatus = null
  let booted = false
  function setData(data) {
    const events = []
    if (prevStatus) {
      for (const o of data.orders) {
        const before = prevStatus.get(o.id)
        if (before === undefined) events.push({ kind: 'new', o })
        else if (before !== o.status) events.push({ kind: 'status', o })
      }
    }
    prevStatus = new Map(data.orders.map((o) => [o.id, o.status]))

    DATA = data
    const keep = selected ? selected.id : null
    build(data)
    renderCounts()
    selected = keep ? byId.get(keep) || null : null
    if (selected) detail(selected)
    else panel.hidden = true

    if (!booted && nodes.length) {
      booted = true
      // Uyg'onish: yadrodan har bir tizim a'zosiga nur
      SYSTEMS.forEach((s, i) => setTimeout(() => pulse(['core', `sys:${s.key}`], 'gold', 1.2), 700 + i * 140))
    }

    for (const ev of events.slice(0, 6)) {
      const o = ev.o
      const oid = `o:${o.id}`
      const courier = o.courierId ? `s:${o.courierId}` : 'sys:telegram'
      if (ev.kind === 'new') {
        pulse([o.customerId ? `u:${o.customerId}` : 'sys:miniapp', 'sys:miniapp', 'sys:server', oid, 'sys:server', 'sys:firestore', 'sys:admin'], 'amber', 1.8)
        toast(`Yangi buyurtma · ${o.number} · ${som(o.total)}`)
        Sound.alert()
      } else {
        const path = {
          'Qabul qilindi': ['sys:admin', 'sys:server', oid, 'sys:server', 'sys:telegram', courier],
          'Yetkazilmoqda': [courier, 'sys:telegram', 'sys:bot', 'sys:firestore', oid],
          'Yetkazildi': [courier, 'sys:telegram', 'sys:bot', 'sys:firestore', oid, o.customerId ? `u:${o.customerId}` : 'sys:miniapp'],
        }[o.status] || ['sys:admin', 'sys:server', oid]
        pulse(path, STATUS[o.status] || 'ice', 1.8)
        toast(`${o.number} → ${o.status}`)
      }
      const n = byId.get(oid)
      if (n) n.flash = 1
    }
  }

  raf = requestAnimationFrame(frame)

  return {
    setData,
    destroy() {
      if (fsElement() === root) (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      cancelAnimationFrame(raf)
      clearTimeout(toastTimer)
      ro.disconnect()
      disposers.forEach((off) => off())
      Sound.destroy()
      root.innerHTML = ''
    },
  }
}
