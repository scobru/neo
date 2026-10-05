import assert from 'node:assert/strict';
import { samplingFor, stripThink, isQwen3, chatUrl, remoteEngine } from '../models.js';

assert.deepEqual(samplingFor('Qwen3-1.7B-q4f16_1-MLC'), { temperature: 0.7, top_p: 0.8 });
assert.deepEqual(samplingFor('Llama-3.2-1B-Instruct-q4f16_1-MLC'), { temperature: 0.6, top_p: 0.9 });
assert.equal(samplingFor('Foo-1B-Instruct'), undefined);
assert.ok(isQwen3('Qwen3-0.6B-q4f16_1-MLC') && !isQwen3('Qwen2.5-1.5B-Instruct-q4f16_1-MLC'));
assert.equal(stripThink('<think>hmm</think>\n\nCiao'), 'Ciao');
assert.equal(stripThink('<think>still thinking'), '');
assert.equal(stripThink('no think'), 'no think');
assert.equal(chatUrl('http://h:11434'), 'http://h:11434/v1/chat/completions');
assert.equal(chatUrl('https://x.io/v1/'), 'https://x.io/v1/chat/completions');
assert.equal(chatUrl('https://x.io/v1/chat/completions'), 'https://x.io/v1/chat/completions');

let seen;
const sse = 'data: {"choices":[{"delta":{"content":"Ci"}}]}\n\ndata: {"choices":[{"delta":{"content":"ao"}}]}\n\ndata: [DONE]\n\n';
const eng = remoteEngine({ url: 'http://h', key: 'k', model: 'm' }, async (u, o) => {
  seen = { u, o };
  return { ok: true, body: new Response(sse).body };
});
let out = '';
for await (const c of await eng.chat.completions.create({ messages: [], stream: true, extra_body: { x: 1 } })) out += c.choices[0].delta.content;
assert.equal(out, 'Ciao');
assert.equal(seen.o.headers.Authorization, 'Bearer k');
assert.deepEqual(JSON.parse(seen.o.body), { messages: [], stream: true, model: 'm' });
console.log('models.mjs ok');
