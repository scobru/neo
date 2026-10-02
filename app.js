import * as webllm from 'https://esm.run/@mlc-ai/web-llm@0.2.85';
import { SYSTEM, buildPrompt, OPS } from './ops.js';
import { fmtMsg, escHtml } from './format.js';

// project renamed leo → neo: carry over what was saved under the old name
for (const k of ['theme', 'convs', 'agents', 'agent', 'custom']) {
  const old = localStorage.getItem('leo-' + k);
  if (old !== null && localStorage.getItem('neo-' + k) === null) localStorage.setItem('neo-' + k, old);
}

window.toggleTheme = () => {
  const html = document.documentElement;
  html.classList.toggle('dark');
  localStorage.setItem('neo-theme', html.classList.contains('dark') ? 'dark' : 'light');
};
// Init theme from storage / pref
(function initTheme() {
  const stored = localStorage.getItem('neo-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (stored === 'dark' || (!stored && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
})();

// No blocking overlay when WebGPU is missing: GGUF (CPU) models still work; the model picker explains it.

// ── State ──────────────────────────────────
let engine = null;
let worker = null;
let isGenerating = false;
let currentStop = null;   // resolves the running generation's stop promise
let genId = 0;            // bumps on every generation; lets a repeated interrupt know when to stop
let currentModelId = null;
let conversations = (() => { // [{id, title, agentId, messages:[]}]
  try { return JSON.parse(localStorage.getItem('neo-convs')) || []; } catch { return []; }
})();
let activeConvId = null;
// ponytail: whole list rewritten on each save; fine until localStorage (~5MB) fills
const saveConvs = () => {
  try { localStorage.setItem('neo-convs', JSON.stringify(conversations.filter(c => c.messages.length))); } catch {}
};

// ── Agents (editable system prompts) ───────
const DEF_PROMPT = 'Sei Neo, assistente AI. Rispondi sempre in italiano, in modo breve e diretto. Se non sai la risposta, dillo.';
let agents = (() => {
  try {
    const a = JSON.parse(localStorage.getItem('neo-agents'));
    if (a?.length) return a.map(x => x.id === 'leo' ? { ...x, id: 'neo', name: x.name === 'Leo' ? 'Neo' : x.name, prompt: x.prompt.replace(/^Sei Leo/, 'Sei Neo') } : x);
  } catch {}
  return [{ id: 'neo', name: 'Neo', prompt: DEF_PROMPT }];
})();
let curAgentId = localStorage.getItem('neo-agent') || agents[0].id;
const getAgent = id => agents.find(a => a.id === id) || agents[0];
const saveAgents = () => localStorage.setItem('neo-agents', JSON.stringify(agents));

function renderAgents() {
  const sel = document.getElementById('agent-sel');
  sel.innerHTML = agents.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
  curAgentId = getAgent(curAgentId).id;
  sel.value = curAgentId;
}

window.setAgent = function(id) {
  curAgentId = id;
  localStorage.setItem('neo-agent', id);
  const conv = getActiveConv();
  if (conv) conv.agentId = id;
  renderAgents();
};

window.editAgent = function() {
  const a = getAgent(curAgentId);
  document.getElementById('ag-name').value = a.name;
  document.getElementById('ag-prompt').value = a.prompt;
  document.getElementById('ag-temp').value = a.temperature ?? '';
  document.getElementById('ag-topp').value = a.top_p ?? '';
  document.getElementById('ag-max').value = a.max_tokens ?? '';
  document.getElementById('ag-dialog').showModal();
};

window.newAgent = function() {
  const a = { id: Date.now().toString(36), name: 'Nuovo agente', prompt: DEF_PROMPT };
  agents.push(a);
  saveAgents();
  setAgent(a.id);
  editAgent();
};

window.saveAgent = function() {
  const a = getAgent(curAgentId);
  a.name = document.getElementById('ag-name').value.trim() || 'Agente';
  a.prompt = document.getElementById('ag-prompt').value;
  const num = id => { const v = document.getElementById(id).value.trim(); return v === '' || isNaN(+v) ? undefined : +v; };
  a.temperature = num('ag-temp'); a.top_p = num('ag-topp'); a.max_tokens = num('ag-max');
  saveAgents();
  renderAgents();
  document.getElementById('ag-dialog').close();
};

window.delAgent = function() {
  if (agents.length < 2) return; // keep at least one
  agents = agents.filter(a => a.id !== curAgentId);
  saveAgents();
  setAgent(agents[0].id);
  document.getElementById('ag-dialog').close();
};

// ── Web search (opt-in). Query is PII-masked on device by Desert Ant "Redact" first;
// if Redact can't load, the search is refused (fail closed).
let webOn = false;
let redactP;
async function safeQuery(text) {
  redactP ??= import('https://esm.sh/@desert-ant-labs/redact@3.5.0')
    .then(m => m.Redact.load())
    .catch(e => { redactP = null; throw e; });
  const { redactedText } = await (await redactP).redaction(text);
  return redactedText.replace(/\[[A-Z_]+_\d+\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

// Keyed provider: Serper (Google results, serper.dev, 2500 free queries). Chosen because it accepts calls from a browser page;
// Tavily, Brave Search and Exa don't (no CORS headers), DuckDuckGo blocks server IPs. No key = Wikipedia.
async function webSearch(q) {
  const key = localStorage.getItem('neo-serper');
  if (key) {
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q, gl: 'it', hl: 'it', num: 4 }),
      });
      if (r.ok) {
        const res = ((await r.json()).organic || []).filter(x => x.snippet)
          .map(x => ({ title: x.title, url: x.link, text: x.snippet.slice(0, 500) }));
        if (res.length) return res;
      } else toast(`Serper ha risposto ${r.status} (chiave non valida o limite raggiunto): uso Wikipedia.`);
    } catch { toast('Serper non raggiungibile: uso Wikipedia.'); }
  }
  const u = 'https://it.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: q, gsrlimit: 3, prop: 'extracts',
    exintro: 1, explaintext: 1, exchars: 600, format: 'json', origin: '*',
  });
  const pages = Object.values((await (await fetch(u)).json()).query?.pages || {}).sort((a, b) => a.index - b.index);
  return pages.map(p => ({ title: p.title, url: 'https://it.wikipedia.org/?curid=' + p.pageid, text: p.extract }));
}

async function webContext(text) {
  const q = await safeQuery(text);
  if (!q) return null;
  const res = (await webSearch(q)).filter(r => r.text);
  if (!res.length) return null;
  const ctx = res.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.text}`).join('\n\n');
  return { block: `Fonti web:\n${ctx}`, list: res.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join('\n') };
}

// ── Attachments: text/code, PDF (pdf.js), images (Tesseract OCR) — all on device ──
let pending = []; // [{name, text, error}]
const TEXT_RE = /\.(txt|md|csv|tsv|json|xml|html?|css|jsx?|tsx?|py|java|c|cpp|h|go|rs|sh|sql|ya?ml|toml|ini|log)$/i;
let pdfjsP;

async function pdfText(f) {
  pdfjsP ??= (async () => {
    const V = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
    const lib = await import(V + 'pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
      new Blob([await (await fetch(V + 'pdf.worker.min.mjs')).text()], { type: 'text/javascript' }));
    return lib;
  })().catch(e => { pdfjsP = null; throw e; });
  const doc = await (await pdfjsP).getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    out += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n\n';
  }
  return out;
}

async function ocrText(f) {
  if (!window.Tesseract) await new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = ok; s.onerror = () => ko(new Error('OCR non caricato'));
    document.head.appendChild(s);
  });
  return (await Tesseract.recognize(f, 'ita+eng')).data.text;
}

async function extractText(f) {
  if (f.size > 20e6) throw new Error('file troppo grande (max 20 MB)');
  if (f.type.startsWith('image/')) return ocrText(f);
  if (/\.pdf$/i.test(f.name)) return pdfText(f);
  if (f.type.startsWith('text/') || TEXT_RE.test(f.name)) return f.text();
  throw new Error('formato non supportato');
}

// Context is small (~4k tokens): keep only the chunks that best match the question.
function pickChunks(text, q, budget) {
  if (text.length <= budget) return text;
  const words = q.toLowerCase().match(/\p{L}{4,}/gu) || [];
  const chunks = (text.match(/[\s\S]{1,1000}(?=\s|$)/g) || [text]).map((c, i) => {
    const l = c.toLowerCase();
    return { i, c, s: words.filter(w => l.includes(w)).length };
  });
  let used = 0;
  const keep = [...chunks].sort((a, b) => b.s - a.s || a.i - b.i)
    .filter(x => (used += x.c.length) <= budget);
  return keep.sort((a, b) => a.i - b.i).map(x => x.c.trim()).join('\n[…]\n');
}

function renderChips() {
  const el = document.getElementById('chips');
  el.innerHTML = '';
  pending.forEach((f, i) => {
    const c = document.createElement('span');
    c.className = 'chip' + (f.error ? ' err' : '');
    c.textContent = '📎 ' + f.name + (f.error ? ` — ${f.error}` : f.text == null ? ' …' : f.text.trim() ? '' : ' — nessun testo');
    const x = document.createElement('button');
    x.textContent = '✕';
    x.onclick = () => { pending.splice(i, 1); renderChips(); };
    c.appendChild(x);
    el.appendChild(c);
  });
}

window.pickFiles = () => document.getElementById('file-input').click();
document.getElementById('file-input').addEventListener('change', async e => {
  for (const f of e.target.files) {
    const item = { name: f.name, text: null };
    pending.push(item);
    renderChips();
    try { item.text = await extractText(f); } catch (err) { item.error = err.message; }
    renderChips();
  }
  e.target.value = '';
});

// ── Topic tag per chat (Desert Ant "Gist", on device, loaded lazily in background) ──
let gistP;
async function tagConv(conv, text) {
  if (conv.topic !== undefined) return;
  conv.topic = null; // one attempt per chat
  try {
    gistP ??= import('https://esm.sh/@desert-ant-labs/gist@3.5.0')
      .then(m => m.Gist.load())
      .catch(e => { gistP = null; throw e; });
    conv.topic = (await (await gistP).classify(text.slice(0, 500)))[0]?.name ?? null;
    saveConvs();
    renderConvList();
  } catch (e) { console.warn('Gist:', e); }
}

async function askSerperKey() {
  const k = await ask('Ricerca web: le query escono dal dispositivo (dati personali mascherati in locale).\nChiave Serper opzionale, da serper.dev (2500 ricerche gratis). Vuoto = solo Wikipedia:',
    { ok: 'Salva', input: true, value: localStorage.getItem('neo-serper') || '' });
  if (k !== null) localStorage.setItem('neo-serper', k.trim());
}

// click = on/off; Shift+click = change the Serper key
window.toggleWeb = async function(e) {
  if (e?.shiftKey) return askSerperKey();
  webOn = !webOn;
  document.getElementById('web-toggle').classList.toggle('on', webOn);
  if (webOn && localStorage.getItem('neo-serper') === null) {
    await askSerperKey();
    if (localStorage.getItem('neo-serper') === null) localStorage.setItem('neo-serper', ''); // cancelled: don't ask again
  }
};

// Keep last messages within a char budget (~1.5k tokens); always keep the newest.
function trimHistory(msgs, budget = 6000) {
  let n = 0, i = msgs.length;
  while (i > 0 && (n += msgs[i - 1].content.length) <= budget) i--;
  return msgs.slice(Math.min(i, msgs.length - 1));
}

// ── DOM ────────────────────────────────────
const $ = id => document.getElementById(id);
const $onboard      = $('onboard');
const $chatView     = $('chat-view');
const $chatInner    = $('chat-inner');
const $chatInput    = $('chat-input');
const $btnSend      = $('btn-send');
const $btnStop      = $('btn-stop');
const $convList     = $('conv-list');
const $convEmpty    = $('conv-empty');
const $statusDot    = $('status-dot');
const $statusLabel  = $('status-label');
const $progressEl   = $('onboard-progress');
const $progressFill = $('progress-fill');
const $progressText = $('progress-text');
const $btnStart     = $('btn-start');
const $cmdPopover   = $('cmd-popover');

// ── Model discovery ───────────────────────
const DESIRED = [
  'smollm', 'qwen2.5-0.5b', 'qwen2.5-1.5b', 'qwen2.5-3b',
  'llama-3.2-1b', 'llama-3.2-3b', 'phi-3.5-mini', 'phi-4-mini',
  'gemma-2-2b', 'gemma-3-1b', 'tinyllama',
];

// Custom models (your own MLC builds): stored locally, shown first in the picker.
// WebLLM appends "resolve/main/" to `model` unless the URL already contains "/resolve/<branch>/".
let customModels = (() => {
  try { return JSON.parse(localStorage.getItem('neo-custom')) || []; } catch { return []; }
})();
const allModels = () => [...webllm.prebuiltAppConfig.model_list, ...COMMUNITY_MLC, ...customModels.filter(m => !m.gguf)];

// In-page replacements for confirm/alert/prompt: embedded browsers and some settings suppress the native ones,
// which made "Elimina" silently do nothing.
function ask(msg, { ok = 'Elimina', input = false, value = '' } = {}) {
  const d = document.getElementById('ask-dialog'), inp = document.getElementById('ask-input');
  document.getElementById('ask-msg').textContent = msg;
  document.getElementById('ask-ok').textContent = ok;
  inp.style.display = input ? '' : 'none';
  inp.value = value;
  return new Promise(res => {
    const done = v => { d.onclose = null; d.close(); res(v); };
    document.getElementById('ask-ok').onclick = () => done(input ? inp.value : true);
    document.getElementById('ask-no').onclick = () => done(input ? null : false);
    d.onclose = () => res(input ? null : false); // Esc
    d.showModal();
    if (input) inp.focus();
  });
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

const $g = id => document.getElementById(id);
const absUrl = u => new URL(u.trim(), location.href).href; // relative paths → served from this origin
// '@Qwen2.5-1.5B-Instruct-q4f16_1-MLC' → reuse that prebuilt model's .wasm (same architecture/quantization/context)
function libUrl(u) {
  if (!u.trim().startsWith('@')) return absUrl(u);
  const l = webllm.prebuiltAppConfig.model_list.find(m => m.model_id === u.trim().slice(1))?.model_lib;
  if (!l) throw new Error('modello del catalogo non trovato: ' + u.trim().slice(1));
  return l;
}

// optional fields + persist + refresh picker (shared by URL and local-folder flows)
function saveCustom(rec) {
  if (!rec.model_id) throw new Error('nome mancante');
  if (+$g('cm-vram').value) rec.vram_required_MB = +$g('cm-vram').value;
  if (+$g('cm-ctx').value) rec.overrides = { context_window_size: +$g('cm-ctx').value };
  if ($g('cm-f16').checked) rec.required_features = ['shader-f16'];
  customModels = [...customModels.filter(m => m.model_id !== rec.model_id), rec];
  localStorage.setItem('neo-custom', JSON.stringify(customModels));
  $g('cm-dialog').close();
  initModelPicker();
}

window.addCustom = function() {
  try {
    saveCustom({ model_id: $g('cm-id').value.trim(), model: absUrl($g('cm-model').value), model_lib: libUrl($g('cm-lib').value) });
  } catch (err) { toast('Modello non valido: ' + err.message); }
};

window.addGguf = function() {
  try {
    const url = absUrl($g('cm-gguf').value);
    const rec = { model_id: $g('cm-id').value.trim() || decodeURIComponent(url.split('/').pop().replace(/\.gguf$/i, '')), gguf: url };
    if (+$g('cm-ctx').value) rec.n_ctx = +$g('cm-ctx').value;
    saveCustom(rec);
  } catch (err) { toast('GGUF non valido: ' + err.message); }
};

// ── Local model from disk ──
// WebLLM only knows URLs, so the files are copied into the same browser Cache it uses for downloads,
// under a fake https://leo.local/... base URL. It then finds them "already downloaded".
const LOCAL_BASE = 'https://leo.local/';
const CACHE_SCOPES = ['webllm/config', 'webllm/model', 'webllm/wasm'];

window.importLocal = async function() {
  const st = $g('cm-status');
  try {
    const files = [...$g('cm-folder').files];
    const rel = f => f.webkitRelativePath.split('/').slice(1).join('/');
    const usable = files.filter(f => !rel(f).split('/').some(seg => seg.startsWith('.')));
    if (!usable.some(f => rel(f) === 'mlc-chat-config.json'))
      throw new Error('scegli la cartella MLC (deve contenere mlc-chat-config.json)');
    const id = $g('cm-id').value.trim() || files[0].webkitRelativePath.split('/')[0];
    const base = `${LOCAL_BASE}${encodeURIComponent(id)}/resolve/main/`;
    navigator.storage?.persist?.(); // ask the browser not to evict the copied weights

    const wasm = $g('cm-wasm').files[0] || usable.find(f => f.name.endsWith('.wasm'));
    const model = usable.filter(f => !f.name.endsWith('.wasm'));
    const put = async (scope, url, f) => (await caches.open(scope)).put(url, new Response(f));
    let n = 0;
    for (const f of model) {
      const r = rel(f);
      await put('webllm/model', base + r, f);
      if (r === 'mlc-chat-config.json') await put('webllm/config', base + r, f);
      st.textContent = `Importo ${++n}/${model.length}: ${r}`;
    }
    let model_lib;
    if (wasm) { model_lib = base + wasm.name; await put('webllm/wasm', model_lib, wasm); }
    else {
      if (!$g('cm-lib').value.trim()) throw new Error('serve un .wasm: nella cartella, nel campo file, oppure @modello del catalogo nel campo libreria');
      model_lib = libUrl($g('cm-lib').value);
    }

    st.textContent = '';
    saveCustom({ model_id: id, model: base, model_lib });
  } catch (err) {
    st.textContent = 'Errore: ' + (err?.message || err);
  }
};

async function purgeLocal(m) { // delete the copied files of a local model
  for (const scope of CACHE_SCOPES) {
    const c = await caches.open(scope);
    for (const r of await c.keys()) if (r.url.startsWith(m.model)) await c.delete(r);
  }
}

// ── GGUF models (Minerva…) run with wllama = llama.cpp compiled to WebAssembly: a 2nd backend next to WebLLM ──
const HF = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;
const GGUF_CATALOG = [
  // Minerva: Sapienza NLP, native Italian/English *base* models; GGUF quants by mradermacher (not gated)
  { it: true, model_id: 'Minerva-350M-base-Q8_0', size: 374, gguf: HF('mradermacher/Minerva-350M-base-v1.0-GGUF', 'Minerva-350M-base-v1.0.Q8_0.gguf') },
  { it: true, model_id: 'Minerva-1B-base-Q4_K_M', size: 617, gguf: HF('mradermacher/Minerva-1B-base-v1.0-GGUF', 'Minerva-1B-base-v1.0.Q4_K_M.gguf') },
  { it: true, model_id: 'Minerva-3B-base-Q4_K_M', size: 1752, gguf: HF('mradermacher/Minerva-3B-base-v1.0-GGUF', 'Minerva-3B-base-v1.0.Q4_K_M.gguf') },
  // MiniCPM5 (OpenBMB, official GGUF): chat models, English/Chinese. ChatML format, thinking switched off.
  { note: 'EN/中文, italiano debole', model_id: 'MiniCPM5-1B-Q4_K_M', size: 688, format: 'chatml', bos: '<s>', noThink: true, sampling: { temperature: 0.7, top_p: 0.95 }, gguf: HF('openbmb/MiniCPM5-1B-GGUF', 'MiniCPM5-1B-Q4_K_M.gguf') },
  { note: 'EN/中文, italiano debole', model_id: 'MiniCPM5-2B-Q4_K_M', size: 1561, format: 'chatml', bos: '<s>', noThink: true, sampling: { temperature: 0.7, top_p: 0.95 }, gguf: HF('openbmb/MiniCPM5-2B-GGUF', 'MiniCPM5-2B-Q4_K_M.gguf') },
];
// WebGPU (MLC) build of MiniCPM5-2B by a community author, NOT by OpenBMB (https://huggingface.co/ozhyhinas/MiniCPM5-2B-q4f16_1-MLC).
// Its .wasm runs inside your browser tab: only use it if you trust the author.
const COMMUNITY_MLC = [{
  community: true, noThink: true, sampling: { temperature: 0.7, top_p: 0.95 }, // OpenBMB's recommended no-think sampling
  model_id: 'MiniCPM5-2B-q4f16_1-MLC',
  model: 'https://huggingface.co/ozhyhinas/MiniCPM5-2B-q4f16_1-MLC',
  model_lib: 'https://huggingface.co/ozhyhinas/MiniCPM5-2B-q4f16_1-MLC/resolve/main/libs/MiniCPM5-2B-q4f16_1-MLC-webgpu.wasm',
  vram_required_MB: 2000, // estimate (weights are 1.42 GB)
  required_features: ['shader-f16'],
  overrides: { context_window_size: 4096 },
}];
// inline SVG: flag emoji don't render on Windows (they show up as the letters "IT")
const IT_FLAG = '<svg viewBox="0 0 3 2" width="18" height="12" style="vertical-align:-1px;margin-left:6px;border-radius:2px" role="img" aria-label="Italiano"><title>Modello nativo italiano</title><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ce2b37"/><rect width="3" height="2" fill="none" stroke="rgba(0,0,0,.15)" stroke-width=".08"/></svg>';
const ggufModels = () => [...GGUF_CATALOG, ...customModels.filter(m => m.gguf)];
const curRec = () => [...allModels(), ...ggufModels()].find(m => m.model_id === currentModelId);
const noThink = () => !!curRec()?.noThink;

// Base models have no chat template: plain "### Utente / ### Assistente" format, cut at the next "###".
function basePrompt(msgs) {
  const sys = msgs.find(m => m.role === 'system')?.content;
  const turns = msgs.filter(m => m.role !== 'system')
    .map(m => `### ${m.role === 'user' ? 'Utente' : 'Assistente'}:\n${m.content}\n`).join('\n');
  return (sys ? sys + '\n\n' : '') + turns + '\n### Assistente:\n';
}

// ChatML (MiniCPM5 & co.). bos: MiniCPM needs a leading <s>; without it the output degenerates into "***" lines. noThink pre-fills an empty <think> block, as the model's own template does for enable_thinking=false.
function chatmlPrompt(msgs, noThink, bos = '') {
  return bos + msgs.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('')
    + '<|im_start|>assistant\n' + (noThink ? '<think>\n\n</think>\n\n' : '');
}

// Returns an object shaped like the WebLLM engine (chat.completions.create + interruptGenerate)
async function loadGguf(rec, onProgress) {
  const V = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/';
  const { Wllama } = await import(V + 'index.js');
  let w;
  // ponytail: CPU only (n_gpu_layers 0); single thread unless the page is cross-origin isolated. Raise it to try wllama's WebGPU.
  const init = async prog => {
    w = new Wllama({ default: V + 'wasm/wllama.wasm' });
    await w.loadModelFromUrl(rec.gguf, { n_ctx: rec.n_ctx || 2048, n_gpu_layers: 0, progressCallback: prog });
  };
  await init(({ loaded, total }) => onProgress(loaded / total));
  const chatml = rec.format === 'chatml';
  const stops = chatml ? ['<|im_end|>', '</s>'] : ['###'];
  const hold = Math.max(...stops.map(x => x.length)) - 1; // a stop marker may be split across chunks
  let ctrl, dirty = false;
  // wllama sometimes ends up with a desynchronised worker ("Invalid typed array length" = its "GLUE" header read as a
  // length). The model file is cached, so rebuilding the instance is cheap: do it once and retry.
  const reload = async () => { try { await w.exit(); } catch {} await init(() => {}); dirty = false; };
  return {
    interruptGenerate: () => ctrl?.abort(),
    unload: () => w.exit(),
    chat: { completions: { async create(req) {
      ctrl = new AbortController();
      const start = () => w.createCompletion({
        prompt: chatml ? chatmlPrompt(req.messages, rec.noThink, rec.bos) : basePrompt(req.messages), max_tokens: req.max_tokens,
        temperature: req.temperature, top_p: req.top_p, stop: stops, stream: true, abortSignal: ctrl.signal,
      });
      let stream;
      try {
        if (dirty) await reload();
        stream = await start();
      } catch (e) {
        if (ctrl.signal.aborted) throw e;
        console.warn('wllama failed, rebuilding the instance and retrying once:', e);
        await reload();
        stream = await start();
      }
      return (async function* () {
        let buf = '', sent = 0;
        const out = t => ({ choices: [{ delta: { content: t } }] });
        try {
          for await (const c of stream) {
            buf += c.choices[0]?.text ?? '';
            let i = -1;
            for (const x of stops) { const j = buf.indexOf(x); if (j >= 0 && (i < 0 || j < i)) i = j; }
            const end = i >= 0 ? i : Math.max(sent, buf.length - hold);
            if (end > sent) { yield out(buf.slice(sent, end)); sent = end; }
            if (i >= 0) { ctrl.abort(); return; }
          }
        } catch (e) { if (!ctrl.signal.aborted) { dirty = true; throw e; } } // aborted = user stop / we cut at the marker
        if (sent < buf.length) yield out(buf.slice(sent));
      })();
    } } },
  };
}

// navigator.gpu can exist while requestAdapter() still returns null (hardware acceleration off, blocklisted driver, VM…)
// Hybrid laptops: the preferred dGPU may be blocklisted while the iGPU works (e.g. MX250 D3D11 blocked, Iris D3D12 ok),
// so retry other power preferences and shim requestAdapter so WebLLM (asks "high-performance") gets the working one too.
async function detectGpu() {
  try {
    if (!navigator.gpu) return { ok: false, f16: false, why: `navigator.gpu assente (contesto sicuro: ${isSecureContext}, iframe: ${top !== self})` };
    const orig = navigator.gpu.requestAdapter.bind(navigator.gpu);
    let a = await orig();
    if (!a) for (const powerPreference of ['high-performance', 'low-power']) {
      if ((a = await orig({ powerPreference }))) {
        navigator.gpu.requestAdapter = async o => (await orig(o)) || orig({ powerPreference });
        break;
      }
    }
    return { ok: !!a, f16: !!a?.features.has('shader-f16'), why: 'requestAdapter() = null con tutte le preferenze (default, high-performance, low-power)' };
  } catch (e) { return { ok: false, f16: false, why: `requestAdapter ha lanciato: ${e}` }; }
}

async function initModelPicker() {
  const { ok: gpuOk, f16, why } = await detectGpu();
  const precision = f16 ? 'q4f16' : 'q4f32';
  const all = webllm.prebuiltAppConfig.model_list;

  console.log(`📦 WebLLM: ${all.length} models, GPU adapter: ${gpuOk}, f16: ${f16}`);
  console.groupCollapsed('All models');
  all.forEach(m => console.log(m.model_id));
  console.groupEnd();

  // Filter small, compatible models
  const matched = [];
  const seen = new Set();
  for (const m of all) {
    const id = m.model_id.toLowerCase();
    if (!DESIRED.some(kw => id.includes(kw))) continue;
    if (m.vram_required_MB && m.vram_required_MB > 4000) continue;
    if (!id.includes(precision)) continue;
    const base = m.model_id.replace(/q4f(16|32)_\d/g, 'Q');
    if (seen.has(base)) continue;
    seen.add(base);
    matched.push(m);
  }

  // Fallback: if not enough, add any precision
  if (matched.length < 2) {
    for (const m of all) {
      const id = m.model_id.toLowerCase();
      if (!DESIRED.some(kw => id.includes(kw))) continue;
      if (m.vram_required_MB && m.vram_required_MB > 4000) continue;
      if (!matched.some(x => x.model_id === m.model_id)) matched.push(m);
    }
  }

  // Best-quality-that-fits first (tiny models are a poor default), then by size
  const PREF = ['qwen2.5-1.5b', 'llama-3.2-3b', 'gemma-2-2b', 'llama-3.2-1b', 'qwen2.5-3b'];
  const rank = m => { const i = PREF.findIndex(k => m.model_id.toLowerCase().includes(k)); return i < 0 ? 99 : i; };
  matched.sort((a, b) => rank(a) - rank(b) || (a.vram_required_MB || 500) - (b.vram_required_MB || 500));
  matched.unshift(...customModels.filter(m => !m.gguf)); // yours first → preselected
  matched.push(...COMMUNITY_MLC);                        // community builds last, never the default

  console.log(`✅ ${matched.length} compatible models`);
  matched.forEach(m => console.log(`  ${m.model_id}`));

  // Render picker
  const $picker = $('model-picker');
  $picker.innerHTML = '';

  if (matched.length === 0) {
    $picker.innerHTML = '<div style="color:var(--accent);font-size:13px;padding:16px;">Nessun modello compatibile trovato nel catalogo.</div>';
    return;
  }

  let selectedId = null;
  matched.forEach((m, i) => {
    const label = m.model_id.replace(/-MLC$/i,'').replace(/-q4f\d+_\d+/i,'').replace(/-[Ii]nstruct/,'');
    const prec = m.model_id.includes('q4f16') ? 'f16' : 'f32';
    const custom = customModels.includes(m);
    const vram = [custom && (m.model.startsWith(LOCAL_BASE) ? '★ locale' : '★ personalizzato'), m.community && '★ community · EN/中文', m.vram_required_MB && `~${m.vram_required_MB} MB`].filter(Boolean).join(' · ');

    const btn = document.createElement('button');
    btn.className = 'model-option';
    btn.dataset.modelId = m.model_id;
    btn.innerHTML = `
      <div class="model-radio"></div>
      <div class="model-info">
        <div class="model-name">${label}</div>
        <div class="model-desc">${[vram, prec].filter(Boolean).join(' · ')}</div>
      </div>`;

    btn.onclick = () => {
      document.querySelectorAll('.model-option').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
      selectedId = m.model_id;
      $btnStart.disabled = false;
      window._selectedModelId = selectedId;
    };

    if (custom) btn.oncontextmenu = async e => { // right-click → remove
      e.preventDefault();
      if (!await ask(`Rimuovere il modello "${m.model_id}" dalla lista?`, { ok: 'Rimuovi' })) return;
      customModels = customModels.filter(x => x !== m);
      localStorage.setItem('neo-custom', JSON.stringify(customModels));
      if (m.model.startsWith(LOCAL_BASE)) purgeLocal(m);
      initModelPicker();
    };

    // Auto-select first model
    if (i === 0) {
      btn.classList.add('selected');
      selectedId = m.model_id;
      window._selectedModelId = selectedId;
      $btnStart.disabled = false;
    }

    $picker.appendChild(btn);
  });

  // GGUF section (wllama)
  const grp = document.createElement('div');
  grp.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--ash);padding:10px 4px 0';
  grp.textContent = 'GGUF · wllama (sperimentale, modelli base)';
  $picker.appendChild(grp);
  ggufModels().forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'model-option gguf';
    if (m.format === 'chatml') btn.dataset.chat = '1';
    btn.dataset.modelId = m.model_id;
    btn.innerHTML = `<div class="model-radio"></div><div class="model-info"><div class="model-name">${escHtml(m.model_id)}${m.it ? IT_FLAG : ''}</div>
      <div class="model-desc">GGUF · CPU${m.size ? ` · ~${m.size} MB` : ''}${m.size > 1000 ? ' · ⚠ rischia di non entrare in memoria' : ''}${m.note ? ` · ${escHtml(m.note)}` : ''}</div></div>`;
    btn.onclick = () => {
      document.querySelectorAll('.model-option').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
      window._selectedModelId = m.model_id;
      $btnStart.disabled = false;
    };
    if (customModels.includes(m)) btn.oncontextmenu = async e => { // right-click → remove your own GGUF
      e.preventDefault();
      if (!await ask(`Rimuovere "${m.model_id}" dalla lista?`, { ok: 'Rimuovi' })) return;
      customModels = customModels.filter(x => x !== m);
      localStorage.setItem('neo-custom', JSON.stringify(customModels));
      initModelPicker();
    };
    $picker.appendChild(btn);
  });

  if (!gpuOk) {
    const warn = document.createElement('div');
    warn.style.cssText = 'padding:12px 14px;border:1px solid var(--accent);background:var(--accent-soft);border-radius:var(--r-md);font-size:13px;line-height:1.55;color:var(--ink)';
    warn.innerHTML = '<b>WebGPU non disponibile</b> in questo browser: i modelli WebLLM non partiranno. '
      + 'Usa i modelli <b>GGUF (CPU)</b> qui sotto, oppure attiva l\'accelerazione hardware '
      + '(<code>chrome://settings/system</code>), controlla <code>chrome://gpu</code> e aggiorna i driver della scheda video.'
      + `<br><small>Dettaglio: ${why}</small>`;
    $picker.prepend(warn);
    document.querySelectorAll('.model-option:not(.gguf)').forEach(el => { el.style.opacity = '.5'; });
    // preselect a CPU chat model (an instruct one, not a base model)
    document.querySelector('.model-option.gguf[data-chat="1"]')?.click();
  }
}

initModelPicker();

// ── Load model ────────────────────────────
window.startModel = async function() {
  const modelId = window._selectedModelId;
  if (!modelId) return;

  $btnStart.disabled = true;
  $btnStart.textContent = 'Caricamento…';
  $progressEl.classList.add('active');
  $progressFill.style.width = '0%';
  $('btn-back').style.display = 'none';
  await unloadEngine();

  const gg = ggufModels().find(m => m.model_id === modelId);
  if (gg) return startGguf(gg);

  // Try primary, then opposite precision as fallback
  const toTry = [modelId];
  const alt = modelId.includes('q4f16')
    ? modelId.replace('q4f16', 'q4f32')
    : modelId.replace('q4f32', 'q4f16');
  if (allModels().some(m => m.model_id === alt)) {
    toTry.push(alt);
  }

  for (const tryId of toTry) {
    try {
      $progressText.textContent = tryId === modelId ? 'Download modello…' : 'Provo variante alternativa…';
      const cfg = {
        appConfig: { ...webllm.prebuiltAppConfig, model_list: allModels() },
        initProgressCallback: (r) => {
          const pct = Math.round(r.progress * 100);
          $progressFill.style.width = pct + '%';
          const t = r.text || `${pct}%`;
          $progressText.textContent = t.length > 60 ? t.slice(0, 60) + '…' : t;
        }
      };
      try {
        // Engine runs in a worker (blob module) so the UI never freezes
        worker?.terminate();
        worker = new Worker(URL.createObjectURL(new Blob([
          `import {WebWorkerMLCEngineHandler} from 'https://esm.run/@mlc-ai/web-llm@0.2.85';
           const h = new WebWorkerMLCEngineHandler(); self.onmessage = m => h.onmessage(m);`
        ], { type: 'text/javascript' })), { type: 'module' });
        engine = await webllm.CreateWebWorkerMLCEngine(worker, tryId, cfg);
      } catch (e) {
        // Some browsers/configurations give WebGPU to the page but not to a worker: retry on the main thread
        if (!/compatible GPU/i.test(e?.message || '')) throw e;
        console.warn('WebGPU not available in the worker, retrying on the main thread');
        worker?.terminate(); worker = null;
        engine = await webllm.CreateMLCEngine(tryId, cfg);
      }
      currentModelId = tryId;
      break;
    } catch (err) {
      console.error(`❌ ${tryId}:`, err?.message || err);
      engine = null;
      if (tryId === toTry[toTry.length - 1]) {
        const msg = err?.message || '';
        $progressText.textContent = /compatible GPU/i.test(msg)
          ? 'WebGPU non disponibile: scegli un modello GGUF (CPU) o attiva l\'accelerazione hardware.'
          : 'Errore: ' + msg.slice(0, 80);
        $btnStart.textContent = 'Inizia';
        $btnStart.disabled = false;
        return;
      }
    }
  }

  // Success → switch to chat
  enterChat(currentModelId.replace(/-MLC$/i, '').replace(/-q4f\d+_\d+/i, '').replace(/-[Ii]nstruct/, ''));
};

// Free the current model (GPU/CPU memory) before loading another one
async function unloadEngine() {
  try { await engine?.unload?.(); } catch {}
  engine = null;
  worker?.terminate(); worker = null;
  $statusDot.className = 'dot off';
  $statusLabel.textContent = 'Nessun modello';
  $('status-foot').classList.remove('clickable');
}

// Switch model without losing the conversations: back to the picker, chats stay in the sidebar
window.changeModel = function() {
  if (!engine) return;
  if (isGenerating) { toast('Attendi la fine della risposta (o premi ■) prima di cambiare modello.'); return; }
  $chatView.classList.remove('active');
  $onboard.style.display = '';
  $progressEl.classList.remove('active');
  $btnStart.textContent = 'Inizia';
  $btnStart.disabled = false;
  $('btn-back').style.display = '';
  document.querySelectorAll('.model-option').forEach(el => el.classList.toggle('selected', el.dataset.modelId === currentModelId));
  window._selectedModelId = currentModelId;
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('active');
};

window.backToChat = function() {
  if (!engine) return;
  $onboard.style.display = 'none';
  $chatView.classList.add('active');
  $chatInput.focus();
};

// ── Eject the model / manage downloaded data ──
const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB';

// Free RAM/VRAM now (engine + worker are dropped) and go back to the model picker; chats stay.
window.ejectModel = async function() {
  if (isGenerating) { toast('Attendi la fine della risposta (o premi ■) prima di espellere il modello.'); return; }
  if (!engine) { toast('Nessun modello caricato.'); return; }
  await unloadEngine();
  $chatView.classList.remove('active');
  $onboard.style.display = '';
  $progressEl.classList.remove('active');
  $btnStart.textContent = 'Inizia';
  $btnStart.disabled = false;
  $('btn-back').style.display = 'none';
  $('st-dialog').close();
  toast('Modello espulso: memoria liberata.');
};

// Everything the browser keeps on disk for models: CacheStorage (WebLLM + imported folders) and OPFS (wllama GGUF)
async function storageItems() {
  const items = [];
  const groups = new Map();
  for (const scope of CACHE_SCOPES) {
    if (!(await caches.has(scope))) continue;
    const c = await caches.open(scope);
    for (const req of await c.keys()) {
      const key = req.url.includes('/resolve/') ? req.url.split('/resolve/')[0] : req.url;
      const g = groups.get(key) ?? { size: 0, reqs: [] };
      const len = +((await c.match(req))?.headers.get('content-length') || 0);
      g.size += len; g.reqs.push([scope, req]); groups.set(key, g);
    }
  }
  for (const [key, g] of groups) {
    const label = key.startsWith(LOCAL_BASE) ? 'locale: ' + decodeURIComponent(key.slice(LOCAL_BASE.length))
      : key.replace('https://huggingface.co/', '').replace(/^https:\/\/raw\.githubusercontent\.com\/.*\//, 'libreria ');
    items.push({ label, size: g.size, del: async () => {
      for (const [scope, req] of g.reqs) await (await caches.open(scope)).delete(req);
      if (key.startsWith(LOCAL_BASE)) { // an imported folder is gone: drop its entry from the model list too
        customModels = customModels.filter(m => !m.model?.startsWith(key));
        localStorage.setItem('neo-custom', JSON.stringify(customModels));
      }
    } });
  }
  try {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('cache');
    const names = [];
    for await (const [name] of d.entries()) names.push(name);
    for (const name of names.filter(n => n.endsWith('.gguf'))) {
      const f = await (await d.getFileHandle(name)).getFile();
      const hash = name.slice(0, 40);
      items.push({ label: 'GGUF ' + name.replace(/^[0-9a-f]{40}_/, ''), size: f.size,
        del: async () => { for (const n of names.filter(n => n.includes(hash))) await d.removeEntry(n); } });
    }
  } catch {} // no OPFS / no wllama cache yet
  return items.sort((a, b) => b.size - a.size);
}

async function renderStorage() {
  const list = $('st-list');
  list.textContent = 'Controllo…';
  const [items, est] = await Promise.all([storageItems(), navigator.storage?.estimate?.() ?? {}]);
  $('st-summary').textContent = est.usage != null
    ? `Usati dal sito: ${fmtSize(est.usage)} su ${fmtSize(est.quota)} disponibili. Il modello caricato occupa anche RAM/GPU: usa ⏏ per liberarla.`
    : 'Modelli scaricati nel browser. Il modello caricato occupa anche RAM/GPU: usa ⏏ per liberarla.';
  list.innerHTML = '';
  if (!items.length) list.textContent = 'Nessun modello in cache.';
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'st-row';
    row.innerHTML = '<span class="nm"></span><span class="sz"></span><button title="Elimina dal disco">✕</button>';
    row.querySelector('.nm').textContent = it.label;
    row.querySelector('.sz').textContent = it.size ? fmtSize(it.size) : '';
    row.querySelector('button').onclick = async () => { await it.del(); await renderStorage(); initModelPicker(); };
    list.appendChild(row);
  }
  $('st-eject').disabled = !engine;
}

window.openStorage = async function() {
  $('st-dialog').showModal();
  await renderStorage();
};

window.clearAllStorage = async function() {
  if (!await ask('Eliminare tutti i modelli scaricati dal browser? Dovrai riscaricarli per usarli di nuovo. Le chat restano.')) return;
  if (engine) await ejectModel();
  for (const scope of CACHE_SCOPES) await caches.delete(scope);
  try { await (await navigator.storage.getDirectory()).removeEntry('cache', { recursive: true }); } catch {}
  customModels = customModels.filter(m => !m.model?.startsWith(LOCAL_BASE));
  localStorage.setItem('neo-custom', JSON.stringify(customModels));
  await renderStorage();
  initModelPicker();
  toast('Cache dei modelli svuotata.');
};

async function startGguf(rec) {
  try {
    $progressText.textContent = 'Carico wllama…';
    engine = await loadGguf(rec, p => {
      $progressFill.style.width = Math.round(p * 100) + '%';
      $progressText.textContent = `Download ${Math.round(p * 100)}%`;
    });
    currentModelId = rec.model_id;
  } catch (err) {
    console.error('❌ ' + rec.model_id, err);
    engine = null;
    $progressText.textContent = 'Errore: ' + String(err?.message || err).slice(0, 80);
    $btnStart.textContent = 'Inizia';
    $btnStart.disabled = false;
    return;
  }
  enterChat(rec.model_id);
}

function enterChat(name) {
  $statusDot.className = 'dot on';
  $statusLabel.textContent = name;
  $onboard.style.display = 'none';
  $chatView.classList.add('active');
  $chatInput.focus();
  $('status-foot').classList.add('clickable');
  if (getActiveConv()) renderMessages();          // switched model mid-chat: keep the conversation
  else if (conversations.length) switchConv(conversations[0].id);
  else newConversation();
}

// ── Conversations ─────────────────────────
window.newConversation = function() {
  const conv = {
    id: Date.now().toString(36),
    title: 'Nuova chat',
    agentId: curAgentId,
    messages: [],
  };
  conversations.unshift(conv);
  activeConvId = conv.id;
  renderConvList();
  $chatInner.innerHTML = '';
};

function getActiveConv() {
  return conversations.find(c => c.id === activeConvId);
}

function renderConvList() {
  saveConvs();
  $convEmpty.style.display = conversations.length ? 'none' : 'block';
  $convList.querySelectorAll('.conv-row').forEach(el => el.remove());

  conversations.forEach(c => {
    const row = document.createElement('div');
    row.className = 'conv-row';
    const btn = document.createElement('button');
    btn.className = 'conv-item' + (c.id === activeConvId ? ' active' : '');
    btn.innerHTML = `<span class="conv-dot"></span><span class="conv-label">${escHtml(c.title)}${c.topic ? `<small>${escHtml(c.topic)}</small>` : ''}</span>`;
    btn.onclick = () => switchConv(c.id);
    const del = document.createElement('button');
    del.className = 'conv-del';
    del.textContent = '✕';
    del.title = 'Elimina chat';
    del.setAttribute('aria-label', 'Elimina chat');
    del.onclick = () => deleteConv(c.id);
    row.append(btn, del);
    $convList.insertBefore(row, $convEmpty);
  });
}

async function deleteConv(id) {
  const c = conversations.find(x => x.id === id);
  if (!c || (isGenerating && id === activeConvId)) return; // don't pull the chat out from under a running reply
  if (!await ask(`Eliminare la chat "${c.title}"?`)) return;
  conversations = conversations.filter(x => x.id !== id);
  if (id === activeConvId) {
    activeConvId = null;
    if (conversations.length) switchConv(conversations[0].id);
    else if (engine) newConversation();
    else { $chatInner.innerHTML = ''; renderConvList(); }
  } else renderConvList();
  saveConvs(); // renderConvList saves too, but an emptied list must be persisted as well
}

function switchConv(id) {
  activeConvId = id;
  curAgentId = getActiveConv().agentId;
  renderAgents();
  renderConvList();
  renderMessages();
  // Close sidebar on mobile
  if (window.innerWidth <= 720) {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('active');
  }
}

function renderMessages() {
  const conv = getActiveConv();
  $chatInner.innerHTML = '';
  if (!conv) return;
  conv.messages.forEach(m => {
    if (m.role === 'user' || m.role === 'assistant') {
      appendMsgEl(m.role, m.shown ?? m.content, m.opLabel);
    }
  });
  scrollBottom();
}

// ── Chat ──────────────────────────────────
window.sendMessage = async function() {
  // files attached with no question → default request
  const text = $chatInput.value.trim() || (pending.some(f => f.text) ? 'Riassumi il contenuto.' : '');
  if (!text || isGenerating || !engine) return;

  const conv = getActiveConv();
  if (!conv) return;

  // Compose context blocks: attached files + web sources
  const blocks = [], labels = [];
  let shown = text;
  const files = pending.filter(f => f.text);
  if (files.length) {
    const per = Math.floor(5000 / files.length);
    blocks.push(files.map(f => `File "${f.name}":\n${pickChunks(f.text, text, per)}`).join('\n\n'));
    shown += '\n\n📎 ' + files.map(f => f.name).join(', ');
    labels.push('📎 File');
  }
  if (webOn) {
    isGenerating = true; // blocks double-send while searching
    $btnSend.disabled = true;
    try {
      const w = await webContext(text);
      if (w) { blocks.push(w.block); shown += '\n\nFonti:\n' + w.list; labels.push('🌐 Web'); }
    } catch (err) {
      appendMsgEl('assistant', 'Ricerca web non eseguita (query non inviata): ' + (err?.message || err));
      return;
    } finally {
      isGenerating = false;
      $btnSend.disabled = false;
    }
  }
  const msg = blocks.length
    ? { role: 'user', shown, opLabel: labels.join(' · '),
        content: `${blocks.join('\n\n')}\n\n---\nDomanda: ${text}\nRispondi usando solo il materiale sopra${webOn ? ' e cita le fonti web con [n]' : ''}. Se non basta, dillo.` }
    : { role: 'user', content: text };
  conv.messages.push(msg);
  appendMsgEl('user', msg.shown ?? text, msg.opLabel);
  pending = [];
  renderChips();
  tagConv(conv, text);

  // Auto-title from first message
  if (conv.title === 'Nuova chat') {
    conv.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    renderConvList();
  }

  $chatInput.value = '';
  autoResize();
  await generate(conv);
};

window.runOp = function(opKey) {
  const text = $chatInput.value.trim();
  if (!text || isGenerating || !engine) return;

  $cmdPopover.classList.remove('open');

  const conv = getActiveConv();
  if (!conv) return;

  const [label, action, param, , , maxTok] = OPS[opKey];
  const prompt = buildPrompt(action, param, text);

  conv.messages.push({ role: 'user', content: prompt, shown: text, opLabel: label });
  appendMsgEl('user', text, label);

  if (conv.title === 'Nuova chat') {
    conv.title = label + ': ' + text.slice(0, 30);
    renderConvList();
  }

  tagConv(conv, text);
  $chatInput.value = '';
  autoResize();
  generate(conv, { maxTok });
};

// op = text operation: fixed training SYSTEM + only the op prompt, low temperature, per-action token cap
async function generate(conv, op = null) {
  const stateless = !!op;
  // Stop must work at any moment: before the first token (prefill / queued behind the previous reply) too.
  // So the UI does not wait for the engine: every await below is raced against stopP.
  const STOP = Symbol('stop');
  let stopped = false;
  const stopP = new Promise(res => { currentStop = () => { stopped = true; res(STOP); }; });
  genId++;
  isGenerating = true;
  $btnSend.style.display = 'none';
  $btnStop.style.display = 'flex';
  $chatInput.disabled = true;

  const msgEl = appendMsgEl('assistant', '', null, true);
  const bodyEl = msgEl.querySelector('.msg-body');

  try {
    // Build messages for API (strip opLabel)
    const ag = getAgent(conv.agentId);
    const sys = stateless ? SYSTEM : ag.prompt.trim();
    const hist = stateless ? conv.messages.slice(-1) : trimHistory(conv.messages);
    const apiMsgs = [
      ...(sys ? [{ role: 'system', content: sys }] : []),
      ...hist.map(m => ({ role: m.role, content: m.content })),
    ];

    const started = engine.chat.completions.create({
      messages: apiMsgs,
      stream: true,
      // text operations: fixed low temperature (as in the fine-tune eval); chat: agent override > model default > 0.5/0.9
      temperature: stateless ? 0.3 : (ag.temperature ?? curRec()?.sampling?.temperature ?? 0.5),
      top_p: ag.top_p ?? curRec()?.sampling?.top_p ?? 0.9,
      frequency_penalty: 0.3,
      max_tokens: op ? op.maxTok : (ag.max_tokens ?? 512),
      ...(noThink() ? { extra_body: { enable_thinking: false } } : {}), // MiniCPM5: no <think> block
    });
    started.catch(() => {}); // if stop wins the race, a later rejection must not surface
    const reply = await Promise.race([started, stopP]);

    let full = '';
    if (reply !== STOP) {
      const it = reply[Symbol.asyncIterator]();
      for (;;) {
        const r = await Promise.race([it.next(), stopP]);
        if (r === STOP || r.done) break;
        full += r.value.choices[0]?.delta?.content || '';
        bodyEl.innerHTML = fmtMsg(full);
        scrollBottom();
      }
      if (stopped) Promise.resolve(it.return?.()).catch(() => {});
    }

    if (!full && stopped) {
      msgEl.remove();                    // stopped before any text: nothing to keep
    } else {
      conv.messages.push({ role: 'assistant', content: full });
      const t = msgEl.querySelector('.typing');
      if (t) t.remove();
      bodyEl.innerHTML = fmtMsg(full);
      addCopyBtn(msgEl, full);
    }

  } catch (err) {
    const m = String(err?.message || err);
    bodyEl.textContent = /typed array|out of memory|memory access|allocation/i.test(m)
      ? 'Errore: memoria WebAssembly esaurita o motore in stato errato (' + m + '). Il modello GGUF potrebbe essere troppo grande per il browser (oltre ~1 GB è rischioso): prova un modello più piccolo, per esempio MiniCPM5-1B o Minerva-350M.'
      : 'Errore: ' + m;
  } finally {
    currentStop = null;
    isGenerating = false;
    saveConvs();
    $btnStop.style.display = 'none';
    $btnSend.style.display = '';
    $chatInput.disabled = false;
    $chatInput.focus();
  }
}

window.stopGen = function() {
  currentStop?.();                       // UI is freed right away
  // WebLLM drops an interrupt that arrives before decoding starts, so repeat it for a while.
  // It stops as soon as a newer generation begins, so it can never cancel the next reply.
  const gid = genId;
  let n = 0;
  engine?.interruptGenerate?.();
  const t = setInterval(() => {
    if (genId !== gid || ++n > 20) return clearInterval(t);
    engine?.interruptGenerate?.();
  }, 500);
};

// ── DOM helpers ───────────────────────────
function appendMsgEl(role, text, opLabel, streaming) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  let html = `<div class="msg-role">${role === 'user' ? 'Tu' : 'Neo'}</div>`;
  if (opLabel) html += `<div class="msg-op-badge">${escHtml(opLabel)}</div>`;
  html += '<div class="msg-body">';
  if (streaming) html += '<div class="typing"><span></span><span></span><span></span></div>';
  else html += fmtMsg(text);
  html += '</div>';

  el.innerHTML = html;
  $chatInner.appendChild(el);

  if (!streaming && role === 'user') addCopyBtn(el, text);

  scrollBottom();
  return el;
}

function addCopyBtn(msgEl, text) {
  const div = document.createElement('div');
  div.className = 'msg-actions';
  const btn = document.createElement('button');
  btn.className = 'btn-copy-msg';
  btn.textContent = 'Copia';
  btn.onclick = () => {
    navigator.clipboard.writeText(text);
    btn.textContent = 'Copiato';
    setTimeout(() => btn.textContent = 'Copia', 1200);
  };
  div.appendChild(btn);
  msgEl.appendChild(div);
}


function scrollBottom() {
  requestAnimationFrame(() => {
    const el = $('chat-messages');
    el.scrollTop = el.scrollHeight;
  });
}

// ── Input ─────────────────────────────────
$chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!isGenerating && engine) sendMessage();
  }
});

$chatInput.addEventListener('input', autoResize);

function autoResize() {
  $chatInput.style.height = 'auto';
  $chatInput.style.height = Math.min($chatInput.scrollHeight, 140) + 'px';
}

// ── Commands popover ──────────────────────
$cmdPopover.innerHTML = '<div class="cmd-popover-title">Operazioni sul testo</div>' + Object.entries(OPS).map(([k, o]) =>
  `<button class="cmd-item" onclick="runOp('${k}')"><span class="cmd-icon">${o[3]}</span><div><div class="cmd-label">${o[0]}</div><div class="cmd-desc">${o[4]}</div></div></button>`).join('');
window.toggleCommands = function() {
  $cmdPopover.classList.toggle('open');
};

// Close popover on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.cmd-popover') && !e.target.closest('.cmd-trigger')) {
    $cmdPopover.classList.remove('open');
  }
});

// ── Sidebar toggle ────────────────────────
window.toggleSidebar = function() {
  $('sidebar').classList.toggle('open');
  $('sidebar-overlay').classList.toggle('active');
};

$('sidebar-overlay').addEventListener('click', () => {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('active');
});

// ── Init ──────────────────────────────────
renderAgents();
renderConvList();
console.log('%cNeo', 'font-size:20px;font-weight:600;color:#1a1814;');
console.log('%cAI nel browser · WebGPU + WebLLM', 'color:#9e9a8f;');
