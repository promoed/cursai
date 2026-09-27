// Собирает статичный index.html из src/courses.mjs + src/styles.css + src/app.js.
//   node scripts/build.mjs             -> index.html + styles.css
//   node scripts/build.mjs --artifact  -> dist/preview.html (все встроено в один файл)
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { criteria, filters, schools, courses, faq } from '../src/courses.mjs';

const root = new URL('../', import.meta.url);
const artifact = process.argv.includes('--artifact');

const SITE = {
  name: 'Нейрорейтинг',
  updated: 'сентябрь 2026',
  year: 2026,
  url: 'https://example.com/',
};

// Цвет «постера» для каждого места рейтинга
const palette = ['#FFD23F', '#FF7A59', '#9C8CFF', '#3DD6A0', '#5AB0FF', '#FF8FC7', '#B8E04A', '#FFAA4C', '#6FD3E6', '#C79BFF'];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const total = (c) => Math.round(criteria.reduce((sum, k) => sum + c.scores[k.key] * k.weight, 0) * 10) / 10;
const fmt = (n) => n.toFixed(1).replace('.', ',');
const verdict = (n) => (n >= 9.5 ? 'превосходно' : n >= 9.2 ? 'отлично' : 'очень хорошо');
const rel = 'nofollow sponsored noopener';

courses.forEach((c, i) => {
  c.rank = i + 1;
  c.total = total(c);
  c.color = palette[i % palette.length];
  if (i > 0 && c.total > courses[i - 1].total) {
    throw new Error(`Оценка курса #${i + 1} выше, чем у #${i}: поправьте критерии`);
  }
});

const text = [JSON.stringify(courses), JSON.stringify(faq), JSON.stringify(filters)].join('');
if (/[ёЁ]/.test(text)) throw new Error('В текстах есть буква «ё»');

const check = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrow = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Геометрия постера: у каждого места своя композиция из простых фигур
const shapes = [
  '<circle cx="60" cy="60" r="60"/>',
  '<path d="M0 120A120 120 0 0 1 120 0v120z"/>',
  '<path d="M0 60a60 60 0 0 1 120 0z"/>',
  '<rect x="18" y="18" width="84" height="84" rx="10" transform="rotate(20 60 60)"/>',
  '<path d="M60 0l60 120H0z"/>',
];
const poster = (i) => {
  const a = shapes[i % shapes.length];
  const b = shapes[(i + 2) % shapes.length];
  return `<svg class="deco" viewBox="0 0 240 240" aria-hidden="true">
          <g class="deco-a" transform="translate(40 20) scale(1.5)">${a}</g>
          <g class="deco-b" transform="translate(120 120) scale(.9)">${b}</g>
        </svg>`;
};

const stickers = courses
  .map(
    (c) => `
        <li style="--c:${c.color}; --i:${c.rank}">
          <a class="sticker" href="#kurs-${c.rank}">
            <span class="sticker-num">${c.rank}</span>
            <span class="sticker-school">${esc(schools[c.school].name)}</span>
            <span class="sticker-name">${esc(c.short)}</span>
            <span class="sticker-score">${fmt(c.total)}</span>
          </a>
        </li>`
  )
  .join('');

const course = (c, i) => {
  const s = schools[c.school];
  const meters = criteria
    .map(
      (k) => `
              <li>
                <span>${esc(k.label)}</span>
                <b>${fmt(c.scores[k.key])}</b>
                <i aria-hidden="true"><i style="--v:${c.scores[k.key] / 10}"></i></i>
              </li>`
    )
    .join('');
  return `
    <section class="course${c.rank === 1 ? ' is-lead' : ''}" id="kurs-${c.rank}" data-tags="${c.tags.join(' ')}" data-rank="${c.rank}" style="--c:${c.color}" aria-labelledby="t-${c.rank}">
      <div class="wrap course-in">
        <div class="course-side">
          <div class="course-num" aria-hidden="true">
            ${poster(i)}
            <span>${c.rank}</span>
          </div>
          <div class="seal" aria-label="Оценка ${fmt(c.total)} из 10">
            <b>${fmt(c.total)}</b>
            <span>из 10</span>
            <em>${verdict(c.total)}</em>
          </div>
        </div>
        <div class="course-body">
          <p class="course-meta">
            <span class="course-school">${esc(s.name)}</span>
            <span class="tape">${esc(c.award)}</span>
          </p>
          <h3 class="course-title" id="t-${c.rank}"><span class="sr-only">${c.rank} место. </span>${esc(c.title)}</h3>
          <p class="course-hook">${esc(c.hook)}</p>
          <div class="paper">
            <h4 class="kicker">Что вы узнаете</h4>
            <p class="learn">${esc(c.learn)}</p>
            <ul class="pros" aria-label="Преимущества курса">
              ${c.pros.map((p) => `<li>${check}<span>${esc(p)}</span></li>`).join('\n              ')}
            </ul>
          </div>
          <div class="course-foot">
            <ul class="meters" aria-label="Оценки по критериям">${meters}
            </ul>
            <dl class="facts">
              <div><dt>Кому</dt><dd>${esc(c.audience)}</dd></div>
              <div><dt>Уровень</dt><dd>${esc(c.level)}</dd></div>
              <div><dt>Формат</dt><dd>${esc(c.format)}</dd></div>
            </dl>
          </div>
          <div class="course-cta">
            <a class="btn btn-solid" href="${esc(c.url)}" target="_blank" rel="${rel}" data-course="${c.rank}">Подробнее о курсе ${arrow}</a>
            <span class="cta-note">Программа, цена и старт потока на сайте ${esc(s.name)}</span>
          </div>
        </div>
      </div>
    </section>`;
};

const tableRows = courses
  .map(
    (c) => `
            <tr style="--c:${c.color}">
              <td class="t-pos"><span>${c.rank}</span></td>
              <td class="t-course"><a href="#kurs-${c.rank}">${esc(c.title)}</a><span>${esc(schools[c.school].name)}</span></td>
              <td>${esc(c.audience)}</td>
              <td>${esc(c.level)}</td>
              <td class="t-score">${fmt(c.total)}</td>
              <td class="t-cta"><a class="t-link" href="${esc(c.url)}" target="_blank" rel="${rel}" data-course="${c.rank}">На сайт ${arrow}</a></td>
            </tr>`
  )
  .join('');

const weights = criteria
  .map(
    (k) => `
          <li>
            <b>${Math.round(k.weight * 100)}%</b>
            <span class="w-name">${esc(k.label)}</span>
            <span class="w-hint">${esc(k.hint)}</span>
          </li>`
  )
  .join('');

const chips = filters
  .map((f) => {
    const n = f.key === 'all' ? courses.length : courses.filter((c) => c.tags.includes(f.key)).length;
    return `<button type="button" class="chip" id="f-${f.key}" data-filter="${f.key}" aria-pressed="${f.key === 'all'}">${esc(f.label)}<span class="chip-n">${n}</span></button>`;
  })
  .join('\n          ');

const faqHtml = faq
  .map(
    (f, i) => `
        <details class="qa"${i === 0 ? ' open' : ''}>
          <summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary>
          <p>${esc(f.a)}</p>
        </details>`
  )
  .join('');

const index = courses
  .map((c) => `<a href="#kurs-${c.rank}" style="--c:${c.color}" data-rank="${c.rank}" aria-label="${c.rank} место: ${esc(c.short)}"><span>${c.rank}</span></a>`)
  .join('');

const finalPicks = courses
  .slice(0, 3)
  .map(
    (c) => `
          <a class="pick" href="${esc(c.url)}" target="_blank" rel="${rel}" data-course="${c.rank}" style="--c:${c.color}">
            <span class="pick-num">${c.rank}</span>
            <span class="pick-text"><b>${esc(c.title)}</b><span>${esc(schools[c.school].name)} · ${fmt(c.total)}</span></span>
            ${arrow}
          </a>`
  )
  .join('');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ItemList',
      name: `Рейтинг курсов по нейросетям ${SITE.year}`,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: courses.length,
      itemListElement: courses.map((c) => ({
        '@type': 'ListItem',
        position: c.rank,
        item: {
          '@type': 'Course',
          name: c.title,
          description: c.hook,
          url: c.url,
          provider: { '@type': 'Organization', name: schools[c.school].name },
        },
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

const favicon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#FFD23F"/><text x="16" y="22" font-family="Arial Black,sans-serif" font-size="15" text-anchor="middle" fill="#121212">10</text></svg>'
  );

const css = await readFile(new URL('src/styles.css', root), 'utf8');
const js = await readFile(new URL('src/app.js', root), 'utf8');

const title = `Топ-10 курсов по нейросетям ${SITE.year}: рейтинг лучших онлайн-курсов по ИИ`;
const description =
  'Рейтинг 10 лучших курсов по нейросетям и ИИ: Нетология, Skillbox, Яндекс Практикум, Eduson, GeekBrains. Оценки по практике, программе и поддержке, что вы узнаете на каждом курсе.';

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Onest:wght@400;500;600;700&display=swap">`;

const themeBoot = `<script>try{var t=localStorage.getItem('nr-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

const head = artifact
  ? `<title>${esc(SITE.name)}</title>
<meta name="description" content="${esc(description)}">
${fonts}
<style>
${css}
</style>
${themeBoot}`
  : `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE.url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="ru_RU">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${favicon}">
${fonts}
<link rel="stylesheet" href="styles.css">
${themeBoot}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>`;

const html = `${head}
<a class="skip" href="#rating">К рейтингу</a>

<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="#top" aria-label="${esc(SITE.name)}, наверх">
      <span class="logo-dot" aria-hidden="true"></span>${esc(SITE.name)}
    </a>
    <nav class="nav" aria-label="Разделы">
      <a href="#rating">Рейтинг</a>
      <a href="#compare">Сравнение</a>
      <a href="#faq">Вопросы</a>
    </nav>
    <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
      <span class="theme-knob" aria-hidden="true"></span>
    </button>
  </div>
</header>

<main id="top">
  <section class="hero" data-tint="base">
    <div class="wrap">
      <p class="hero-kicker">Рейтинг обновлен · ${esc(SITE.updated)}</p>
      <h1 class="hero-title">
        <span class="mega">Топ<span class="mega-dash">-</span>10</span>
        <span class="hero-sub">курсов по нейросетям ${SITE.year}, после которых ИИ работает на вас</span>
      </h1>
      <div class="hero-row">
        <p class="hero-lead">Мы разобрали программы Нетологии, Skillbox, Яндекс Практикума, Eduson и GeekBrains и оценили их по практике, содержанию, поддержке и результату. Выберите курс под свою задачу и начните применять нейросети уже на этой неделе.</p>
        <div class="hero-cta">
          <a class="btn btn-ink" href="#kurs-1">Смотреть рейтинг ${arrow}</a>
          <a class="btn btn-line" href="#pick">Подобрать под задачу</a>
        </div>
      </div>
      <ol class="stickers" aria-label="Все места рейтинга">${stickers}
      </ol>
    </div>
  </section>

  <section class="method" data-tint="base" aria-labelledby="method-title">
    <div class="wrap method-in">
      <h2 class="h2" id="method-title">Как мы ставили оценки</h2>
      <ul class="weights">${weights}
      </ul>
    </div>
  </section>

  <div class="rating" id="rating">
    <div class="wrap pick-bar" id="pick" data-tint="base">
      <h2 class="h2">Рейтинг курсов</h2>
      <div class="filter" role="group" aria-label="Подобрать курс под задачу">
          ${chips}
      </div>
      <p class="filter-status" id="filter-status" aria-live="polite">Показаны все 10 курсов</p>
    </div>
    ${courses.map(course).join('')}
  </div>

  <section class="compare" id="compare" data-tint="base" aria-labelledby="compare-title">
    <div class="wrap">
      <h2 class="h2" id="compare-title">Все курсы в одной таблице</h2>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Таблица сравнения курсов">
        <table>
          <thead>
            <tr><th>#</th><th>Курс</th><th>Кому подойдет</th><th>Уровень</th><th>Балл</th><th><span class="sr-only">Ссылка</span></th></tr>
          </thead>
          <tbody>${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="faq" id="faq" data-tint="base" aria-labelledby="faq-title">
    <div class="wrap faq-in">
      <h2 class="h2" id="faq-title">Частые вопросы</h2>
      <div class="qa-list">${faqHtml}
      </div>
    </div>
  </section>

  <section class="final" data-tint="base">
    <div class="wrap">
      <h2 class="final-title">Лучшее время начать было вчера. Следующее лучшее — сегодня.</h2>
      <div class="picks">${finalPicks}
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту, ${SITE.year}.</p>
    <p>Страница содержит партнерские ссылки: если вы купите курс по ссылке, мы можем получить вознаграждение. На оценки это не влияет. Стоимость, сроки и условия обучения уточняйте на сайтах школ, они регулярно меняются.</p>
  </div>
</footer>

<nav class="rail" aria-label="Места рейтинга">${index}</nav>

<div class="dock" id="dock" hidden>
  <div class="dock-in">
    <span class="dock-num" id="dock-num">1</span>
    <span class="dock-text"><b id="dock-title">${esc(courses[0].short)}</b><span id="dock-meta">${esc(schools[courses[0].school].name)} · ${fmt(courses[0].total)}</span></span>
    <a class="btn btn-ink btn-sm" id="dock-link" href="${esc(courses[0].url)}" target="_blank" rel="${rel}" data-course="1">Подробнее ${arrow}</a>
  </div>
</div>

<script>
window.NR_COURSES = ${JSON.stringify(courses.map((c) => ({ rank: c.rank, short: c.short, school: schools[c.school].name, score: fmt(c.total), url: c.url, color: c.color })))};
${js}
</script>
${artifact ? '' : '</body>\n</html>'}
`;

if (artifact) {
  await mkdir(new URL('dist/', root), { recursive: true });
  await writeFile(new URL('dist/preview.html', root), html);
  console.log('dist/preview.html');
} else {
  await writeFile(new URL('index.html', root), html);
  await copyFile(new URL('src/styles.css', root), new URL('styles.css', root));
  console.log('index.html, styles.css');
}
