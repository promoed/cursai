// Собирает обложки статей из фрагментов фото: рваные края (clip-path), тени, зерно, бумажная лента с подписью.
const { chromium } = require('playwright');
const fs = require('fs');
const dir = require('path').join(__dirname, '..'); // запуск: node scripts/collage.cjs → images/blog/slug.jpg; исходники фото — src/collage/
const SRC = { 4: [1333, 2000], 6: [1467, 2000], 7: [1500, 1500], 8: [1125, 2000] };
let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
// рваный прямоугольник: зубчатые края
const torn = (amp = 2.2, step = 3) => {
  const pts = [];
  for (let x = 0; x <= 100; x += step) pts.push(`${x}% ${rnd() * amp}%`);
  for (let y = 0; y <= 100; y += step) pts.push(`${100 - rnd() * amp}% ${y}%`);
  for (let x = 100; x >= 0; x -= step) pts.push(`${x}% ${100 - rnd() * amp}%`);
  for (let y = 100; y >= 0; y -= step) pts.push(`${rnd() * amp}% ${y}%`);
  return `polygon(${pts.join(',')})`;
};
// фрагмент: src, crop [x,y,w,h], место [left, top, width], поворот, рваный ли край
const piece = ({ src, crop: [cx, cy, cw, ch], at: [l, t, w], rot = 0, rip = 0, shadow = true, z = 1, extra = '' }) => {
  const k = w / cw, [W, H] = SRC[src];
  return `<div style="position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${ch * k}px;transform:rotate(${rot}deg);z-index:${z};${shadow ? 'filter:drop-shadow(0 10px 14px rgba(0,0,0,.35));' : ''}${extra}"><div style="width:100%;height:100%;background:url(file://${dir}/src/collage/${src}.jpg) ${-cx * k}px ${-cy * k}px/${W * k}px ${H * k}px;${rip ? `clip-path:${torn(rip)}` : ''}"></div></div>`;
};
const tape = (text, l, t, rot, w = 300) => `<div style="position:absolute;left:${l}px;top:${t}px;width:${w}px;padding:14px 22px 12px;transform:rotate(${rot}deg);z-index:9;background:#c9a27e;clip-path:${torn(4, 6)};box-shadow:0 6px 12px rgba(0,0,0,.25);font:500 38px/1 'Georgia',serif;letter-spacing:1px;color:#2a2018;text-align:center;opacity:.97">${text}</div>`;
const grain = `<svg style="position:absolute;inset:0;z-index:20;mix-blend-mode:multiply;opacity:.35" width="1200" height="630"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter><rect width="1200" height="630" filter="url(#g)"/></svg>`;
const page = (bg, body) => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:1200px;height:630px;position:relative;overflow:hidden;background:${bg}}</style></head><body>${body}${grain}</body></html>`;

const covers = {
  // Как выбрать курс: кремовая бумага, синяя полоса текста, рука с часами и ножницы — «выбираем и вырезаем лишнее»
  'kak-vybrat-kurs-po-nejrosetyam': page('#efe6d6', [
    piece({ src: 8, crop: [920, 0, 205, 1900], at: [-30, -60, 250], rot: -3, rip: 3, z: 1 }),
    piece({ src: 8, crop: [20, 1075, 560, 250], at: [140, 470, 470], rot: 3, rip: 2, z: 1 }),
    piece({ src: 6, crop: [290, 0, 210, 1250], at: [610, -40, 170], rot: 4, rip: 3, z: 2 }),
    piece({ src: 6, crop: [0, 1250, 1467, 560], at: [700, 360, 620], rot: -2, rip: 1.6, z: 2 }),
    piece({ src: 4, crop: [372, 942, 540, 290], at: [250, 150, 640], rot: -8, z: 5 }),
    piece({ src: 4, crop: [940, 900, 232, 390], at: [880, 40, 230], rot: 18, z: 6 }),
    tape('выбор курса', 120, 470, -4, 330),
  ].join('')),
  // ИИ-агенты: синее небо, вырванное облако, глаз-«наблюдатель», полосы журнального текста
  'chto-takoe-ii-agenty': page('#4f6bf0', [
    piece({ src: 7, crop: [10, 1095, 460, 400], at: [40, 60, 560], rot: -6, rip: 3.5, z: 2 }),
    piece({ src: 6, crop: [1140, 0, 200, 1200], at: [690, -30, 150], rot: -5, rip: 3, z: 1 }),
    piece({ src: 6, crop: [290, 0, 210, 1250], at: [860, -50, 160], rot: 6, rip: 3, z: 1 }),
    piece({ src: 4, crop: [760, 1405, 318, 284], at: [520, 170, 430], rot: 5, z: 5 }),
    piece({ src: 7, crop: [0, 865, 235, 230], at: [990, 330, 220], rot: -12, z: 4 }),
    tape('ИИ-агенты', 150, 470, -5, 300),
  ].join('')),
  // Профессии: желтая бумага в горох, ч/б человек и дом — новая работа, новая жизнь
  'professii-v-ii': page('#e9b949', [
    piece({ src: 8, crop: [905, 0, 220, 1900], at: [960, -40, 280], rot: 3, rip: 2.5, z: 1 }),
    piece({ src: 8, crop: [20, 1075, 600, 250], at: [-40, 330, 620], rot: -4, rip: 1.5, z: 2 }),
    piece({ src: 8, crop: [175, 165, 690, 1000], at: [330, 20, 430], rot: 2, rip: 1.2, z: 4 }),
    piece({ src: 8, crop: [145, 1315, 980, 545], at: [560, 360, 560], rot: -2, z: 5 }),
    tape('профессии', 80, 110, -6, 290),
  ].join('')),
  // AI-креатор: голубая бумага, лицо, грибы и бабочка — контент из всего подряд, собранный в одно
  'kto-takoj-ai-kreator': page('#6fd3e6', [
    piece({ src: 6, crop: [1140, 0, 200, 1200], at: [40, -40, 150], rot: -4, rip: 3, z: 1 }),
    piece({ src: 7, crop: [1010, 0, 490, 420], at: [820, -20, 400], rot: 6, rip: 2, z: 2 }),
    piece({ src: 4, crop: [0, 900, 275, 350], at: [210, 90, 330], rot: -5, z: 4 }),
    piece({ src: 7, crop: [10, 1095, 460, 400], at: [500, 200, 420], rot: 4, rip: 3, z: 3 }),
    piece({ src: 4, crop: [760, 1405, 318, 284], at: [860, 330, 280], rot: -8, z: 5 }),
    tape('AI-креатор', 140, 480, -4, 330),
  ].join('')),
  // Картинка в статье: из чего состоит работа — тексты, фото, видео, звук
  'kto-takoj-ai-kreator-1': page('#efe6d6', [
    piece({ src: 6, crop: [290, 0, 210, 1250], at: [20, -40, 170], rot: 3, rip: 3, z: 1 }),
    piece({ src: 7, crop: [75, 40, 525, 340], at: [230, 60, 460], rot: -4, rip: 2, z: 3 }),
    piece({ src: 4, crop: [372, 942, 540, 290], at: [640, 210, 520], rot: 7, z: 4 }),
    piece({ src: 7, crop: [0, 865, 235, 230], at: [300, 360, 230], rot: -10, z: 5 }),
    tape('тексты · фото · видео', 610, 60, 3, 470),
  ].join('')),
  // Картинка в статье: портфолио — вырезаем лучшее
  'kto-takoj-ai-kreator-2': page('#9c8cff', [
    piece({ src: 8, crop: [175, 165, 690, 1000], at: [80, 30, 360], rot: -3, rip: 1.2, z: 3 }),
    piece({ src: 6, crop: [0, 1250, 1467, 560], at: [420, 330, 700], rot: 2, rip: 1.6, z: 2 }),
    piece({ src: 4, crop: [940, 900, 232, 390], at: [760, 30, 250], rot: 16, z: 5 }),
    tape('портфолио', 520, 120, -5, 300),
  ].join('')),
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  // node scripts/collage.cjs slug — пересобрать только эти картинки (без аргументов — все)
  for (const [name, html] of Object.entries(covers).filter(([n]) => process.argv.length < 3 || process.argv.slice(2).some((a) => n.startsWith(a)))) {
    fs.writeFileSync(`/tmp/collage-${name}.html`, html);
    await p.goto(`file:///tmp/collage-${name}.html`); await p.waitForTimeout(400);
    await p.screenshot({ path: `${dir}/images/blog/${name}.jpg`, type: 'jpeg', quality: 86 });
    // WebP-копия для страниц (в 2–3 раза легче); jpg остается для соцсетей и старых браузеров. Нужен ImageMagick
    require('child_process').execFileSync('convert', [`${dir}/images/blog/${name}.jpg`, '-quality', '80', `${dir}/images/blog/${name}.webp`]);
  }
  await b.close(); console.log('ok');
})();
