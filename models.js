// Recommended sampling per model family (values from mlc-ai/web-llm-chat app/constant.ts).
const FAMILIES = [
  ['qwen', { temperature: 0.7, top_p: 0.8 }],
  ['llama', { temperature: 0.6, top_p: 0.9 }],
  ['phi', { temperature: 0.7, top_p: 0.95 }],
  ['gemma', { temperature: 0.7, top_p: 0.95 }],
  ['mistral', { temperature: 0.7, top_p: 0.95 }],
  ['tinyllama', { temperature: 0.7, top_p: 0.95 }],
  ['smollm', { temperature: 1, top_p: 1 }],
  ['deepseek', { temperature: 1, top_p: 1 }],
];
export const THINK_SAMPLING = { temperature: 0.6, top_p: 0.95 }; // Qwen3 thinking mode

export const isQwen3 = id => /qwen3/i.test(id || '');

export function samplingFor(id) {
  const l = (id || '').toLowerCase();
  return FAMILIES.find(([k]) => l.includes(k))?.[1];
}

// Remote engine: same surface app.js uses on WebLLM (chat.completions.create stream, interruptGenerate, unload),
// talking to any OpenAI-compatible endpoint (Ollama /v1, vLLM, LM Studio, OpenRouter…).
export const chatUrl = u => { u = u.trim().replace(/\/+$/, ''); return /\/chat\/completions$/.test(u) ? u : u.replace(/\/v1$/, '') + '/v1/chat/completions'; };

export function remoteEngine({ url, key, model }, fetchFn = fetch) {
  let ctl = null;
  async function* stream(res) { // SSE: "data: {json}" lines, "data: [DONE]" ends
    const rd = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        const d = l.startsWith('data:') ? l.slice(5).trim() : '';
        if (d === '[DONE]') return;
        if (d) yield JSON.parse(d);
      }
    }
  }
  return {
    chat: { completions: { async create({ extra_body, ...body }) {
      ctl = new AbortController();
      const res = await fetchFn(chatUrl(url), {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify({ ...body, model }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      return stream(res);
    } } },
    interruptGenerate: () => ctl?.abort(),
    unload: () => ctl?.abort(),
  };
}

// Qwen3 thinking: drop closed <think> blocks and an unclosed one still streaming
export const stripThink = t => t.replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/<think>[\s\S]*$/, '');
