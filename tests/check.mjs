// Statik denetimler:
//  1) Tüm JS dosyaları `node --check` ile sözdizimi hatasız mı?
//  2) Göreli importlar var olan dosyalara, BİREBİR aynı büyük/küçük harfle mi işaret ediyor?
//  3) index.html / css içindeki yollar göreli mi (/ ile başlayan mutlak yol yok)?
//  4) app.js'teki oyun listesi games/ klasörüyle birebir mi, meta id'leri benzersiz mi?
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Yolun her parçasının diskte birebir aynı harflerle bulunduğunu doğrular. */
function existsExactCase(absPath) {
  const rel = relative(ROOT, absPath);
  if (rel.startsWith('..')) return false;
  let cur = ROOT;
  for (const part of rel.split(/[\\/]/)) {
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      return false;
    }
    if (!entries.includes(part)) return false;
    cur = join(cur, part);
  }
  return true;
}

const files = walk(ROOT);
const jsFiles = files.filter((f) => /\.(m?js)$/.test(f));

console.log(`Sözdizimi (${jsFiles.length} dosya)`);
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    fail(`${relative(ROOT, f)}: ${String(err.stderr || err.message).trim().split('\n').slice(0, 4).join(' | ')}`);
  }
}

console.log('Import yolları (büyük/küçük harf birebir)');
const importRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
for (const f of jsFiles.filter((f) => f.includes(`${join(ROOT, 'js')}`))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(importRe)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec.startsWith('.')) {
      fail(`${relative(ROOT, f)}: göreli olmayan import "${spec}"`);
      continue;
    }
    if (!spec.endsWith('.js')) fail(`${relative(ROOT, f)}: uzantısız import "${spec}"`);
    const target = resolve(dirname(f), spec);
    if (!existsExactCase(target)) fail(`${relative(ROOT, f)}: "${spec}" bulunamadı ya da harf uyuşmuyor`);
  }
}

console.log('HTML/CSS yolları');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = m[1];
  if (url.startsWith('data:') || url.startsWith('#')) continue;
  if (/^(https?:)?\/\//.test(url)) fail(`index.html: harici kaynak "${url}"`);
  else if (url.startsWith('/')) fail(`index.html: mutlak yol "${url}"`);
  else if (!existsExactCase(resolve(ROOT, url))) fail(`index.html: "${url}" bulunamadı ya da harf uyuşmuyor`);
}
const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
if (/url\(|@import/.test(css)) fail('style.css: harici kaynak/url() kullanılmamalı');
if (!existsExactCase(join(ROOT, '.nojekyll'))) fail('.nojekyll eksik');

console.log('Oyun kaydı');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const imported = [...appSrc.matchAll(/from\s+'\.\/games\/([^']+)\.js'/g)].map((m) => m[1]);
const onDisk = readdirSync(join(ROOT, 'js', 'games')).filter((n) => n.endsWith('.js')).map((n) => n.slice(0, -3));
for (const name of onDisk) if (!imported.includes(name)) fail(`games/${name}.js app.js'te kayıtlı değil`);
const ids = new Set();
for (const name of imported) {
  const mod = await import(new URL(`../js/games/${name}.js`, import.meta.url));
  const Game = mod[name];
  if (!Game) {
    fail(`games/${name}.js "${name}" adında bir export içermiyor`);
    continue;
  }
  const meta = Game.meta || {};
  for (const key of ['id', 'title', 'width', 'height', 'controls', 'description']) {
    if (meta[key] === undefined || meta[key] === '') fail(`${name}.meta.${key} eksik`);
  }
  if (!Object.prototype.hasOwnProperty.call(Game, 'meta')) fail(`${name} kendi static meta'sını tanımlamıyor`);
  if (ids.has(meta.id)) fail(`yinelenen meta.id "${meta.id}"`);
  ids.add(meta.id);
  const src = readFileSync(join(ROOT, 'js', 'games', `${name}.js`), 'utf8');
  if (/addEventListener|setTimeout|setInterval|requestAnimationFrame/.test(src)) {
    fail(`${name}: oyunlar listener/zamanlayıcı eklememeli (Input ve dt kullanılmalı)`);
  }
}
console.log(`  ${imported.length} oyun: ${[...ids].join(', ')}`);

if (failures) {
  console.error(`\n${failures} hata`);
  process.exit(1);
}
console.log('\nTüm statik denetimler geçti ✓');
