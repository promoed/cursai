// Картинки для соцсетей (Open Graph, 1200×630) для каждой индексируемой страницы: главная, направления,
// «О нас», блог, рубрики и статьи. Запуск: node scripts/og.mjs (нужен Playwright с Chromium).
// Результат — images/og/*.png; сборка (scripts/build.mjs) сама подставит картинку в og:image, если файл есть.
// Перезапускайте после изменения заголовков страниц, статей или обложек курсов.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { criteria, directionsB, courses, coursesB } from '../src/courses.mjs';
import { blog, posts, rubrics } from '../src/blog.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('../', import.meta.url);

// Номер обложки курса = номер курса (courses 1..10, coursesB 11..)
const all = courses.concat(coursesB).map((c, i) => ({ ...c, n: i + 1, total: criteria.reduce((s, k) => s + c.scores[k.key] * k.weight, 0) }));
const top = (pred) => all.filter(pred).sort((a, b) => b.total - a.total).slice(0, 2).map((c) => c.n);
const inDir = (d) => (c) => !d.tags || c.tags.some((t) => d.tags.includes(t));
const rubricArt = { 'vybor-kursa': [1, 6], 'ii-agenty': [21, 5], professii: [7, 16], 'nejroseti-dlya-raboty': [9, 8] };

const pages = [
  { key: 'home', kicker: 'Рейтинг курсов', title: 'Рейтинг курсов по нейросетям', art: top(() => true) },
  ...directionsB.filter((d) => d.slug).map((d) => ({ key: `dir-${d.key}`, kicker: `Направление · ${d.label.replace(/\u00a0/g, ' ')}`, title: `Рейтинг ${d.heading}`, art: top(inDir(d)) })),
  { key: 'about', kicker: 'О проекте', title: 'Выбор курса по ИИ без долгих поисков', art: [3, 1] },
  { key: 'blog', kicker: 'Блог', title: blog.title, art: [1, 21] },
  ...rubrics.map((r) => ({ key: `rubric-${r.slug}`, kicker: 'Блог · рубрика', title: r.name, art: rubricArt[r.slug] || [1, 2] })),
  ...posts.map((p) => ({ key: `post-${p.slug}`, kicker: `Блог · ${(rubrics.find((r) => r.slug === p.rubric) || {}).name || ''}`, title: p.title, art: rubricArt[p.rubric] || [1, 2] })),
];

const types = { '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(new URL('.' + decodeURIComponent(req.url), root));
    res.writeHead(200, { 'content-type': types[extname(req.url)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const logo = (await readFile(new URL('src/logo.svg', root), 'utf8')).replace('<svg ', '<svg class="lg" ');
const html = (p) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:D;src:url(${base}/src/fonts/dela-gothic-one-subset.woff2)}
@font-face{font-family:O;src:url(${base}/src/fonts/onest-subset.woff2)}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#212121;color:#f3f2ee;font-family:O;position:relative;overflow:hidden}
.brand{position:absolute;left:72px;top:60px;display:flex;align-items:center;gap:14px;font:700 32px O}
.dot{width:34px;height:34px;border-radius:50%;background:conic-gradient(#ffd23f 0 25%,#ff7a59 0 50%,#9c8cff 0 75%,#3dd6a0 0)}
.lg{height:34px;width:auto;color:#f3f2ee}.brand small{margin-left:6px;padding-left:16px;border-left:2px solid #444;font:500 24px O;color:#9d9b94}
.k{position:absolute;left:74px;top:178px;font:600 26px O;color:#ffd23f}
.t{position:absolute;left:72px;top:222px;width:640px;font:400 ${p.title.length > 48 ? 46 : p.title.length > 32 ? 54 : 64}px/1.08 D;letter-spacing:-1px}
.u{position:absolute;left:74px;bottom:58px;font:500 26px O;color:#9d9b94}
.c{position:absolute;width:330px;height:410px;border-radius:30px;overflow:hidden;box-shadow:0 30px 60px -30px #000,0 0 0 4px #212121}
.c img{width:100%;height:100%;display:block}
.c1{right:150px;top:150px;transform:rotate(-5deg);z-index:2}
.c2{right:40px;top:96px;transform:rotate(8deg) scale(.92)}
</style></head><body>
<div class="brand">${logo}<small>рейтинг курсов по ИИ</small></div>
<div class="k">${p.kicker}</div><div class="t">${p.title}</div><div class="u">cursai.ru</div>
<div class="c c2"><img src="${base}/images/art-${p.art[1] || p.art[0]}.svg"></div>
<div class="c c1"><img src="${base}/images/art-${p.art[0]}.svg"></div>
</body></html>`;

await mkdir(new URL('images/og/', root), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const p of pages) {
  await page.goto(`${base}/`);
  await page.setContent(html(p), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(`images/og/${p.key}.png`, root).pathname });
}
// Иконки сайта в PNG (для Яндекса, Google и «добавить на экран» на телефоне) — из той же SVG, что в build.mjs
const svg = /const faviconSvg =\s*'(<svg[\s\S]*?<\/svg>)'/.exec(await readFile(new URL('scripts/build.mjs', root), 'utf8'))[1];
for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]]) {
  const ip = await browser.newPage({ viewport: { width: size, height: size } });
  await ip.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await ip.screenshot({ path: new URL(`images/${name}`, root).pathname, omitBackground: true });
  await ip.close();
}
await browser.close();
server.close();
console.log(`images/og: ${pages.length} картинок, иконки favicon-32.png и apple-touch-icon.png`);
