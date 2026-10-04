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

// Qwen3 thinking: drop closed <think> blocks and an unclosed one still streaming
export const stripThink = t => t.replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/<think>[\s\S]*$/, '');
