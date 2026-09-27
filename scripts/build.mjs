// Собирает статичный index.html из src/courses.mjs + src/styles.css + src/app.js.
//   node scripts/build.mjs             -> index.html (подключает styles.css и app.js)
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

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const total = (c) => Math.round(criteria.reduce((sum, k) => sum + c.scores[k.key] * k.weight, 0) * 10) / 10;
const fmt = (n) => n.toFixed(1).replace('.', ',');
const verdict = (n) => (n >= 9.5 ? 'Превосходно' : n >= 9.2 ? 'Отлично' : 'Очень хорошо');
const rel = 'nofollow sponsored noopener';

courses.forEach((c, i) => {
  c.rank = i + 1;
  c.total = total(c);
  if (i > 0 && c.total > courses[i - 1].total) {
    throw new Error(`Оценка курса #${i + 1} выше, чем у #${i}: поправьте критерии`);
  }
});

const text = [JSON.stringify(courses), JSON.stringify(faq), JSON.stringify(filters)].join('');
if (/[ёЁ]/.test(text)) throw new Error('В текстах есть буква «ё»');

const check = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrow = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12L12 4M6 4h6v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const mark = (key, cls = '') => {
  const s = schools[key];
  return `<span class="mark ${cls}" style="--h:${s.hue}" aria-hidden="true">${esc(s.mark)}</span>`;
};

const board = courses
  .slice(0, 5)
  .map(
    (c) => `
        <li class="board-row${c.rank === 1 ? ' is-lead' : ''}" style="--i:${c.rank}">
          <span class="board-pos">${String(c.rank).padStart(2, '0')}</span>
          <span class="board-name"><b>${esc(schools[c.school].name)}</b><span>${esc(c.short)}</span></span>
          <span class="board-score" data-flap="${fmt(c.total)}">${fmt(c.total)}</span>
        </li>`
  )
  .join('');

const entry = (c) => {
  const s = schools[c.school];
  const bars = criteria
    .map(
      (k) => `
            <li>
              <span class="bar-label">${esc(k.label)}</span>
              <span class="bar" aria-hidden="true"><i style="--v:${c.scores[k.key] / 10}"></i></span>
              <span class="bar-val">${fmt(c.scores[k.key])}</span>
            </li>`
    )
    .join('');
  return `
    <article class="entry${c.rank === 1 ? ' is-lead' : ''}${c.rank <= 3 ? ' is-top' : ''}" id="kurs-${c.rank}" data-tags="${c.tags.join(' ')}" aria-labelledby="t-${c.rank}">
      <div class="entry-rank" aria-hidden="true"><span class="rank-num">${c.rank}</span></div>
      <div class="entry-main">
        <p class="entry-meta">
          ${mark(c.school)}
          <span class="entry-school">${esc(s.name)}</span>
          <span class="award">${esc(c.award)}</span>
        </p>
        <h3 class="entry-title" id="t-${c.rank}"><span class="sr-only">${c.rank} место. </span>${esc(c.title)}</h3>
        <p class="entry-hook">${esc(c.hook)}</p>
        <div class="entry-quick">
          <span class="quick-score"><b>${fmt(c.total)}</b>/ 10 · ${verdict(c.total)}</span>
          <a class="btn btn-primary btn-sm" href="${esc(c.url)}" target="_blank" rel="${rel}" data-course="${c.rank}">Подробнее о курсе ${arrow}</a>
        </div>
        <div class="entry-learn">
          <h4 class="label">Что вы узнаете</h4>
          <p>${esc(c.learn)}</p>
        </div>
        <ul class="pros" aria-label="Преимущества курса">
          ${c.pros.map((p) => `<li>${check}<span>${esc(p)}</span></li>`).join('\n          ')}
        </ul>
      </div>
      <aside class="entry-side" aria-label="Оценка курса">
        <div class="score">
          <span class="score-num" data-count="${c.total}">${fmt(c.total)}</span>
          <span class="score-of">/ 10</span>
          <span class="score-verdict">${verdict(c.total)}</span>
        </div>
        <ul class="bars">${bars}
        </ul>
        <dl class="facts">
          <div><dt>Кому</dt><dd>${esc(c.audience)}</dd></div>
          <div><dt>Уровень</dt><dd>${esc(c.level)}</dd></div>
          <div><dt>Формат</dt><dd>${esc(c.format)}</dd></div>
          <div><dt>Инструменты</dt><dd>${esc(c.tools)}</dd></div>
        </dl>
        <a class="btn btn-primary btn-block" href="${esc(c.url)}" target="_blank" rel="${rel}" data-course="${c.rank}">
          Подробнее о курсе ${arrow}
        </a>
        <p class="btn-note">Откроется сайт школы ${esc(s.name)}</p>
      </aside>
    </article>`;
};

const tableRows = courses
  .map(
    (c) => `
            <tr>
              <td class="t-pos">${c.rank}</td>
              <td class="t-course"><a href="#kurs-${c.rank}">${esc(c.title)}</a><span>${esc(schools[c.school].name)}</span></td>
              <td>${esc(c.audience)}</td>
              <td>${esc(c.level)}</td>
              <td class="t-score"><b>${fmt(c.total)}</b></td>
              <td class="t-cta"><a class="btn btn-ghost btn-sm" href="${esc(c.url)}" target="_blank" rel="${rel}" data-course="${c.rank}">На сайт ${arrow}</a></td>
            </tr>`
  )
  .join('');

const weights = criteria
  .map(
    (k, i) => `
          <li style="--w:${k.weight}; --i:${i}">
            <span class="w-pct">${Math.round(k.weight * 100)}%</span>
            <b>${esc(k.label)}</b>
            <span>${esc(k.hint)}</span>
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

const lead = courses[0];
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
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2B45F0"/><path d="M8 23V9h3l6 9V9h3v14h-3l-6-9v9z" fill="#fff"/><rect x="22" y="19" width="4" height="4" fill="#F2C230"/></svg>'
  );

const css = await readFile(new URL('src/styles.css', root), 'utf8');
const js = await readFile(new URL('src/app.js', root), 'utf8');

const title = `Топ-10 курсов по нейросетям ${SITE.year}: рейтинг лучших онлайн-курсов по ИИ`;
const description =
  'Рейтинг 10 лучших курсов по нейросетям и ИИ: Нетология, Skillbox, Яндекс Практикум, Eduson, GeekBrains. Оценки по практике, программе и поддержке, что вы узнаете на каждом курсе.';

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@500;700&family=Unbounded:wght@500;700;800&display=swap">`;

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
<meta name="theme-color" content="#EDF0F5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0A0F1C" media="(prefers-color-scheme: dark)">
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
    <a class="logo" href="#">
      <span class="logo-mark" aria-hidden="true">Н<i></i></span>
      <span>${esc(SITE.name)}</span>
    </a>
    <nav class="nav" aria-label="Разделы">
      <a href="#rating">Рейтинг</a>
      <a href="#compare">Сравнение</a>
      <a href="#method">Методика</a>
      <a href="#faq">Вопросы</a>
    </nav>
    <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
      <svg class="ico-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g></svg>
      <svg class="ico-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>
    </button>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap hero-in">
      <div class="hero-copy">
        <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Рейтинг обновлен: ${esc(SITE.updated)}</p>
        <h1 class="hero-title">
          <span class="h1-top">10 лучших курсов</span>
          <span class="h1-bottom">по&nbsp;нейросетям <span class="h1-year">${SITE.year}</span></span>
        </h1>
        <p class="hero-lead">Мы сравнили программы Нетологии, Skillbox, Яндекс Практикума, Eduson и GeekBrains по практике, содержанию, поддержке и результату. Выберите курс под свою задачу и начните применять ИИ уже на этой неделе.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#rating">Смотреть рейтинг</a>
          <a class="btn btn-ghost" href="#pick">Подобрать под задачу</a>
        </div>
        <ul class="hero-stats" aria-label="Коротко о рейтинге">
          <li><b>10</b><span>курсов в финале</span></li>
          <li><b>5</b><span>онлайн-школ</span></li>
          <li><b>4</b><span>критерия оценки</span></li>
        </ul>
      </div>

      <div class="board" aria-label="Первые пять мест рейтинга">
        <div class="board-head">
          <span>Место</span><span>Школа и курс</span><span>Балл</span>
        </div>
        <ol class="board-list">${board}
        </ol>
        <a class="board-foot" href="#kurs-1">
          <span>Лидер рейтинга: ${esc(lead.short)}</span>
          ${arrow}
        </a>
      </div>
    </div>
  </section>

  <section class="method" id="method" aria-labelledby="method-title">
    <div class="wrap method-in">
      <div class="method-head">
        <h2 class="h2" id="method-title">Как мы считали оценку</h2>
        <p>Итоговый балл по 10-балльной шкале складывается из четырех критериев. Больше всего весит практика: навык появляется только тогда, когда вы делаете сами.</p>
      </div>
      <ol class="weights">${weights}
      </ol>
    </div>
  </section>

  <section class="rating" id="rating" aria-labelledby="rating-title">
    <div class="wrap">
      <div class="rating-head" id="pick">
        <h2 class="h2" id="rating-title">Рейтинг курсов</h2>
        <div class="filter" role="group" aria-label="Подобрать курс под задачу">
          <span class="filter-label">Моя задача:</span>
          ${chips}
        </div>
        <p class="filter-status" id="filter-status" aria-live="polite">Показаны все 10 курсов</p>
      </div>
      <div class="entries" id="entries">${courses.map(entry).join('')}
      </div>
    </div>
  </section>

  <section class="compare" id="compare" aria-labelledby="compare-title">
    <div class="wrap">
      <h2 class="h2" id="compare-title">Сводная таблица</h2>
      <p class="sub">Все 10 курсов на одном экране. Нажмите на название, чтобы вернуться к подробному описанию.</p>
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

  <section class="faq" id="faq" aria-labelledby="faq-title">
    <div class="wrap faq-in">
      <h2 class="h2" id="faq-title">Частые вопросы</h2>
      <div class="qa-list">${faqHtml}
      </div>
    </div>
  </section>

  <section class="final">
    <div class="wrap final-in">
      <p class="final-kicker">Рейтинг составлен, выбор за вами</p>
      <h2 class="final-title">Через месяц нейросети будут работать на вас</h2>
      <div class="final-pick">
        ${mark(lead.school, 'mark-lg')}
        <div>
          <b>${esc(lead.title)}</b>
          <span>${esc(schools[lead.school].name)} · ${fmt(lead.total)} из 10</span>
        </div>
        <a class="btn btn-signal" href="${esc(lead.url)}" target="_blank" rel="${rel}" data-course="1">Подробнее о курсе ${arrow}</a>
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

<div class="dock" id="dock" hidden>
  <div class="dock-in">
    ${mark(lead.school)}
    <span class="dock-text"><b>№1 · ${esc(lead.short)}</b><span>${esc(schools[lead.school].name)} · ${fmt(lead.total)}</span></span>
    <a class="btn btn-primary btn-sm" href="${esc(lead.url)}" target="_blank" rel="${rel}" data-course="1">Подробнее ${arrow}</a>
  </div>
</div>

<script>
${js}
</script>
${artifact ? '' : '</body>\n</html>'}
`;

if (artifact) {
  await mkdir(new URL('dist/', root), { recursive: true });
  await writeFile(new URL('dist/preview.html', root), html);
  console.log('dist/preview.html');
} else {
  await writeFile(new URL('index.html', root), html.replace(/<style>[\s\S]*?<\/style>\n/, ''));
  await copyFile(new URL('src/styles.css', root), new URL('styles.css', root));
  console.log('index.html, styles.css');
}
