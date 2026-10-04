import assert from 'node:assert/strict';
import { samplingFor, stripThink, isQwen3 } from '../models.js';

assert.deepEqual(samplingFor('Qwen3-1.7B-q4f16_1-MLC'), { temperature: 0.7, top_p: 0.8 });
assert.deepEqual(samplingFor('Llama-3.2-1B-Instruct-q4f16_1-MLC'), { temperature: 0.6, top_p: 0.9 });
assert.equal(samplingFor('Minerva-1B-base-Q4_K_M'), undefined);
assert.ok(isQwen3('Qwen3-0.6B-q4f16_1-MLC') && !isQwen3('Qwen2.5-1.5B-Instruct-q4f16_1-MLC'));
assert.equal(stripThink('<think>hmm</think>\n\nCiao'), 'Ciao');
assert.equal(stripThink('<think>still thinking'), '');
assert.equal(stripThink('no think'), 'no think');
console.log('models.mjs ok');
