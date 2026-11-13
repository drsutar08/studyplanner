// Turns docs/privacy-policy.md, docs/terms-of-use.md and docs/delete-account.md into public/privacy.html, terms.html and
// delete-account.html: plain pages to
// host anywhere (the web build serves public/ as is). Their addresses go in app.json -> expo.extra.legal and in the
// store listings.   node scripts/build-legal-pages.mjs
import fs from 'node:fs';

const PAGES = [
  { md: 'delete-account.md', out: 'delete-account.html', other: ['', 'privacy.html', 'Privacy policy'] },
  { md: 'privacy-policy.md', out: 'privacy.html', other: ['privacy-policy.md', 'terms.html', 'Terms of use'] },
  { md: 'terms-of-use.md', out: 'terms.html', other: ['terms-of-use.md', 'privacy.html', 'Privacy policy'] },
];
const LINKS = { 'privacy-policy.md': 'privacy.html', 'terms-of-use.md': 'terms.html', 'delete-account.md': 'delete-account.html' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const inline = (raw) => {
  const codes = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => `<a href="${LINKS[href] || href}">${text}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[i]);
};

function convert(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const html = [];
  let title = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('>')) { while (i < lines.length && lines[i].startsWith('>')) i++; continue; } // notes for the owner, not for readers
    const h = line.match(/^(#{1,3}) (.+)/);
    if (h) {
      const n = h[1].length;
      if (n === 1) title = h[2];
      html.push(`<h${n} id="${slug(h[2])}">${inline(h[2])}</h${n}>`);
      i++; continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [head, , ...body] = rows;
      html.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && (/^- /.test(lines[i]) || /^ {2,}\S/.test(lines[i]))) {
        if (/^- /.test(lines[i])) items.push(lines[i].slice(2));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      html.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      html.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||> |- |\d+\. )/.test(lines[i])) para.push(lines[i++].trim());
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { title, body: html.join('\n') };
}

const page = ({ title, body }, other) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(title)} for the Studyly app.">
<style>
  :root { --bg:#ffffff; --ink:#1b1f3b; --muted:#555b7a; --line:#dfe2f0; --accent:#3b4cca; --soft:#f4f5fb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12142a; --ink:#eceefb; --muted:#a6abc9; --line:#2c3052; --accent:#9aa6ff; --soft:#1b1e3a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:760px; margin:0 auto; padding:24px 16px 64px; }
  nav { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; padding-bottom:12px; border-bottom:1px solid var(--line); font-size:14px; }
  nav strong { color:var(--ink); }
  a { color:var(--accent); }
  h1 { font-size:28px; line-height:1.25; margin:24px 0 4px; letter-spacing:-.3px; }
  h2 { font-size:20px; margin:32px 0 8px; }
  p, li { color:var(--ink); }
  em { color:var(--muted); }
  ul, ol { padding-left:22px; }
  li { margin:6px 0; }
  code { background:var(--soft); padding:1px 5px; border-radius:5px; font-size:.9em; }
  .table { overflow-x:auto; border:1px solid var(--line); border-radius:12px; margin:16px 0; }
  table { border-collapse:collapse; width:100%; min-width:560px; font-size:14.5px; }
  th, td { text-align:left; vertical-align:top; padding:10px 12px; border-top:1px solid var(--line); }
  thead th { background:var(--soft); border-top:0; }
  footer { margin-top:40px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:14px; }
</style>
</head>
<body>
<main>
<nav><strong>Studyly</strong><a href="${other[1]}">${other[2]}</a></nav>
${body}
<footer><a href="${other[1]}">${other[2]}</a></footer>
</main>
</body>
</html>
`;

for (const { md, out, other } of PAGES) {
  const doc = convert(fs.readFileSync(new URL(`../docs/${md}`, import.meta.url), 'utf8'));
  fs.writeFileSync(new URL(`../public/${out}`, import.meta.url), page(doc, other));
  console.log(`public/${out}: ${doc.title}`);
}
