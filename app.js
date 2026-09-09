/* ==========================================================================
   Ledger — personal finance dashboard
   Plain HTML/CSS/JS. No build step, no framework. Data lives in
   localStorage on this device/browser only.
   ========================================================================== */

const STORAGE_KEY = "finance_dashboard_v2";
const OZ_TO_GRAM = 31.1034768;

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => "RM " + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n) => { const v = Number(n) || 0; return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp01 = (n) => Math.min(1, Math.max(0, n));

// ---------------------------------------------------------------------------
// motion helpers
// ---------------------------------------------------------------------------
const motionOK = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Animates the text content of `el` from its last known numeric value to `toValue`,
// formatting each frame with `formatFn`. Falls back to an instant set on first paint,
// when reduced motion is requested, or when the value hasn't changed.
function animateNumber(el, toValue, formatFn, duration = 650) {
  if (!el) return;
  const prevRaw = el.dataset.rawValue;
  const fromValue = prevRaw === undefined ? toValue : parseFloat(prevRaw);
  el.dataset.rawValue = toValue;
  if (!motionOK || prevRaw === undefined || fromValue === toValue) {
    el.textContent = formatFn(toValue);
    return;
  }
  const start = performance.now();
  const runId = (el._animRun = (el._animRun || 0) + 1);
  function tick(now) {
    if (el._animRun !== runId) return; // superseded by a newer update
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatFn(fromValue + (toValue - fromValue) * eased);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatFn(toValue);
  }
  requestAnimationFrame(tick);
}

// Draws in an SVG polyline (stroke) and fades in its paired area fill.
function animateChartEntrance(container) {
  if (!motionOK) return;
  const line = container.querySelector(".chart-line");
  const area = container.querySelector(".chart-area");
  if (line && line.getTotalLength) {
    const len = line.getTotalLength();
    line.style.transition = "none";
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    requestAnimationFrame(() => {
      line.style.transition = "stroke-dashoffset 900ms cubic-bezier(.16,.8,.24,1)";
      line.style.strokeDashoffset = "0";
    });
  }
  if (area) {
    area.style.transition = "none";
    area.style.opacity = "0";
    requestAnimationFrame(() => {
      area.style.transition = "opacity 800ms ease 150ms";
      area.style.opacity = "1";
    });
  }
}

// ---------------------------------------------------------------------------
// gamification — net worth ranked like the metals this person actually holds
// ---------------------------------------------------------------------------
const TIERS = [
  { name: "Copper", min: 0, color: "#c17a4e" },
  { name: "Bronze", min: 10000, color: "#cd8a4a" },
  { name: "Silver", min: 25000, color: "#c7ccd6" },
  { name: "Gold", min: 50000, color: "#ffb454" },
  { name: "Platinum", min: 100000, color: "#dfe7ff" },
  { name: "Diamond", min: 250000, color: "#4de8e0" },
  { name: "Titanium", min: 500000, color: "#9b7bff" },
];

function getTierInfo(netWorth) {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (netWorth >= TIERS[i].min) idx = i;
  const current = TIERS[idx];
  const next = TIERS[idx + 1] || null;
  const span = next ? next.min - current.min : 1;
  const progress = next ? clamp01((netWorth - current.min) / span) : 1;
  return { idx, current, next, progress, remaining: next ? next.min - netWorth : 0 };
}

const CATEGORY_HEX = { Gold: "#ffb454", Silver: "#b8c4d9", Crypto: "#9b7bff", Stocks: "#4ade80", Cash: "#4de8e0" };

// curated CoinGecko ids for the crypto coin dropdown — id is what's sent to the API,
// label is what the person sees
const CRYPTO_COIN_OPTIONS = [
  { id: "bitcoin", label: "Bitcoin (BTC)" },
  { id: "ethereum", label: "Ethereum (ETH)" },
  { id: "tether", label: "Tether (USDT)" },
  { id: "usd-coin", label: "USD Coin (USDC)" },
  { id: "binancecoin", label: "BNB" },
  { id: "solana", label: "Solana (SOL)" },
  { id: "ripple", label: "XRP" },
  { id: "cardano", label: "Cardano (ADA)" },
  { id: "dogecoin", label: "Dogecoin (DOGE)" },
  { id: "tron", label: "TRON (TRX)" },
  { id: "avalanche-2", label: "Avalanche (AVAX)" },
  { id: "chainlink", label: "Chainlink (LINK)" },
  { id: "polkadot", label: "Polkadot (DOT)" },
  { id: "matic-network", label: "Polygon (MATIC)" },
  { id: "litecoin", label: "Litecoin (LTC)" },
  { id: "shiba-inu", label: "Shiba Inu (SHIB)" },
  { id: "uniswap", label: "Uniswap (UNI)" },
  { id: "bitcoin-cash", label: "Bitcoin Cash (BCH)" },
  { id: "stellar", label: "Stellar (XLM)" },
  { id: "near", label: "NEAR Protocol" },
  { id: "internet-computer", label: "Internet Computer (ICP)" },
  { id: "aptos", label: "Aptos (APT)" },
  { id: "arbitrum", label: "Arbitrum (ARB)" },
  { id: "optimism", label: "Optimism (OP)" },
  { id: "sui", label: "Sui" },
];

function buildCoinSelectHTML(row) {
  const current = (row.coinId || "").trim().toLowerCase();
  const known = CRYPTO_COIN_OPTIONS.some((c) => c.id === current);
  const options = [`<option value="">— select a coin —</option>`]
    .concat(CRYPTO_COIN_OPTIONS.map((c) => `<option value="${c.id}" ${c.id === current ? "selected" : ""}>${esc(c.label)}</option>`));
  if (current && !known) options.push(`<option value="${esc(current)}" selected>${esc(current)} (custom)</option>`);
  return `<select class="ghost-input sans" data-id="${row.id}" data-field="coinId" data-type="text">${options.join("")}</select>`;
}

// ---------------------------------------------------------------------------
// seed data — transcribed from the user's original tracking sheet
// ---------------------------------------------------------------------------
function seedData() {
  return {
    cashOnHand: 0,
    annualGoal: 18000,
    marketPrices: { goldPerGram: 0, silverPerGram: 0, usdMyr: 0, btcUsd: null, lastUpdated: null },
    cashFlow: [],
    assets: [],
  };
}

const recalcNet = (row) => (Number(row.income) || 0) - (Number(row.expense) || 0);
const recalcTxnTotal = (row) => (row.transactions || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);

// fixed set of spending categories shown in the transaction detail modal, each with
// its own logo so the categories are recognizable at a glance
const CASHFLOW_CATEGORIES = [
  { key: "Food", label: "Food", color: "#ffb454", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v7a1 1 0 0 0 1 1v0a1 1 0 0 0 1-1V2M5 2v7a1 1 0 0 0 1 1v0"/><path d="M7 10v12"/><path d="M17 2c-2.2 0-4 2.5-4 6s1.8 6 4 6v8"/></svg>` },
  { key: "Entertainment", label: "Entertainment", color: "#9b7bff", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="13" rx="2"/><path d="M2.5 8l2.5-5h4l-2.5 5M9.5 8l2.5-5h4l-2.5 5M16.5 8l2.5-5"/></svg>` },
  { key: "Shopping", label: "Shopping", color: "#fb7185", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>` },
  { key: "Insurance", label: "Insurance", color: "#4de8e0", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>` },
  { key: "Car Installment", label: "Car Installment", color: "#4ade80", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V11l2-5h10l4 5v6"/><path d="M3 17h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>` },
  { key: "Rent", label: "Rent", color: "#b8c4d9", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>` },
  { key: "Transport", label: "Transport", color: "#f0b100", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M3 12h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/></svg>` },
];

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.marketPrices) parsed.marketPrices = seedData().marketPrices;
      if (Array.isArray(parsed.cashFlow)) parsed.cashFlow = parsed.cashFlow.map((r) => ({ ...r, net: recalcNet(r) }));
      return parsed;
    }
  } catch (e) { /* fall through to seed */ }
  const seed = seedData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

let saveTimer = null;
function saveData(data) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSyncLabel("All changes saved"); }
    catch (e) { console.error(e); setSyncLabel("Save failed — storage may be full"); }
  }, 180);
  setSyncLabel("Saving…");
}

function setSyncLabel(text) {
  const el = document.getElementById("sync-label");
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------------------
// app state
// ---------------------------------------------------------------------------
const state = {
  data: loadData(),
  tab: "overview",
  refreshing: false,
  refreshError: null,
  selection: { cashFlow: new Set(), assets: new Set() },
  openCfDetailId: null,
};

// ---------------------------------------------------------------------------
// tiny icon set
// ---------------------------------------------------------------------------
const ICON = {
  grid: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  list: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  orbit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  refresh: (spin) => `<svg class="${spin ? "spin" : ""}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  up: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  down: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  wallet: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
  chevronRight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"/></svg>`,
  chevronDown: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="6 9 12 15 18 9"/></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  upload: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  close: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

// category "logos" shown next to each asset group's name — filled shapes that pick up
// the surrounding text color via currentColor, so they tint with the category color
const CATEGORY_ICON = {
  // ingot / bar, used for both precious metals (tinted differently per category color)
  Gold: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 8h12l3 9H3z"/><path d="M6 8l1.8-3h8.4L18 8z" opacity="0.55"/></svg>`,
  Silver: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 8h12l3 9H3z"/><path d="M6 8l1.8-3h8.4L18 8z" opacity="0.55"/></svg>`,
  // coin with a faceted token mark — generic "crypto", not tied to any one coin's logo
  Crypto: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 6.5l4 5.5-4 5.5-4-5.5z" fill="currentColor" stroke="none"/></svg>`,
  // ascending candlesticks / bar chart
  Stocks: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="3.5" y="12" width="4" height="8" rx="0.8"/><rect x="10" y="6" width="4" height="14" rx="0.8"/><rect x="16.5" y="9" width="4" height="11" rx="0.8"/></svg>`,
  Cash: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
};

// ---------------------------------------------------------------------------
// derived computations
// ---------------------------------------------------------------------------
function computeDerived(data) {
  const totalAssets = data.assets.reduce((s, a) => s + (Number(a.currentValue) || 0), 0);
  const totalCost = data.assets.reduce((s, a) => s + (Number(a.buyPrice) || 0), 0);
  const assetGain = totalAssets - totalCost;
  const netWorth = totalAssets + (Number(data.cashOnHand) || 0);

  const byCategory = {};
  data.assets.forEach((a) => { byCategory[a.category] = (byCategory[a.category] || 0) + (Number(a.currentValue) || 0); });
  const ringData = Object.entries(byCategory).map(([name, value]) => ({ name, value, pct: totalAssets ? (value / totalAssets) * 100 : 0, color: CATEGORY_HEX[name] || "#4de8e0" }));

  let running = 0;
  const series = data.cashFlow.map((c) => { running += Number(c.net) || 0; return { period: c.period, net: Number(c.net) || 0, cumulative: running }; });
  const lastNet = data.cashFlow.length ? Number(data.cashFlow[data.cashFlow.length - 1].net) : 0;

  const tierInfo = getTierInfo(netWorth);
  const recent = data.cashFlow.slice(-12);
  const yearSaved = recent.reduce((s, c) => s + (Number(c.net) || 0), 0);
  const annualGoal = data.annualGoal ?? 18000;

  return { totalAssets, totalCost, assetGain, netWorth, ringData, series, lastNet, tierInfo, yearSaved, annualGoal };
}

// ---------------------------------------------------------------------------
// SVG builders
// ---------------------------------------------------------------------------
function shade(hex, factor) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return `rgb(${clamp(r * factor)},${clamp(g * factor)},${clamp(b * factor)})`;
}

function lighten(hex, factor) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return `rgb(${clamp(r + (255 - r) * factor)},${clamp(g + (255 - g) * factor)},${clamp(b + (255 - b) * factor)})`;
}

// a piggy bank that grows physically bigger as net worth climbs through the ranks —
// nested groups keep concerns separate: outer = mount-in animation, middle = static
// size scale from net worth, inner = cursor-driven push/bounce physics.
function buildPiggyBankSVG(netWorth, tierInfo) {
  const color = tierInfo.current.color;
  const fraction = Math.max(0, Math.min(1, (tierInfo.idx + tierInfo.progress) / TIERS.length));
  const sizeScale = 0.6 + fraction * 0.8;

  const outline = shade(color, 0.38);
  const belly = lighten(color, 0.32);
  const snoutFill = lighten(color, 0.22);
  const legFill = shade(color, 0.72);
  const hoof = shade(color, 0.3);

  const enter = motionOK
    ? `opacity:0;transform-origin:50% 100%;animation:pileGrow 520ms cubic-bezier(.16,.8,.24,1) forwards`
    : "opacity:1";

  return `
    <svg viewBox="0 0 140 150" width="100%" height="100%" style="overflow:visible">
      <ellipse cx="70" cy="132" rx="44" ry="7" fill="rgba(0,0,0,0.35)" />
      <g style="${enter}">
        <g class="pile-size" style="transform-box:fill-box;transform-origin:50% 100%;transform:scale(${sizeScale.toFixed(3)})">
          <g class="pile-physics" style="transform-box:fill-box;transform-origin:50% 88%">

            <!-- legs (drawn first so the body ellipse covers their tops) -->
            <rect x="38" y="94" width="10" height="20" rx="4" fill="${legFill}" stroke="${outline}" stroke-width="1" />
            <rect x="38" y="108" width="10" height="7" rx="2" fill="${hoof}" />
            <rect x="54" y="96" width="10" height="20" rx="4" fill="${legFill}" stroke="${outline}" stroke-width="1" />
            <rect x="54" y="110" width="10" height="7" rx="2" fill="${hoof}" />
            <rect x="80" y="96" width="10" height="20" rx="4" fill="${legFill}" stroke="${outline}" stroke-width="1" />
            <rect x="80" y="110" width="10" height="7" rx="2" fill="${hoof}" />
            <rect x="96" y="94" width="10" height="20" rx="4" fill="${legFill}" stroke="${outline}" stroke-width="1" />
            <rect x="96" y="108" width="10" height="7" rx="2" fill="${hoof}" />

            <!-- tail -->
            <path d="M27,68 q-11,-5 -5,-14 q5,-7 -3,-11" stroke="${outline}" stroke-width="2.6" fill="none" stroke-linecap="round" />

            <!-- body -->
            <ellipse cx="68" cy="76" rx="42" ry="32" fill="${color}" stroke="${outline}" stroke-width="1.6" style="filter:drop-shadow(0 0 9px ${color})" />
            <ellipse cx="66" cy="94" rx="29" ry="15" fill="${belly}" opacity="0.8" />

            <!-- ear -->
            <path d="M78,50 L66,31 L91,40 Z" fill="${color}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M78,47 L71,35 L86,40 Z" fill="${belly}" opacity="0.7" />

            <!-- snout -->
            <ellipse cx="107" cy="79" rx="14" ry="10.5" fill="${snoutFill}" stroke="${outline}" stroke-width="1.4" />
            <ellipse cx="102" cy="79" rx="2.1" ry="3" fill="${outline}" />
            <ellipse cx="112" cy="79" rx="2.1" ry="3" fill="${outline}" />

            <!-- eye -->
            <circle cx="86" cy="64" r="3.2" fill="${outline}" />
            <circle cx="87.2" cy="62.8" r="1" fill="#fff" opacity="0.8" />

            <!-- coin slot -->
            <rect x="52" y="44" width="20" height="4.5" rx="2.2" fill="${outline}" />
          </g>
        </g>
      </g>
      <circle cx="60" cy="26" r="5" fill="none" stroke="#ffb454" stroke-width="1.2" opacity="0.75" class="float-a" />
      <circle cx="118" cy="60" r="4" fill="none" stroke="#4de8e0" stroke-width="1.2" opacity="0.6" class="float-b" />
    </svg>`;
}

function buildAreaChartSVG(series) {
  const W = 640, H = 220, padL = 40, padR = 8, padT = 10, padB = 20;
  const values = series.map((s) => s.cumulative);
  const max = Math.max(...values, 0), min = Math.min(...values, 0);
  const range = (max - min) || 1;
  const xStep = series.length > 1 ? (W - padL - padR) / (series.length - 1) : 0;
  const xAt = (i) => padL + i * xStep;
  const yAt = (v) => padT + (H - padT - padB) * (1 - (v - min) / range);

  const linePts = series.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s.cumulative).toFixed(1)}`).join(" L ");
  const areaPath = `M ${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} L ${linePts} L ${xAt(series.length - 1).toFixed(1)},${yAt(0).toFixed(1)} Z`;
  const zeroY = yAt(0).toFixed(1);

  const gridLines = [0.25, 0.5, 0.75].map((f) => `<line x1="${padL}" y1="${padT + (H - padT - padB) * f}" x2="${W - padR}" y2="${padT + (H - padT - padB) * f}" stroke="rgba(126,201,255,0.06)" />`).join("");
  const labelEvery = Math.ceil(series.length / 7) || 1;
  const labels = series.map((s, i) => (i % labelEvery === 0 || i === series.length - 1)
    ? `<text x="${xAt(i).toFixed(1)}" y="${H - 4}" font-size="9" fill="#3d4863" font-family="JetBrains Mono, monospace" text-anchor="middle">${esc(s.period.split(" ")[0])}</text>` : "").join("");
  const yLabels = [min, min + range / 2, max].map((v, idx) => `<text x="${padL - 6}" y="${yAt(v) + 3}" font-size="9" fill="#3d4863" font-family="JetBrains Mono, monospace" text-anchor="end">${fmtShort(v)}</text>`).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="260" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4de8e0" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#4de8e0" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines}
      <line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="rgba(126,201,255,0.15)" stroke-dasharray="3 3" />
      <path d="${areaPath}" class="chart-area" fill="url(#areaFill)" />
      <polyline points="${linePts}" class="chart-line" fill="none" stroke="#4de8e0" stroke-width="2" style="filter:drop-shadow(0 0 6px #4de8e066)" />
      ${labels}
      ${yLabels}
    </svg>`;
}

function buildDonut(ringData) {
  let acc = 0;
  const stops = ringData.map((d) => {
    const start = acc, end = acc + d.pct;
    acc = end;
    return `${d.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  }).join(", ");
  return stops || "rgba(255,255,255,0.06) 0% 100%";
}

// ---------------------------------------------------------------------------
// cursor physics — push the pile like a real stack of cash
// ---------------------------------------------------------------------------
let pileState = null;
let pileRAF = null;
let pileListeners = null;

function stopPilePhysics() {
  if (pileRAF) cancelAnimationFrame(pileRAF);
  pileRAF = null;
  pileState = null;
  if (pileListeners) {
    pileListeners.holder.removeEventListener("pointermove", pileListeners.onMove);
    pileListeners.holder.removeEventListener("pointerleave", pileListeners.onLeave);
    pileListeners.holder.removeEventListener("pointerenter", pileListeners.onEnter);
    pileListeners = null;
  }
}

function initPilePhysics(holderEl, groupEl) {
  stopPilePhysics();
  if (!motionOK || !holderEl || !groupEl) return;

  const STIFF = 0.05, DAMP = 0.22;       // rotation spring
  const STIFF_X = 0.045, DAMP_X = 0.24;  // horizontal shove spring
  const STIFF_Y = 0.10, DAMP_Y = 0.16;   // vertical bounce spring — looser damping for a playful hop
  const MAX_ANGLE = 16, MAX_TX = 13, MAX_BOUNCE = 16;
  const MAX_VEL = 9;

  pileState = { angle: 0, angVel: 0, tx: 0, txVel: 0, bounce: 0, bounceVel: 0, lastX: null, lastT: null };

  const onMove = (e) => {
    const s = pileState;
    if (!s) return;
    const now = performance.now();
    if (s.lastX != null) {
      const dt = Math.max(6, now - s.lastT);
      const vx = (e.clientX - s.lastX) / dt; // px per ms
      s.angVel = Math.max(-MAX_VEL, Math.min(MAX_VEL, s.angVel + vx * 5.5));
      s.txVel = Math.max(-MAX_VEL, Math.min(MAX_VEL, s.txVel + vx * 3.5));
    }
    s.lastX = e.clientX;
    s.lastT = now;
  };
  const onLeave = () => { if (pileState) pileState.lastX = null; };
  const onEnter = () => {
    const s = pileState;
    if (!s) return;
    s.bounceVel -= 13; // hop impulse the moment the cursor touches the piggy bank
  };

  holderEl.addEventListener("pointermove", onMove);
  holderEl.addEventListener("pointerleave", onLeave);
  holderEl.addEventListener("pointerenter", onEnter);
  pileListeners = { holder: holderEl, onMove, onLeave, onEnter };

  let lastFrame = performance.now();
  const tick = (now) => {
    const s = pileState;
    if (!s) return; // stopped
    const dt = Math.min(2.2, (now - lastFrame) / 16.67);
    lastFrame = now;

    s.angVel += (-STIFF * s.angle - DAMP * s.angVel) * dt;
    s.angle += s.angVel * dt;
    s.angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, s.angle));

    s.txVel += (-STIFF_X * s.tx - DAMP_X * s.txVel) * dt;
    s.tx += s.txVel * dt;
    s.tx = Math.max(-MAX_TX, Math.min(MAX_TX, s.tx));

    s.bounceVel += (-STIFF_Y * s.bounce - DAMP_Y * s.bounceVel) * dt;
    s.bounce += s.bounceVel * dt;
    s.bounce = Math.max(-MAX_BOUNCE, Math.min(MAX_BOUNCE, s.bounce));

    // cartoon squash-and-stretch: stretch tall+thin at the top of the hop, squash
    // wide+short as it lands back down
    const stretch = Math.max(-1, Math.min(1, -s.bounce / MAX_BOUNCE));
    const scaleY = 1 + stretch * 0.14;
    const scaleX = 1 - stretch * 0.1;

    groupEl.style.transform = `translate(${s.tx.toFixed(2)}px, ${s.bounce.toFixed(2)}px) rotate(${s.angle.toFixed(2)}deg) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;
    pileRAF = requestAnimationFrame(tick);
  };
  pileRAF = requestAnimationFrame(tick);
}
function render() {
  stopPilePhysics();
  state.selection.cashFlow.clear();
  state.selection.assets.clear();
  state.openCfDetailId = null;
  if (modalEscHandler) { document.removeEventListener("keydown", modalEscHandler); modalEscHandler = null; }
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="bg-dots"></div>
    <div class="header">
      <div>
        <div class="header-status"><span class="pulse-dot"></span><span>PERSONAL FINANCE / LOCAL</span></div>
        <div class="header-title">Ledger</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div class="header-sync" id="sync-label">All changes saved</div>
        <div style="display:flex;gap:8px">
          <button class="icon-btn" id="export-btn" title="Download a backup of all your data as a JSON file">${ICON.download} Export</button>
          <button class="icon-btn" id="import-btn" title="Restore data from a previously exported JSON file">${ICON.upload} Import</button>
          <input type="file" id="import-file-input" accept="application/json" style="display:none" />
        </div>
      </div>
    </div>
    <div class="tabbar">
      <button class="tab-btn ${state.tab === "overview" ? "active" : ""}" data-tab="overview">${ICON.grid} Overview</button>
      <button class="tab-btn ${state.tab === "cashflow" ? "active" : ""}" data-tab="cashflow">${ICON.list} Cash flow</button>
      <button class="tab-btn ${state.tab === "assets" ? "active" : ""}" data-tab="assets">${ICON.orbit} Assets</button>
    </div>
    <div id="tab-content"></div>
  `;
  root.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => { state.tab = btn.dataset.tab; render(); }));

  document.getElementById("export-btn").addEventListener("click", exportData);
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file-input").click());
  document.getElementById("import-file-input").addEventListener("change", handleImportFile);

  if (state.tab === "overview") renderOverview();
  else if (state.tab === "cashflow") renderCashFlowTab();
  else renderAssetsTab();
}

// ---------------------------------------------------------------------------
// backup / restore — since data only lives in this browser's localStorage,
// export/import is how it survives a cleared cache or moves to another device
// ---------------------------------------------------------------------------
function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ledger-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // allow re-selecting the same file later
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      alert("That file isn't valid JSON — export a fresh backup from Ledger and try that one.");
      return;
    }
    if (!parsed || !Array.isArray(parsed.cashFlow) || !Array.isArray(parsed.assets)) {
      alert("That file doesn't look like a Ledger backup (missing cashFlow/assets).");
      return;
    }
    const ok = window.confirm(
      "This will replace everything currently in Ledger on this device with the contents of the imported file. This can't be undone. Continue?"
    );
    if (!ok) return;

    if (!parsed.marketPrices) parsed.marketPrices = seedData().marketPrices;
    state.data = parsed;
    saveData(state.data);
    render();
  };
  reader.onerror = () => alert("Couldn't read that file — please try again.");
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// overview
// ---------------------------------------------------------------------------
function renderOverview() {
  const d = computeDerived(state.data);
  const container = document.getElementById("tab-content");
  const isBrandNew = state.data.cashFlow.length === 0 && state.data.assets.length === 0 && !state.data.cashOnHand;

  container.innerHTML = `
    ${isBrandNew ? `
    <div class="frame enter" style="margin-bottom:16px;border-color:var(--panel-border-hover)">
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="label">Welcome</div>
      <div style="font-size:14px;line-height:1.6;color:var(--text)">
        Nothing logged yet — this is your blank ledger. Head to <b>Cash Flow</b> to add your first month of income/expenses,
        or <b>Assets</b> to start tracking gold, crypto, stocks, or cash. Everything here updates live as you go.
      </div>
    </div>` : ""}
    <div class="row mb">
      <div class="frame flex-2 glow-cyan enter" style="animation-delay:0ms">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;height:100%">
          <div>
            <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
            <div class="label">Net worth</div>
            <div class="mono" id="nw-value" data-raw-value="${d.netWorth}" style="font-size:44px;font-weight:600">${fmt(d.netWorth)}</div>
            <div style="font-size:12.5px;color:var(--text-dim);margin-top:8px">Cash on hand + current asset value, updated live as you edit</div>
          </div>
          <div class="mini-stat-row">
            <div><div class="label">Assets</div><div class="mono" id="assets-value" data-raw-value="${d.totalAssets}" style="font-size:18px;color:${d.assetGain >= 0 ? "var(--positive)" : "var(--negative)"}">${fmt(d.totalAssets)}</div></div>
            <div><div class="label">vs. cost</div><div class="mono" id="assets-vs-cost" data-raw-value="${d.assetGain}" style="font-size:18px;color:${d.assetGain >= 0 ? "var(--positive)" : "var(--negative)"}">${d.assetGain >= 0 ? "+" : ""}${fmt(d.assetGain)}</div></div>
          </div>
        </div>
      </div>

      <div class="frame cash-pile-wrap enter" style="animation-delay:60ms">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="label">Piggy bank</div>
        <div class="cash-pile-svg-holder" id="cash-pile-holder" title="Hover to bounce it, tap to celebrate">${buildPiggyBankSVG(d.netWorth, d.tierInfo)}</div>
        <div class="mono" id="cash-pile-label" data-raw-value="${d.netWorth}" style="font-size:20px;color:${d.tierInfo.current.color}">${fmtShort(d.netWorth)}</div>
        <div style="font-size:11.5px;color:var(--text-dim);margin-top:2px">Grows with your net worth</div>
      </div>
    </div>

    <div class="frame enter" id="tier-track" style="margin-bottom:16px;animation-delay:110ms">
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      ${renderTierTrackInner(d.tierInfo)}
    </div>

    <div class="row mb">
      <div class="frame flex-1 enter" style="animation-delay:150ms">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="label">Cash on hand</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span class="mono" style="font-size:16px;color:var(--text-dim)">RM</span>
          <input class="ghost-input" style="font-size:26px" type="number" id="input-cash-on-hand" value="${state.data.cashOnHand}" />
        </div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:6px">Editable — update anytime</div>
      </div>

      <div class="frame flex-1 enter" style="animation-delay:190ms">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="label">Last month saved</div>
        <div class="mono" style="font-size:26px;color:${d.lastNet >= 0 ? "var(--positive)" : "var(--negative)"}">${fmt(d.lastNet)}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:8px">${state.data.cashFlow.length === 0 ? "No months logged yet" : d.lastNet >= 0 ? "Positive month" : "Spent more than earned"}</div>
      </div>

      <div class="frame flex-1 enter" id="goal-card" style="animation-delay:230ms">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        ${renderGoalCardInner(d)}
      </div>
    </div>

    <div class="row">
      <div class="frame flex-2 enter" style="animation-delay:270ms">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="label">Cumulative savings</div>
        <div id="area-chart">
          ${d.series.length > 0
            ? buildAreaChartSVG(d.series)
            : `<div class="empty-note" style="padding:60px 10px;text-align:center">Add a month in the Cash Flow tab to see your savings trend here.</div>`}
        </div>
      </div>

      <div class="frame flex-1 enter" style="animation-delay:310ms">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="label">Asset allocation</div>
        ${d.ringData.length > 0 ? `
        <div class="donut-wrap">
          <div class="donut donut-anim" style="background:conic-gradient(${buildDonut(d.ringData)})"></div>
          <div class="donut-center">
            <div class="mono" style="font-size:11px;color:var(--text-dim)">TOTAL</div>
            <div class="mono" style="font-size:17px">${fmtShort(d.totalAssets)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;margin-top:6px">
          ${d.ringData.map((r) => `
            <div class="legend-row">
              <span style="color:var(--text-dim);display:flex;align-items:center;gap:7px">
                <span style="display:inline-flex;color:${r.color}">${(CATEGORY_ICON[r.name] || "").replace(/width="17" height="17"/, 'width="13" height="13"')}</span>
                ${esc(r.name)}
              </span>
              <span>${fmt(r.value)}</span>
            </div>`).join("")}
        </div>` : `<div class="empty-note" style="padding:44px 10px;text-align:center">Add an asset in the Assets tab to see your allocation here.</div>`}
      </div>
    </div>
  `;

  animateChartEntrance(document.getElementById("area-chart"));

  // cash pile click -> coin burst, cursor move -> physics push
  const pileHolder = document.getElementById("cash-pile-holder");
  pileHolder.addEventListener("click", () => spawnCoinBurst(pileHolder, d.tierInfo.current.color));
  initPilePhysics(pileHolder, pileHolder.querySelector(".pile-physics"));

  // cash on hand input
  document.getElementById("input-cash-on-hand").addEventListener("input", (e) => {
    state.data.cashOnHand = parseFloat(e.target.value) || 0;
    saveData(state.data);
    updateOverviewDerived();
  });

  wireGoalCardInputs();
}

function renderTierTrackInner(tierInfo) {
  const { current, next, progress, remaining, idx } = tierInfo;
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <div class="label">Rank</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span class="mono" id="tier-name" style="font-size:22px;color:${current.color}">${current.name}</span>
          <span style="font-size:12px;color:var(--text-dim)">tier ${idx + 1} of ${TIERS.length}</span>
        </div>
      </div>
      ${next ? `<div style="text-align:right"><div style="font-size:11.5px;color:var(--text-dim)"><span class="mono" id="tier-remaining" data-raw-value="${remaining}" style="font-size:13px;color:${next.color}">${fmt(remaining)}</span> to ${next.name}</div></div>` : ""}
    </div>
    <div class="tier-row" id="tier-segments">
      ${TIERS.map((t, i) => `<div class="tier-seg" title="${t.name} — ${fmt(t.min)}+" style="background:${i < idx ? t.color : i === idx ? `linear-gradient(90deg, ${current.color} ${progress * 100}%, rgba(255,255,255,0.06) ${progress * 100}%)` : "rgba(255,255,255,0.06)"};box-shadow:${i <= idx ? `0 0 8px ${t.color}88` : "none"}"></div>`).join("")}
    </div>
    <div class="tier-badges" id="tier-badges">
      ${TIERS.map((t, i) => `
        <div class="tier-badge" style="opacity:${i <= idx ? 1 : 0.4}">
          <span class="dot" style="border-color:${t.color};background:${i <= idx ? t.color : "transparent"};box-shadow:${i <= idx ? `0 0 8px ${t.color}` : "none"}"></span>
          <span class="name" style="color:${i === idx ? t.color : "var(--text-dim)"}">${t.name}</span>
        </div>`).join("")}
    </div>`;
}

function renderGoalCardInner(d) {
  const now = new Date();
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const daysLeft = Math.max(0, Math.ceil((yearEnd - now) / 86400000));
  const monthsLeft = Math.max(1, (11 - now.getMonth()) + (now.getDate() > 1 ? 1 : 0));
  const pct = d.annualGoal > 0 ? clamp01(d.yearSaved / d.annualGoal) : 0;
  const remaining = Math.max(0, d.annualGoal - d.yearSaved);
  const pace = remaining / monthsLeft;
  const onTrack = d.yearSaved >= d.annualGoal * ((12 - monthsLeft) / 12 || 0.01);

  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
      <div class="label">Savings goal · this year</div>
      <span class="mono" style="font-size:10.5px;color:var(--text-dim)">${daysLeft}d left</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:4px">
      <span class="mono" id="goal-saved" data-raw-value="${d.yearSaved}" style="font-size:22px;color:${onTrack ? "var(--positive)" : "var(--negative)"}">${fmt(d.yearSaved)}</span>
      <span style="font-size:12px;color:var(--text-dim)">of</span>
      <span class="mono" style="font-size:14px;color:var(--text-dim)"><input class="ghost-input" type="number" id="input-annual-goal" value="${d.annualGoal}" style="width:90px" /></span>
    </div>
    <div class="goal-bar"><div class="goal-bar-fill" id="goal-bar-fill" style="width:${pct * 100}%;background:${onTrack ? "var(--positive)" : "var(--amber)"};box-shadow:0 0 10px ${onTrack ? "var(--positive)" : "var(--amber)"}"></div></div>
    <div style="font-size:12px;color:var(--text-dim);line-height:1.5" id="goal-pace-text">
      ${remaining > 0 ? `Save about <span class="mono" style="color:var(--text)">${fmt(pace)}</span>/month to hit your goal by Dec 31.` : "Goal reached — nice work. Consider raising the target."}
    </div>
    <div style="font-size:10.5px;color:var(--text-faint);margin-top:8px">
      Default goal (RM1,500/mo) is benchmarked off the 2025 RinggitPlus financial literacy survey for middle-income Malaysians — edit it to match your own income.
    </div>`;
}

function wireGoalCardInputs() {
  const input = document.getElementById("input-annual-goal");
  if (!input) return;
  input.addEventListener("input", (e) => {
    state.data.annualGoal = parseFloat(e.target.value) || 0;
    saveData(state.data);
    updateOverviewDerived();
  });
}

// live-patch summary nodes without rebuilding inputs (keeps focus while typing)
function updateOverviewDerived() {
  const d = computeDerived(state.data);

  animateNumber(document.getElementById("nw-value"), d.netWorth, fmt);
  const av = document.getElementById("assets-value");
  if (av) { animateNumber(av, d.totalAssets, fmt); av.style.color = d.assetGain >= 0 ? "var(--positive)" : "var(--negative)"; }
  const avc = document.getElementById("assets-vs-cost");
  if (avc) { animateNumber(avc, d.assetGain, (v) => `${v >= 0 ? "+" : ""}${fmt(v)}`); avc.style.color = d.assetGain >= 0 ? "var(--positive)" : "var(--negative)"; }

  const pileHolder = document.getElementById("cash-pile-holder");
  if (pileHolder) {
    pileHolder.innerHTML = buildPiggyBankSVG(d.netWorth, d.tierInfo);
    initPilePhysics(pileHolder, pileHolder.querySelector(".pile-physics"));
  }
  const pileLabel = document.getElementById("cash-pile-label");
  if (pileLabel) { animateNumber(pileLabel, d.netWorth, fmtShort); pileLabel.style.color = d.tierInfo.current.color; }

  const tierTrack = document.getElementById("tier-track");
  if (tierTrack) tierTrack.innerHTML = `<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>${renderTierTrackInner(d.tierInfo)}`;

  const goalSaved = document.getElementById("goal-saved");
  if (goalSaved) {
    const now = new Date();
    const monthsLeft = Math.max(1, (11 - now.getMonth()) + (now.getDate() > 1 ? 1 : 0));
    const onTrack = d.yearSaved >= d.annualGoal * ((12 - monthsLeft) / 12 || 0.01);
    animateNumber(goalSaved, d.yearSaved, fmt);
    goalSaved.style.color = onTrack ? "var(--positive)" : "var(--negative)";
    const pct = d.annualGoal > 0 ? clamp01(d.yearSaved / d.annualGoal) : 0;
    const remaining = Math.max(0, d.annualGoal - d.yearSaved);
    const pace = remaining / monthsLeft;
    const fill = document.getElementById("goal-bar-fill");
    if (fill) { fill.style.width = `${pct * 100}%`; fill.style.background = onTrack ? "var(--positive)" : "var(--amber)"; fill.style.boxShadow = `0 0 10px ${onTrack ? "var(--positive)" : "var(--amber)"}`; }
    const paceText = document.getElementById("goal-pace-text");
    if (paceText) paceText.innerHTML = remaining > 0 ? `Save about <span class="mono" style="color:var(--text)">${fmt(pace)}</span>/month to hit your goal by Dec 31.` : "Goal reached — nice work. Consider raising the target.";
  }
}

function spawnCoinBurst(container, color) {
  for (let i = 0; i < 10; i++) {
    const span = document.createElement("span");
    span.className = "coin-burst";
    span.textContent = "✦";
    span.style.color = color;
    const x = (i - 4.5) * 11 + (i % 2 === 0 ? 4 : -4);
    span.style.left = `calc(50% + ${x}px)`;
    span.style.animationDelay = `${i * 30}ms`;
    container.appendChild(span);
    setTimeout(() => span.remove(), 1000);
  }
}

// ---------------------------------------------------------------------------
// cash flow tab (with drag-to-reorder)
// ---------------------------------------------------------------------------
let dragSrcIndex = null;

function renderCashFlowTab() {
  const rows = state.data.cashFlow;
  const totalNet = rows.reduce((s, r) => s + (Number(r.net) || 0), 0);
  const container = document.getElementById("tab-content");
  const selCount = state.selection.cashFlow.size;
  const allSelected = rows.length > 0 && rows.every((r) => state.selection.cashFlow.has(r.id));
  const openRow = state.openCfDetailId ? rows.find((r) => r.id === state.openCfDetailId) : null;

  container.innerHTML = `
    <div class="frame enter">
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
        <div>
          <div class="label">Monthly cash flow</div>
          <div style="font-size:13px">Total saved: <span class="mono" id="cf-total" data-raw-value="${totalNet}" style="color:${totalNet >= 0 ? "var(--positive)" : "var(--negative)"}">${fmt(totalNet)}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${selCount > 0 ? `<button class="glow-btn" id="cf-delete-selected" style="border-color:var(--negative);color:var(--negative)">${ICON.trash} Delete selected (${selCount})</button>` : `<span style="font-size:11px;color:var(--text-faint)">drag ⋮⋮ to reorder · click a row to log spending by category</span>`}
          <button class="glow-btn" id="add-month-btn">${ICON.plus} Add month</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:26px"></th>
            <th style="width:26px"><input type="checkbox" id="cf-select-all" ${allSelected ? "checked" : ""} /></th>
            <th style="min-width:110px">Period</th>
            <th style="min-width:110px">Income</th>
            <th style="min-width:110px">Expenses</th>
            <th style="min-width:120px">Net</th>
            <th style="min-width:200px">Note</th>
            <th style="width:40px"></th>
          </tr></thead>
          <tbody id="cf-tbody">
            ${rows.map((r, i) => cashFlowRowHTML(r, i)).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ${openRow ? cashFlowModalHTML(openRow) : ""}
  `;

  document.getElementById("add-month-btn").addEventListener("click", () => {
    state.data.cashFlow.push({ id: uid(), period: "New month", income: 0, expense: 0, net: 0, note: "" });
    saveData(state.data);
    renderCashFlowTab();
  });

  wireCashFlowTable();
  if (openRow) wireCashFlowModal(openRow.id);
}

function cashFlowRowHTML(r, i) {
  const net = recalcNet(r);
  const up = net >= 0;
  const delay = Math.min(i * 22, 400);
  const checked = state.selection.cashFlow.has(r.id);
  const txnCount = (r.transactions || []).length;

  return `
    <tr class="cf-row enter-fast ${checked ? "row-selected" : ""}" draggable="true" data-id="${r.id}" data-index="${i}" style="animation-delay:${delay}ms" title="Click to log detailed spending by category">
      <td class="drag-handle" title="Drag to reorder">⋮⋮</td>
      <td><input type="checkbox" class="row-check" data-select-id="${r.id}" ${checked ? "checked" : ""} /></td>
      <td style="position:relative">
        <input class="ghost-input sans" data-id="${r.id}" data-field="period" data-type="text" value="${esc(r.period)}" />
        ${txnCount > 0 ? `<span class="txn-badge" title="${txnCount} logged item${txnCount === 1 ? "" : "s"}">${txnCount}</span>` : ""}
      </td>
      <td><input class="ghost-input" data-id="${r.id}" data-field="income" data-type="number" value="${r.income}" /></td>
      <td><input class="ghost-input" data-id="${r.id}" data-field="expense" data-type="number" value="${r.expense}" /></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px" title="Income − expenses, calculated automatically">
          <span class="${up ? "gain-up" : "gain-down"}" data-net-icon="${r.id}">${up ? ICON.up : ICON.down}</span>
          <span class="mono ${up ? "gain-up" : "gain-down"}" data-net-value="${r.id}" style="padding:7px 6px">${fmt(net)}</span>
        </div>
      </td>
      <td><input class="ghost-input sans" data-id="${r.id}" data-field="note" data-type="text" value="${esc(r.note)}" placeholder="—" /></td>
      <td><button class="icon-btn danger" data-action="delete-cf" data-id="${r.id}" title="Delete">${ICON.trash}</button></td>
    </tr>`;
}

// ---------------------------------------------------------------------------
// detailed-spending modal — 7 fixed categories, each with its own logo and
// its own list of line items
// ---------------------------------------------------------------------------
function catItemRowHTML(cfId, item) {
  return `
    <div class="cat-item-row enter-fast" data-txn-row="${item.id}">
      <input class="ghost-input sans" data-cf-id="${cfId}" data-txn-id="${item.id}" data-txn-field="description" data-type="text" value="${esc(item.description || "")}" placeholder="Description" />
      <input class="ghost-input" data-cf-id="${cfId}" data-txn-id="${item.id}" data-txn-field="amount" data-type="number" value="${item.amount ?? 0}" />
      <button class="icon-btn danger" data-action="delete-txn" data-cf-id="${cfId}" data-txn-id="${item.id}" title="Delete">${ICON.trash}</button>
    </div>`;
}

function catCardHTML(row, cat) {
  const items = (row.transactions || []).filter((t) => t.category === cat.key);
  const subtotal = items.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return `
    <div class="cat-card" data-cat-card="${cat.key}">
      <div class="cat-card-header">
        <span class="cat-icon" style="color:${cat.color}">${cat.icon}</span>
        <span class="cat-label">${cat.label}</span>
        <span class="mono cat-subtotal" id="cf-cat-subtotal-${row.id}-${cat.key.replace(/\s+/g, "_")}" data-raw-value="${subtotal}">${fmt(subtotal)}</span>
      </div>
      <div class="cat-items" data-cat-items="${cat.key}">
        ${items.length === 0 ? `<div class="empty-note" style="padding:4px 2px">Nothing logged yet.</div>` : items.map((t) => catItemRowHTML(row.id, t)).join("")}
      </div>
      <button class="dashed-btn" style="padding:8px;font-size:12px" data-action="add-cat-item" data-cf-id="${row.id}" data-category="${cat.key}">${ICON.plus} Add item</button>
    </div>`;
}

function cashFlowModalHTML(row) {
  const total = recalcTxnTotal(row);
  return `
    <div class="modal-backdrop" id="cf-modal-backdrop">
      <div class="modal-panel enter-fast">
        <div class="modal-header">
          <div>
            <div class="label">Detailed spending</div>
            <div class="modal-title">${esc(row.period)}</div>
          </div>
          <button class="icon-btn" id="cf-modal-close" title="Close">${ICON.close}</button>
        </div>
        <div class="modal-body">
          <div class="cat-grid">
            ${CASHFLOW_CATEGORIES.map((cat) => catCardHTML(row, cat)).join("")}
          </div>
        </div>
        <div class="modal-footer">
          <div style="font-size:13px;color:var(--text-dim)">Categorized total: <span class="mono" id="cf-modal-total" data-raw-value="${total}" style="color:var(--text)">${fmt(total)}</span></div>
          <div style="display:flex;gap:10px">
            <button class="icon-btn" id="cf-modal-sync" title="Set Expenses to match the categorized total">Sync to Expenses</button>
            <button class="glow-btn" id="cf-modal-done">Done</button>
          </div>
        </div>
      </div>
    </div>`;
}

let modalEscHandler = null;

function closeCfModal() {
  state.openCfDetailId = null;
  if (modalEscHandler) { document.removeEventListener("keydown", modalEscHandler); modalEscHandler = null; }
  renderCashFlowTab();
}

function wireCashFlowModal(rowId) {
  const backdrop = document.getElementById("cf-modal-backdrop");
  if (!backdrop) return;

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeCfModal(); });
  document.getElementById("cf-modal-close").addEventListener("click", closeCfModal);
  document.getElementById("cf-modal-done").addEventListener("click", closeCfModal);

  if (modalEscHandler) document.removeEventListener("keydown", modalEscHandler);
  modalEscHandler = (e) => { if (e.key === "Escape") closeCfModal(); };
  document.addEventListener("keydown", modalEscHandler);

  const getRow = () => state.data.cashFlow.find((r) => r.id === rowId);

  const updateTotals = () => {
    const row = getRow();
    if (!row) return;
    const modalTotalEl = document.getElementById("cf-modal-total");
    if (modalTotalEl) animateNumber(modalTotalEl, recalcTxnTotal(row), fmt);
    CASHFLOW_CATEGORIES.forEach((cat) => {
      const items = (row.transactions || []).filter((t) => t.category === cat.key);
      const subtotal = items.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const el = document.getElementById(`cf-cat-subtotal-${row.id}-${cat.key.replace(/\s+/g, "_")}`);
      if (el) animateNumber(el, subtotal, fmt);
    });
  };

  backdrop.addEventListener("click", (e) => {
    const addBtn = e.target.closest('[data-action="add-cat-item"]');
    if (addBtn) {
      const row = getRow();
      if (row) {
        if (!row.transactions) row.transactions = [];
        row.transactions.push({ id: uid(), category: addBtn.dataset.category, description: "", amount: 0 });
        saveData(state.data);
        renderCashFlowTab();
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-txn"]');
    if (delBtn) {
      const row = getRow();
      if (row) {
        const txnId = delBtn.dataset.txnId;
        const itemRow = delBtn.closest(".cat-item-row");
        const doDelete = () => {
          row.transactions = (row.transactions || []).filter((t) => t.id !== txnId);
          saveData(state.data);
          renderCashFlowTab();
        };
        if (!motionOK || !itemRow) { doDelete(); return; }
        itemRow.classList.add("row-exit");
        setTimeout(doDelete, 170);
      }
      return;
    }

    if (e.target.closest("#cf-modal-sync")) {
      const row = getRow();
      if (row) {
        row.expense = recalcTxnTotal(row);
        row.net = recalcNet(row);
        saveData(state.data);
        renderCashFlowTab();
      }
    }
  });

  // item field edits — soft update (keeps focus), live subtotal/total refresh
  backdrop.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.txnField) return;
    const row = getRow();
    if (!row) return;
    const txn = (row.transactions || []).find((x) => x.id === t.dataset.txnId);
    if (!txn) return;
    txn[t.dataset.txnField] = t.dataset.type === "number" ? (parseFloat(t.value) || 0) : t.value;
    saveData(state.data);
    updateTotals();
  });
}

function wireCashFlowTable() {
  const tbody = document.getElementById("cf-tbody");

  // selection checkboxes
  tbody.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.classList.contains("row-check")) return;
    const id = t.dataset.selectId;
    if (t.checked) state.selection.cashFlow.add(id);
    else state.selection.cashFlow.delete(id);
    renderCashFlowTab();
  });

  const selectAll = document.getElementById("cf-select-all");
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      if (e.target.checked) state.data.cashFlow.forEach((r) => state.selection.cashFlow.add(r.id));
      else state.selection.cashFlow.clear();
      renderCashFlowTab();
    });
  }

  const deleteSelectedBtn = document.getElementById("cf-delete-selected");
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", () => {
      const ids = state.selection.cashFlow;
      const doDelete = () => {
        state.data.cashFlow = state.data.cashFlow.filter((r) => !ids.has(r.id));
        state.selection.cashFlow.clear();
        saveData(state.data);
        renderCashFlowTab();
      };
      if (!motionOK) { doDelete(); return; }
      tbody.querySelectorAll("tr.cf-row").forEach((tr) => { if (ids.has(tr.dataset.id)) tr.classList.add("row-exit"); });
      setTimeout(doDelete, 170);
    });
  }

  // field edits — soft update (no full re-render, keeps focus)
  tbody.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.field) return;
    const row = state.data.cashFlow.find((r) => r.id === t.dataset.id);
    if (!row) return;
    row[t.dataset.field] = t.dataset.type === "number" ? (parseFloat(t.value) || 0) : t.value;

    if (t.dataset.field === "income" || t.dataset.field === "expense") {
      row.net = recalcNet(row);
      const up = row.net >= 0;
      const iconSpan = tbody.querySelector(`[data-net-icon="${row.id}"]`);
      if (iconSpan) { iconSpan.className = up ? "gain-up" : "gain-down"; iconSpan.innerHTML = up ? ICON.up : ICON.down; }
      const netValueSpan = tbody.querySelector(`[data-net-value="${row.id}"]`);
      if (netValueSpan) { netValueSpan.textContent = fmt(row.net); netValueSpan.className = `mono ${up ? "gain-up" : "gain-down"}`; }
    }
    saveData(state.data);

    const totalNet = state.data.cashFlow.reduce((s, r) => s + (Number(r.net) || 0), 0);
    const totalEl = document.getElementById("cf-total");
    if (totalEl) { animateNumber(totalEl, totalNet, fmt); totalEl.style.color = totalNet >= 0 ? "var(--positive)" : "var(--negative)"; }
  });

  // click a row (but not its inputs/checkbox/drag-handle/delete button) to open the
  // detailed-spending modal for that month
  tbody.addEventListener("click", (e) => {
    if (e.target.closest("input, button, select, .drag-handle")) return;
    const tr = e.target.closest("tr.cf-row");
    if (!tr) return;
    state.openCfDetailId = tr.dataset.id;
    renderCashFlowTab();
  });

  // delete (fade out, then remove)
  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="delete-cf"]');
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = btn.dataset.id;
    if (!motionOK || !tr) {
      state.data.cashFlow = state.data.cashFlow.filter((r) => r.id !== id);
      saveData(state.data);
      renderCashFlowTab();
      return;
    }
    tr.classList.add("row-exit");
    setTimeout(() => {
      state.data.cashFlow = state.data.cashFlow.filter((r) => r.id !== id);
      saveData(state.data);
      renderCashFlowTab();
    }, 170);
  });

  // drag reorder
  tbody.addEventListener("dragstart", (e) => {
    const tr = e.target.closest("tr.cf-row");
    if (!tr) return;
    dragSrcIndex = +tr.dataset.index;
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    const tr = e.target.closest("tr.cf-row");
    tbody.querySelectorAll(".cf-row").forEach((row) => row.classList.remove("drag-over-top", "drag-over-bottom"));
    if (!tr) return;
    const rect = tr.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    tr.classList.add(before ? "drag-over-top" : "drag-over-bottom");
  });
  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    const tr = e.target.closest("tr.cf-row");
    tbody.querySelectorAll(".cf-row").forEach((row) => row.classList.remove("drag-over-top", "drag-over-bottom"));
    if (!tr || dragSrcIndex === null) return;
    let destIndex = +tr.dataset.index;
    const rect = tr.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    if (!before) destIndex += 1;
    const arr = state.data.cashFlow;
    const [moved] = arr.splice(dragSrcIndex, 1);
    const adjustedDest = destIndex > dragSrcIndex ? destIndex - 1 : destIndex;
    arr.splice(adjustedDest, 0, moved);
    dragSrcIndex = null;
    saveData(state.data);
    renderCashFlowTab();
  });
  tbody.addEventListener("dragend", () => {
    tbody.querySelectorAll(".cf-row").forEach((row) => row.classList.remove("dragging", "drag-over-top", "drag-over-bottom"));
    dragSrcIndex = null;
  });
}

// ---------------------------------------------------------------------------
// assets tab
// ---------------------------------------------------------------------------
const ASSET_CATEGORIES = ["Gold", "Silver", "Crypto", "Stocks", "Cash"];

function renderAssetsTab() {
  const container = document.getElementById("tab-content");
  const rows = state.data.assets;
  const mp = state.data.marketPrices || {};
  const selCount = state.selection.assets.size;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px" id="assets-root">
      ${selCount > 0 ? `
      <div class="frame enter" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px">
        <span style="font-size:13px">${selCount} asset${selCount === 1 ? "" : "s"} selected</span>
        <div style="display:flex;gap:10px">
          <button class="icon-btn" id="assets-clear-selection">Clear</button>
          <button class="glow-btn" id="assets-delete-selected" style="border-color:var(--negative);color:var(--negative)">${ICON.trash} Delete selected (${selCount})</button>
        </div>
      </div>` : ""}
      <div class="frame enter" id="market-panel">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <div class="label">Live market prices</div>
            <div class="market-note">Gold/silver spot + USD·MYR rate from <b>xaus.com</b> (free, no key). Pick a coin for any crypto asset and it'll convert qty × live price from CoinGecko. Last updated: <span id="mp-updated">${mp.lastUpdated ? new Date(mp.lastUpdated).toLocaleString() : "—"}</span>.</div>
          </div>
          <button class="glow-btn" id="refresh-btn" ${state.refreshing ? "disabled" : ""}>${ICON.refresh(state.refreshing)} ${state.refreshing ? "Fetching…" : "Refresh live prices"}</button>
        </div>
        <div class="market-fields">
          <div><div class="market-field-label">Gold / gram (RM)</div><span class="mono" style="font-size:16px" id="mp-gold">${(mp.goldPerGram || 0).toFixed(2)}</span></div>
          <div><div class="market-field-label">Silver / gram (RM)</div><span class="mono" style="font-size:16px" id="mp-silver">${(mp.silverPerGram || 0).toFixed(2)}</span></div>
          <div><div class="market-field-label">USD / MYR</div><span class="mono" style="font-size:16px" id="mp-fx">${(mp.usdMyr || 0).toFixed(4)}</span></div>
          ${mp.btcUsd ? `<div><div class="market-field-label">BTC / USD</div><span class="mono" style="font-size:16px" id="mp-btc">${Number(mp.btcUsd).toLocaleString()}</span></div>` : ""}
        </div>
        <div id="refresh-error" class="refresh-error" style="display:${state.refreshError ? "block" : "none"}">${state.refreshError || ""}</div>
      </div>

      ${ASSET_CATEGORIES.map((cat, ci) => assetCategoryHTML(cat, rows, ci)).join("")}

      ${!rows.some((r) => r.category === "Cash") ? `<button class="dashed-btn" id="add-cash-asset">${ICON.wallet} Track a cash-type asset (savings account, fixed deposit…)</button>` : ""}
    </div>
  `;

  document.getElementById("refresh-btn").addEventListener("click", refreshLivePrices);
  const addCashBtn = document.getElementById("add-cash-asset");
  if (addCashBtn) addCashBtn.addEventListener("click", () => { addAssetRow("Cash"); });

  wireAssetsTable();
}

function assetCategoryHTML(cat, rows, ci = 0) {
  const catRows = rows.filter((r) => r.category === cat);
  if (catRows.length === 0 && cat === "Cash") return "";
  const catTotal = catRows.reduce((s, r) => s + (Number(r.currentValue) || 0), 0);
  const hasWeight = cat === "Gold" || cat === "Silver";
  const hasCrypto = cat === "Crypto";
  const delay = 50 + ci * 60;
  const allSelected = catRows.length > 0 && catRows.every((r) => state.selection.assets.has(r.id));

  return `
    <div class="frame enter" style="animation-delay:${delay}ms" data-category-frame="${cat}">
      <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="display:inline-flex;color:${CATEGORY_HEX[cat]};filter:drop-shadow(0 0 4px ${CATEGORY_HEX[cat]}88)">${CATEGORY_ICON[cat] || ""}</span>
          <span style="font-size:15px">${cat}</span>
          <span class="mono" id="cat-total-${cat}" data-raw-value="${catTotal}" style="font-size:12.5px;color:var(--text-dim)">${fmt(catTotal)}</span>
        </div>
        <button class="icon-btn" data-action="add-asset" data-category="${cat}" title="Add ${cat} asset">${ICON.plus}</button>
      </div>
      ${catRows.length === 0 ? `<div class="empty-note">Nothing here yet.</div>` : `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:26px"><input type="checkbox" class="select-all-category" data-select-all-category="${cat}" ${allSelected ? "checked" : ""} /></th>
            <th style="min-width:160px">Name</th>
            ${hasWeight ? `<th style="min-width:90px">Weight (g)</th>` : ""}
            ${hasCrypto ? `<th style="min-width:150px">Coin</th><th style="min-width:80px">Qty</th>` : ""}
            <th style="min-width:100px">Buy price</th>
            <th style="min-width:110px">Current value</th>
            <th style="min-width:100px">Gain / loss</th>
            <th style="width:40px"></th>
          </tr></thead>
          <tbody data-category-tbody="${cat}">
            ${catRows.map((r, i) => assetRowHTML(r, cat, i)).join("")}
          </tbody>
        </table>
      </div>`}
    </div>`;
}

function assetRowHTML(r, cat, i = 0) {
  const gain = (Number(r.currentValue) || 0) - (Number(r.buyPrice) || 0);
  const gainClass = gain === 0 ? "gain-flat" : gain > 0 ? "gain-up" : "gain-down";
  const hasWeight = cat === "Gold" || cat === "Silver";
  const hasCrypto = cat === "Crypto";
  const delay = Math.min(i * 24, 300);
  const checked = state.selection.assets.has(r.id);
  return `
    <tr class="enter-fast ${checked ? "row-selected" : ""}" style="animation-delay:${delay}ms" data-asset-row="${r.id}">
      <td><input type="checkbox" class="row-check" data-select-id="${r.id}" ${checked ? "checked" : ""} /></td>
      <td><input class="ghost-input sans" data-id="${r.id}" data-field="name" data-type="text" value="${esc(r.name)}" /></td>
      ${hasWeight ? `<td><input class="ghost-input" data-id="${r.id}" data-field="grams" data-type="number" value="${r.grams ?? ""}" placeholder="—" /></td>` : ""}
      ${hasCrypto ? `
        <td>${buildCoinSelectHTML(r)}</td>
        <td><input class="ghost-input" data-id="${r.id}" data-field="qty" data-type="number" value="${r.qty ?? ""}" placeholder="—" /></td>
      ` : ""}
      <td><input class="ghost-input" data-id="${r.id}" data-field="buyPrice" data-type="number" value="${r.buyPrice}" /></td>
      <td><input class="ghost-input" data-id="${r.id}" data-field="currentValue" data-type="number" value="${r.currentValue}" /></td>
      <td><span class="mono ${gainClass}" data-gain="${r.id}">${gain === 0 ? "—" : `${gain > 0 ? "+" : ""}${fmt(gain)}`}</span></td>
      <td><button class="icon-btn danger" data-action="delete-asset" data-id="${r.id}" title="Delete">${ICON.trash}</button></td>
    </tr>`;
}

function addAssetRow(category) {
  state.data.assets.push({ id: uid(), category, name: "New asset", buyPrice: 0, currentValue: 0 });
  saveData(state.data);
  renderAssetsTab();
}

function wireAssetsTable() {
  const container = document.getElementById("assets-root");

  container.addEventListener("click", (e) => {
    const addBtn = e.target.closest('[data-action="add-asset"]');
    if (addBtn) { addAssetRow(addBtn.dataset.category); return; }

    const delBtn = e.target.closest('[data-action="delete-asset"]');
    if (delBtn) {
      const tr = delBtn.closest("tr");
      const id = delBtn.dataset.id;
      if (!motionOK || !tr) {
        state.data.assets = state.data.assets.filter((r) => r.id !== id);
        state.selection.assets.delete(id);
        saveData(state.data);
        renderAssetsTab();
        return;
      }
      tr.classList.add("row-exit");
      setTimeout(() => {
        state.data.assets = state.data.assets.filter((r) => r.id !== id);
        state.selection.assets.delete(id);
        saveData(state.data);
        renderAssetsTab();
      }, 170);
      return;
    }

    if (e.target.closest("#assets-clear-selection")) {
      state.selection.assets.clear();
      renderAssetsTab();
      return;
    }

    if (e.target.closest("#assets-delete-selected")) {
      const ids = state.selection.assets;
      const doDelete = () => {
        state.data.assets = state.data.assets.filter((r) => !ids.has(r.id));
        state.selection.assets.clear();
        saveData(state.data);
        renderAssetsTab();
      };
      if (!motionOK) { doDelete(); return; }
      container.querySelectorAll("[data-asset-row]").forEach((tr) => { if (ids.has(tr.dataset.assetRow)) tr.classList.add("row-exit"); });
      setTimeout(doDelete, 170);
    }
  });

  // selection checkboxes (row + per-category select-all)
  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t.classList.contains("row-check")) {
      const id = t.dataset.selectId;
      if (t.checked) state.selection.assets.add(id);
      else state.selection.assets.delete(id);
      renderAssetsTab();
      return;
    }
    if (t.dataset.selectAllCategory) {
      const cat = t.dataset.selectAllCategory;
      const catIds = state.data.assets.filter((r) => r.category === cat).map((r) => r.id);
      if (t.checked) catIds.forEach((id) => state.selection.assets.add(id));
      else catIds.forEach((id) => state.selection.assets.delete(id));
      renderAssetsTab();
    }
  });

  const handleFieldEdit = (e) => {
    const t = e.target;
    if (!t.dataset.field || !t.dataset.id) return;
    const row = state.data.assets.find((r) => r.id === t.dataset.id);
    if (!row) return;
    const val = t.dataset.type === "number" ? (t.value === "" ? undefined : (parseFloat(t.value) || 0)) : t.value;
    row[t.dataset.field] = val;
    saveData(state.data);

    if (t.dataset.field === "buyPrice" || t.dataset.field === "currentValue") {
      const gain = (Number(row.currentValue) || 0) - (Number(row.buyPrice) || 0);
      const gainEl = container.querySelector(`[data-gain="${row.id}"]`);
      if (gainEl) {
        gainEl.textContent = gain === 0 ? "—" : `${gain > 0 ? "+" : ""}${fmt(gain)}`;
        gainEl.className = `mono ${gain === 0 ? "gain-flat" : gain > 0 ? "gain-up" : "gain-down"}`;
      }
    }
    if (t.dataset.field === "currentValue") {
      const catTotal = state.data.assets.filter((r) => r.category === row.category).reduce((s, r) => s + (Number(r.currentValue) || 0), 0);
      const totalEl = document.getElementById(`cat-total-${row.category}`);
      if (totalEl) animateNumber(totalEl, catTotal, fmt);
    }
  };
  container.addEventListener("input", handleFieldEdit);
  container.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") handleFieldEdit(e); });
}

// ---------------------------------------------------------------------------
// live market price refresh — xaus.com (gold/silver/fx/btc) + CoinGecko (coins)
// ---------------------------------------------------------------------------
async function refreshLivePrices() {
  state.refreshing = true;
  state.refreshError = null;
  renderAssetsTab();

  try {
    const res = await fetch("https://xaus.com/api/v1/spot?currency=MYR&unit=gram&compact=1");
    if (!res.ok) throw new Error(`Gold/silver price request failed (${res.status})`);
    const j = await res.json();

    const goldPerGram = j.xau.price;
    const fx = j.fx_rate; // USD -> MYR
    const silverPerGram = (Number(j.silver_usd_oz) * fx) / OZ_TO_GRAM;
    const btcUsd = j.btc_usd ?? null;

    // optional per-coin lookups via CoinGecko for crypto rows that specify a coinId + qty
    const coinAssets = state.data.assets.filter((a) => a.category === "Crypto" && a.coinId && a.qty != null);
    let coinPrices = {};
    if (coinAssets.length) {
      const ids = [...new Set(coinAssets.map((a) => a.coinId.trim().toLowerCase()))].join(",");
      try {
        const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=myr`);
        if (cgRes.ok) coinPrices = await cgRes.json();
      } catch (err) { console.warn("CoinGecko lookup failed", err); }
    }

    state.data.marketPrices = { goldPerGram, silverPerGram, usdMyr: fx, btcUsd, lastUpdated: new Date().toISOString() };

    state.data.assets = state.data.assets.map((a) => {
      if (a.category === "Gold" && a.grams != null) return { ...a, currentValue: a.grams * goldPerGram };
      if (a.category === "Silver" && a.grams != null) return { ...a, currentValue: a.grams * silverPerGram };
      if (a.category === "Crypto" && a.coinId && a.qty != null && coinPrices[a.coinId.trim().toLowerCase()]) {
        return { ...a, currentValue: a.qty * coinPrices[a.coinId.trim().toLowerCase()].myr };
      }
      return a;
    });

    saveData(state.data);
  } catch (err) {
    console.error(err);
    state.refreshError = "Could not fetch live prices — check your connection and try again.";
  } finally {
    state.refreshing = false;
    renderAssetsTab();
  }
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
render();
