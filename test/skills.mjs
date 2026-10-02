// Unit check for skills.js. Usage: node test/skills.mjs
import assert from 'node:assert/strict';
import { skillUrls, parseSkill } from '../skills.js';
const R = 'https://raw.githubusercontent.com';
assert.deepEqual(skillUrls('vercel-labs/agent-skills/skills/react-best-practices'),
  [`${R}/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md`, `${R}/vercel-labs/agent-skills/master/skills/react-best-practices/SKILL.md`]);
assert.deepEqual(skillUrls('https://github.com/o/r/tree/dev/skills/x/'), [`${R}/o/r/dev/skills/x/SKILL.md`]);
assert.deepEqual(skillUrls('https://github.com/o/r/blob/main/a/SKILL.md?plain=1'), [`${R}/o/r/main/a/SKILL.md`]);
assert.deepEqual(skillUrls('https://github.com/o/r.git')[0], `${R}/o/r/main/SKILL.md`);
assert.deepEqual(skillUrls(`${R}/o/r/main/x/SKILL.md`), [`${R}/o/r/main/x/SKILL.md`]);
assert.deepEqual(skillUrls('boh'), []);
const s = parseSkill('---\nname: demo\ndescription: "Fa cose"\n---\n# Titolo\ncorpo\n');
assert.deepEqual(s, { name: 'demo', description: 'Fa cose', prompt: '# Titolo\ncorpo' });
assert.deepEqual(parseSkill('solo testo'), { name: '', description: '', prompt: 'solo testo' });
console.log('ok skills');
