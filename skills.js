// ── Skills: a SKILL.md (Claude / Vercel "skills" format) becomes an agent ──
// Accepts a GitHub URL (blob/tree/repo), a raw URL, or "owner/repo[/path]".
const RAW = 'https://raw.githubusercontent.com';
const mdPath = p => (/\.md$/i.test(p) ? p : (p ? p.replace(/\/$/, '') + '/' : '') + 'SKILL.md');

export function skillUrls(input) {
  const s = input.trim().replace(/[?#].*$/, '');
  let m;
  if ((m = s.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|tree)\/([^/]+)\/?(.*)$/)))
    return [`${RAW}/${m[1]}/${m[2]}/${m[3]}/${mdPath(m[4])}`];
  if (/^https?:\/\//.test(s) && !/^https:\/\/github\.com\//.test(s)) return [/\.md$/i.test(s) ? s : s.replace(/\/$/, '') + '/SKILL.md'];
  if ((m = s.replace(/^https:\/\/github\.com\//, '').match(/^([\w.-]+)\/([\w.-]+)\/?(.*)$/)))
    return ['main', 'master'].map(ref => `${RAW}/${m[1]}/${m[2].replace(/\.git$/, '')}/${ref}/${mdPath(m[3])}`);
  return [];
}

export function parseSkill(md) {
  const m = md.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta = {};
  for (const l of (m ? m[1] : '').split(/\r?\n/)) {
    const kv = l.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { name: meta.name || '', description: meta.description || '', prompt: (m ? m[2] : md).trim() };
}
