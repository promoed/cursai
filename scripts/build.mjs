// Собирает сайт из src/courses.mjs + src/styles.css + src/app.js.
//   node scripts/build.mjs             -> site/ (готовая папка для хостинга)
//   node scripts/build.mjs --artifact  -> dist/ (превью: главная страница без обертки html/head)
import { readFile, writeFile, mkdir, copyFile, rm, readdir } from 'node:fs/promises';
import { criteria, filters, directionsB, schools, courses, coursesB, faq } from '../src/courses.mjs';
import { policy, consent } from '../src/legal.mjs';
import { timeline, bigStat } from '../src/about.mjs';

const root = new URL('../', import.meta.url);
const artifact = process.argv.includes('--artifact');

const SITE = {
  name: 'Course Ai',
  domain: 'cursai.ru',
  updated: 'октябрь 2026',
  year: 2026,
  // Адрес сайта со слешем на конце. Нужен для canonical, og:url и sitemap.xml.
  url: 'https://cursai.ru/',
  // Номер счетчика Яндекс Метрики. Метрика запускается сразу при заходе на сайт (см. src/app.js);
  // уведомление о cookie только информирует и дает отказаться на этом устройстве.
  ymId: 113107145,
  policyDate: '27 сентября 2026',
  // Мета-теги подтверждения владения сайтом для партнерских программ/вебмастер-сервисов.
  // Каждый — строка вида '<meta name="..." content="...">', ставится только на реальной сборке (site/), не в превью.
  verification: ['<meta name="mitgo-verification" content="c882e009-18cd-42f1-b70d-7c06b9f8288c">'],
  // Реквизиты оператора для политики и согласия. ФИО/ИНН можно оставить пустыми —
  // тогда в текстах используется формулировка «владелец сайта cursai.ru».
  operator: {
    name: '',
    inn: '',
    email: 'gvrsoon@yandex.ru',
  },
  // Почта для сотрудничества: выводится на странице «О нас»
  contact: 'aconyone@gmail.com',
};

if (!SITE.operator.email) {
  console.warn('Укажите почту в SITE.operator.email (scripts/build.mjs): она выводится в политике и согласии.');
}

// Цвет «постера» для каждого места рейтинга
const palette = ['#FFD23F', '#FF7A59', '#9C8CFF', '#3DD6A0', '#5AB0FF', '#FF8FC7', '#B8E04A', '#FFAA4C', '#6FD3E6', '#C79BFF'];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const total = (c) => Math.round(criteria.reduce((sum, k) => sum + c.scores[k.key] * k.weight, 0) * 10) / 10;
const fmt = (n) => n.toFixed(1).replace('.', ',');
const rub = (n) => (n == null ? '' : `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0₽`);
// Полная стоимость или рассрочка; from добавляет приставку "от" (несколько тарифов у школы), perMonth — "/мес"
const priceText = (n, { from, perMonth } = {}) => (n == null ? null : `${from ? 'от ' : ''}${rub(n)}${perMonth ? '/мес' : ''}`);
const plural = (n) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'курс';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'курса';
  return 'курсов';
};
const verdict = (n) => (n >= 9.5 ? 'превосходно' : n >= 9.2 ? 'отлично' : 'очень хорошо');
const rel = 'nofollow sponsored noopener';

courses.forEach((c, i) => {
  c.rank = i + 1;
  c.total = total(c);
  c.color = palette[i % palette.length];
  // Партнерские ссылки: у варианта Б своя ссылка (другой параметр отслеживания у партнера).
  // Если для курса ссылку не прислали, обе кнопки ведут на обычный url курса.
  c.urlA = c.affiliateA || c.url;
  c.urlB = c.affiliateB || c.url;
  if (i > 0 && c.total > courses[i - 1].total) {
    throw new Error(`Оценка курса #${i + 1} выше, чем у #${i}: поправьте критерии`);
  }
});

// Курсы только для страницы Б: номера продолжают общий список (kurs-11, kurs-12...), чтобы не ломать ссылки на курсы главной
coursesB.forEach((c, i) => {
  c.rank = courses.length + i + 1;
  c.total = total(c);
  c.color = palette[(courses.length + i) % palette.length];
  c.urlA = c.affiliateA || c.url;
  c.urlB = c.affiliateB || c.url;
  if (i > 0 && c.total > coursesB[i - 1].total) {
    throw new Error(`Оценка курса страницы Б «${c.short}» выше, чем у предыдущего: поправьте критерии`);
  }
});
// Все курсы страницы Б (по номеру) и порядок «Все курсы» — по итоговой оценке; placeAll — место в этом общем списке
const allB = courses.concat(coursesB);
const bOrder = [...allB].sort((a, b) => b.total - a.total || a.rank - b.rank);
bOrder.forEach((c, i) => {
  c.placeAll = i + 1;
});

const noAffiliate = allB.filter((c) => !(c.affiliateA || c.affiliateB)).map((c) => `  #${c.rank} ${c.short}${c.rank > courses.length ? ' (только стр. Б)' : ''}`);
if (noAffiliate.length) console.warn(`Нет партнерской ссылки, кнопка ведет на сайт школы напрямую:\n${noAffiliate.join('\n')}`);

const missing = allB.flatMap((c) =>
  [['duration', 'срок'], ['schedule', 'занятия'], ['price', 'цена']]
    .filter(([k]) => c[k] == null)
    .map(([, label]) => `  #${c.rank} ${c.short}: ${label}`)
);
if (missing.length) console.warn(`Не заполнено (поле не будет показано):\n${missing.join('\n')}`);

const text = [JSON.stringify({ timeline, bigStat }), JSON.stringify(allB), JSON.stringify(faq), JSON.stringify(filters), JSON.stringify(directionsB)].join('');
if (/[ёЁ]/.test(text)) throw new Error('В текстах есть буква «ё»');

// [текст](#kurs-N) -> ссылка на курс; в JSON-LD уходит чистый текст
const richText = (t) => esc(t).replace(/\[([^\]]+)\]\((#kurs-\d+)\)/g, '<a class="inline-link" href="$2">$1</a>');
const plainText = (t) => t.replace(/\[([^\]]+)\]\((#kurs-\d+)\)/g, '$1');

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

// Картинка курса. Пока файла нет, показываем постерную заглушку в цвете курса.
const cover = (c, i) => {
  if (c.image) {
    const wide = c.imageShape === 'landscape';
    return `
          <figure class="cover${wide ? ' cover-wide' : ''}">
            <img src="${esc(c.image)}" alt="${esc(c.title)}, ${esc(schools[c.school].name)}" width="${wide ? 1600 : 960}" height="${wide ? 900 : 1200}" loading="lazy" decoding="async">
          </figure>`;
  }
  const school = schools[c.school];
  if (school.logo) {
    const dark = parseInt(school.logoBg.slice(1, 3), 16) < 128;
    return `
          <figure class="cover cover-logo${dark ? ' is-dark' : ''}" style="--logo-bg:${school.logoBg}">
            <img src="${esc(school.logo)}" alt="Логотип ${esc(school.name)}" width="${school.logoSize[0]}" height="${school.logoSize[1]}" loading="lazy" decoding="async">
            <figcaption>${esc(c.short)}</figcaption>
          </figure>`;
  }
  const a = shapes[(i + 1) % shapes.length];
  const b = shapes[(i + 3) % shapes.length];
  return `
          <figure class="cover cover-art" aria-hidden="true">
            <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
              <g class="art-a" transform="translate(150 40) scale(2.4)">${a}</g>
              <g class="art-b" transform="translate(-30 250) scale(1.9)">${b}</g>
              <g class="art-c" transform="translate(250 330) scale(.9)">${shapes[4]}</g>
            </svg>
            <figcaption><b>${esc(schools[c.school].name)}</b><span>${esc(c.short)}</span></figcaption>
          </figure>`;
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
  const facts = [
    ['Полная стоимость', priceText(c.price, { from: c.priceFrom })],
    ['В рассрочку', priceText(c.priceMonthly, { from: c.priceMonthlyFrom, perMonth: true })],
    ['Срок', c.duration],
    ['Занятия', c.schedule],
    ['Уровень', c.level],
    ['Формат', c.format],
    ['Кому', c.audience],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`)
    .join('\n              ');
  return `
    <section class="course${c.rank === 1 ? ' is-lead' : ''}" id="kurs-${c.rank}" data-tags="${c.tags.join(' ')}" data-rank="${c.rank}" style="--c:${c.color}" aria-labelledby="t-${c.rank}">
      <div class="wrap course-in">
        <div class="course-side${c.image ? ' has-image' : ''}">
          <div class="course-num" aria-hidden="true">
            ${poster(i)}
            <span>${c.rank}</span>
          </div>
          <div class="seal" aria-label="Оценка ${fmt(c.total)} из 10">
            <b>${fmt(c.total)}</b>
            <span>из 10</span>
            <em>${verdict(c.total)}</em>
          </div>${c.imageShape === 'landscape' ? '' : cover(c, i)}
        </div>
        <div class="course-body">
          <p class="course-meta">
            <span class="course-school">${esc(s.name)}</span>
            <span class="tape">${esc(c.award)}</span>
          </p>
          <h3 class="course-title" id="t-${c.rank}"><span class="sr-only">${c.rank} место. </span>${esc(c.title)}</h3>
          <p class="course-hook">${esc(c.hook)}</p>${c.imageShape === 'landscape' ? cover(c, i) : ''}
          <div class="paper">
            <h4 class="kicker">Что вы узнаете</h4>
            <p class="learn">${esc(c.learn)}</p>
            <ul class="pros" aria-label="Преимущества курса">
              ${c.pros.map((p) => `<li>${check}<span>${esc(p)}</span></li>`).join('\n              ')}
            </ul>
            <div class="perf" aria-hidden="true"></div>
            <dl class="stub">
              ${facts}
            </dl>
          </div>
          <div class="course-cta">
            <a class="btn btn-solid" href="${esc(c.urlA)}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="cta" data-school="${esc(s.name)}">Подробнее о курсе ${arrow}</a>
          </div>
        </div>
      </div>
    </section>`;
};

// Таблица сравнения строится дважды (index.html и b.html) с разными партнерскими ссылками в кнопке "На сайт"
const tableRows = (urlKey) =>
  courses
    .map(
      (c) => `
            <tr style="--c:${c.color}">
              <td class="t-pos"><span>${c.rank}</span></td>
              <td class="t-course" data-rank="${c.rank}"><a href="#kurs-${c.rank}">${esc(c.title)}</a><span>${esc(schools[c.school].name)}</span></td>
              <td data-label="Уровень">${esc(c.level)}</td>
              <td class="t-nowrap" data-label="Срок">${c.duration ? esc(c.duration) : '<span class="t-na">—</span>'}</td>
              <td class="t-price" data-label="Стоимость">${c.price ? priceText(c.price, { from: c.priceFrom }) : '<span class="t-na">—</span>'}${c.priceMonthly ? `<span class="t-price-sub">${priceText(c.priceMonthly, { from: c.priceMonthlyFrom, perMonth: true })}</span>` : ''}</td>
              <td class="t-score" data-label="Балл">${fmt(c.total)}</td>
              <td class="t-cta"><a class="t-link" href="${esc(c[urlKey])}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="table" data-school="${esc(schools[c.school].name)}">На сайт ${arrow}</a></td>
            </tr>`
    )
    .join('');
const tableRowsA = tableRows('urlA');

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
  .filter((f) => !f.onlyB)
  .map((f) => {
    const n = f.key === 'all' ? courses.length : courses.filter((c) => c.tags.includes(f.key)).length;
    return `<button type="button" class="chip" id="f-${f.key}" data-filter="${f.key}" aria-pressed="${f.key === 'all'}">${esc(f.label)}<span class="chip-n">${n}</span></button>`;
  })
  .join('\n          ');

// Цветные плитки направлений на странице Б. Ссылка ?dir=ключ открывает страницу сразу с выбранным направлением —
// ее можно ставить в рекламу. Места курсов внутри направления пересчитываются с 1 (см. applyFilter в app.js).
// Направления страницы Б, в которые попадает курс (по меткам из directionsB.tags)
const dirsOf = (c) => directionsB.filter((d) => d.tags && c.tags.some((t) => d.tags.includes(t)));
const dirAliases = Object.fromEntries(directionsB.flatMap((d) => (d.aliases || []).map((a) => [a, d.key])));
const directions = directionsB
  .map((f, i) => {
    const n = f.key === 'all' ? allB.length : allB.filter((c) => dirsOf(c).includes(f)).length;
    const all = f.key === 'all';
    const style = all ? `--i:${i}` : `--c:${palette[(i - 1) % palette.length]}; --i:${i}`;
    return `<a class="direction${all ? ' direction-all' : ''}" href="${all ? 'b.html' : `?dir=${f.key}`}" data-filter="${f.key}" data-heading="${esc(f.heading)}"${all ? ' aria-current="true"' : ''} style="${style}">${esc(f.label)}<span class="direction-n">${n} ${plural(n)}</span></a>`;
  })
  .join('\n        ');

const heroSub = filters.find((f) => f.key === 'all').heading;
const bLead = 'Сравните курсы, где учат применять AI. Для работы, бизнеса и творчества.';
const heroLead = `Освойте ИИ для работы, творчества и собственных проектов. Сравните ${courses.length} ${plural(courses.length)} по программе, практике и поддержке — и выберите тот, который подходит под ваши задачи и уровень.`;
const methodSection = `
  <section class="method" data-tint="base" aria-labelledby="method-title">
    <div class="wrap method-in">
      <h2 class="h2" id="method-title">Как формируется рейтинг</h2>
      <ul class="weights">${weights}
      </ul>
    </div>
  </section>`;

const faqList = (list) => list
  .map(
    (f, i) => `
        <details class="qa"${i === 0 ? ' open' : ''}>
          <summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary>
          <p>${richText(f.a)}</p>
        </details>`
  )
  .join('');
const faqHtml = faqList(faq);

const index = courses
  .map((c) => `<a href="#kurs-${c.rank}" style="--c:${c.color}" data-rank="${c.rank}" aria-label="${c.rank} место: ${esc(c.short)}"><span>${c.rank}</span></a>`)
  .join('');

// Финальный блок с топ-3 тоже строится дважды, отдельно для index.html и b.html
const finalPicks = (urlKey) =>
  courses
    .slice(0, 3)
    .map(
      (c) => `
          <a class="pick" href="${esc(c[urlKey])}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="pick" data-school="${esc(schools[c.school].name)}" style="--c:${c.color}">
            <span class="pick-num">${c.rank}</span>
            <span class="pick-text"><b>${esc(c.title)}</b><span>${esc(schools[c.school].name)} · ${fmt(c.total)}</span></span>
            ${arrow}
          </a>`
    )
    .join('');
const finalPicksA = finalPicks('urlA');
// На странице Б в финальном блоке все курсы: app.js показывает первые три из выбранного направления
const finalPicksB = bOrder
  .map(
    (c) => `
          <a class="pick" href="${esc(c.urlB)}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="pick" data-school="${esc(schools[c.school].name)}" data-tags="${dirsOf(c).map((d) => d.key).join(' ')}" style="--c:${c.color}"${c.placeAll > 3 ? ' hidden' : ''}>
            <span class="pick-num">${c.placeAll}</span>
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
          url: c.urlA,
          provider: { '@type': 'Organization', name: schools[c.school].name },
        },
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plainText(f.a) } })),
    },
  ],
};

const favicon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#FFD23F"/><text x="16" y="22" font-family="Arial Black,sans-serif" font-size="15" text-anchor="middle" fill="#121212">10</text></svg>'
  );

// Шрифты лежат на своем хостинге (src/fonts): только символы, которые есть на сайте (кириллица, латиница, цифры, знаки).
// Если добавите текст с новыми символами, скачайте подмножество заново (см. README).
const fontFaces = `@font-face{font-family:'Dela Gothic One';font-style:normal;font-weight:400;font-display:swap;src:url(fonts/dela-gothic-one-subset.woff2) format('woff2')}
@font-face{font-family:'Onest';font-style:normal;font-weight:400 700;font-display:swap;src:url(fonts/onest-subset.woff2) format('woff2')}
`;
const minifyCss = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
// Сжимает пробелы в разметке, не трогая содержимое <script> и <style>
const minifyHtml = (t) =>
  t
    .split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\s*\n\s*/g, '\n').replace(/>\n</g, '><').replace(/\n/g, ' ')))
    .join('')
    .trim();

const css = minifyCss(fontFaces + (await readFile(new URL('src/styles.css', root), 'utf8')));
const js = await readFile(new URL('src/app.js', root), 'utf8');

const title = `Топ-10 курсов по нейросетям ${SITE.year}: рейтинг лучших онлайн-курсов по ИИ`;
const description =
  'Рейтинг 10 лучших курсов по нейросетям и ИИ: Нетология, Skillbox, Яндекс Практикум, Eduson, GeekBrains. Оценки по практике, программе и поддержке, что вы узнаете на каждом курсе.';

const fonts = `<link rel="preload" href="fonts/dela-gothic-one-subset.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/onest-subset.woff2" as="font" type="font/woff2" crossorigin>`;
// Раннее соединение со счетчиком Метрики: сам тег грузится не сразу (см. app.js),
// но браузер успевает установить соединение заранее, пока страница еще рендерится.
const analyticsHints = `<link rel="preconnect" href="https://mc.yandex.ru">
<link rel="dns-prefetch" href="https://mc.yandex.ru">`;

const themeBoot = `<script>try{var t=localStorage.getItem('nr-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

const head = artifact
  ? `<title>${esc(SITE.name)}</title>
<meta name="description" content="${esc(description)}">
${analyticsHints}
${fonts}
<style>${css}</style>
${themeBoot}`
  : `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${SITE.url ? `<link rel="canonical" href="${SITE.url}">\n<meta property="og:url" content="${SITE.url}">\n` : ''}${SITE.verification.map((t) => t + '\n').join('')}<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="ru_RU">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${favicon}">
${analyticsHints}
${fonts}
<style>${css}</style>
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
        <span class="mega">Топ<span class="mega-dash">-</span>10</span> <span class="hero-sub">${heroSub}</span>
      </h1>
      <div class="hero-row">
        <p class="hero-lead">${heroLead}</p>
        <div class="hero-cta">
          <a class="btn btn-ink" href="#kurs-1">Смотреть рейтинг ${arrow}</a>
          <a class="btn btn-line" href="#pick">Подобрать под задачу</a>
        </div>
      </div>
      <ol class="stickers" aria-label="Все места рейтинга">${stickers}
      </ol>
    </div>
  </section>
${methodSection}

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
            <tr><th>#</th><th>Курс</th><th>Уровень</th><th>Срок</th><th>Стоимость</th><th>Балл</th><th><span class="sr-only">Ссылка</span></th></tr>
          </thead>
          <tbody>${tableRowsA}
          </tbody>
        </table>
      </div>
      <p class="table-note">Стоимость указана на дату обновления рейтинга (${esc(SITE.updated)}) без учета скидок, акций и налогового вычета. Школы часто дают скидку и рассрочку: актуальные условия откроются по кнопке «На сайт».</p>
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
      <div class="picks">${finalPicksA}
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту, ${SITE.year}.</p>
    <p>Страница содержит партнерские ссылки: если вы купите курс по ссылке, мы можем получить вознаграждение. На оценки это не влияет. Стоимость и условия обучения указаны на дату обновления рейтинга и могут меняться.</p>
    <p class="foot-links">
      <a href="b.html">Рейтинг курсов</a>
      <a href="about.html">О нас</a>
      <a href="privacy.html">Политика конфиденциальности</a>
      <a href="consent.html">Согласие на cookie</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="privacy.html">политике</a> и <a href="consent.html">согласии</a>.</p>
  <div class="consent-actions">
    <button type="button" class="btn btn-ink btn-sm" id="consent-all">Хорошо</button>
    <button type="button" class="btn btn-line btn-sm" id="consent-min">Отказаться</button>
  </div>
</div>

<nav class="rail" aria-label="Места рейтинга">${index}</nav>

<div class="dock" id="dock" hidden>
  <div class="dock-in">
    <span class="dock-num" id="dock-num">1</span>
    <span class="dock-text"><b id="dock-title">${esc(courses[0].short)}</b><span id="dock-meta">${esc(schools[courses[0].school].name)} · ${fmt(courses[0].total)}</span></span>
    <a class="btn btn-ink btn-sm" id="dock-link" href="${esc(courses[0].urlA)}" target="_blank" rel="${rel}" data-course="1" data-place="dock" data-school="${esc(schools[courses[0].school].name)}">Подробнее ${arrow}</a>
  </div>
</div>

<script>
window.NR_YM_ID = ${JSON.stringify(SITE.ymId)};
window.NR_COURSES = ${JSON.stringify(courses.map((c) => ({ rank: c.rank, short: c.short, school: schools[c.school].name, score: fmt(c.total), url: c.urlA, color: c.color })))};
${js}
</script>
${artifact ? '' : '</body>\n</html>'}
`;

// ============ Страница Б: рейтинг по направлениям ============
// Первый экран и методика как на главной, затем цветные плитки направлений и компактные карточки курсов.
const calIco = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.2h11M5.3 2v2.4M10.7 2v2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const miniCover = (c) => {
  if (c.image) {
    return `<img class="mcard-img" src="${esc(c.image)}" alt="${esc(c.title)}, ${esc(schools[c.school].name)}" width="640" height="400" loading="lazy" decoding="async">`;
  }
  const school = schools[c.school];
  return `<span class="mcard-logo" style="--logo-bg:${school.logoBg}"><img src="${esc(school.logo)}" alt="Логотип ${esc(school.name)}" width="${school.logoSize[0]}" height="${school.logoSize[1]}" loading="lazy" decoding="async"></span>`;
};

// На странице Б у всех карточек один акцентный цвет — фиолетовый из палитры сайта
const ACCENT = '#9C8CFF';

// Декор первого экрана страницы Б: белая «бумажная скульптура». На белом диске лежат белые фигуры
// (полукруг, четверть, кольцо, капсула), объем дают только мягкие тени; фигуры медленно поворачиваются.
const heroArt = `
      <div class="hero-art" aria-hidden="true">
        <div class="sculpt">
          <span class="sc sc-disc"></span>
          <span class="sc sc-half"></span>
          <span class="sc sc-quarter"></span>
          <span class="sc sc-pill"></span>
          <span class="sc sc-ring"></span>
          <span class="sc sc-dot"></span>
        </div>
      </div>`;

// Подробности для вида «Плитки»: в сетке скрыты. Показываем только то, что заполнено в данных курса.
const more = (c) => {
  // Колонка фактов всегда одинаковая: четыре коротких поля 2×2. Длинное «Кому» уходит строкой под плюсы.
  const facts = [
    ['Полная стоимость', priceText(c.price, { from: c.priceFrom })],
    ['В рассрочку', priceText(c.priceMonthly, { from: c.priceMonthlyFrom, perMonth: true })],
    ['Срок', c.duration],
    ['Уровень', c.level],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
  const main = [
    c.learn ? `<p class="learn">${esc(c.learn)}</p>` : '',
    c.pros ? `<ul class="pros" aria-label="Преимущества курса">${c.pros.slice(0, 3).map((p) => `<li>${check}<span>${esc(p)}</span></li>`).join('')}</ul>` : '',
    c.audience ? `<p class="mcard-who"><b>Кому:</b> ${esc(c.audience)}</p>` : '',
  ].join('');
  // Без описания и плюсов факты встают в ряд на всю ширину карточки
  return main
    ? `
              <div class="mcard-main">${main}</div>
              <dl class="stub">${facts}</dl>`
    : `
              <dl class="stub stub-wide">${facts}</dl>`;
};

const courseCard = (c) => {
  const s = schools[c.school];
  const tags = dirsOf(c).map((d) => d.label).slice(0, 2);
  const facts = [c.duration ? `<span>${calIco}${esc(c.duration)}</span>` : '']
    .filter(Boolean)
    .join('');
  const priceRow = [
    c.price ? `<span class="mcard-price">${priceText(c.price, { from: c.priceFrom })}</span>` : '',
    c.priceMonthly ? `<span class="mcard-price-sub">${priceText(c.priceMonthly, { from: c.priceMonthlyFrom, perMonth: true })}</span>` : '',
  ]
    .filter(Boolean)
    .join('');
  return `
        <article class="mcard${c.placeAll === 1 ? ' is-best' : ''}" id="kurs-${c.rank}" data-tags="${dirsOf(c).map((d) => d.key).join(' ')}" data-rank="${c.rank}" data-all="${c.placeAll}" style="--c:${ACCENT}" aria-labelledby="mt-${c.rank}">
          <div class="mcard-cover">
            ${miniCover(c)}
            <span class="mcard-rank" aria-hidden="true">${c.placeAll}</span>
            <span class="mcard-best">Лучший выбор</span>
          </div>
          <div class="mcard-body">
            <p class="mcard-row">
              <span class="mcard-school">${esc(s.name)}</span>
              <span class="mcard-score"><b>${fmt(c.total)}</b><small>/10</small></span>
            </p>
            <h3 class="mcard-title" id="mt-${c.rank}"><span class="sr-only mcard-place">${c.placeAll} место. </span>${esc(c.title)}</h3>
            <p class="mcard-hook">${esc(c.hook)}</p>
            ${priceRow ? `<p class="mcard-price-row">${priceRow}</p>` : ''}
            ${facts ? `<p class="mcard-facts">${facts}</p>` : ''}
            <div class="mcard-more">${more(c)}
            </div>
            <div class="mcard-foot">
              <ul class="mcard-tags">
                ${tags.map((t) => `<li>${esc(t)}</li>`).join('')}
              </ul>
              <a class="btn btn-solid mcard-cta" href="${esc(c.urlB)}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="cta" data-school="${esc(s.name)}">Подробнее о курсе ${arrow}</a>
            </div>
          </div>
        </article>`;
};

const bTitle = `Рейтинг ${heroSub} ${SITE.year}`;
const bHtml = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(bTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="${favicon}">
${analyticsHints}
${fonts}
<style>${css}</style>
${themeBoot}
</head>
<body>
<header class="mtop">
  <div class="wrap mtop-in">
    <span class="logo"><span class="logo-dot" aria-hidden="true"></span>${esc(SITE.name)}</span>
    <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
      <span class="theme-knob" aria-hidden="true"></span>
    </button>
  </div>
</header>

<main>
  <section class="hero hero-b" data-tint="base">
    <div class="wrap">${heroArt}
      <p class="hero-kicker">Рейтинг обновлен · ${esc(SITE.updated)}</p>
      <h1 class="hero-title">
        <span class="mega mega-word">Рейтинг</span> <span class="hero-sub" id="hero-sub">${heroSub}</span>
      </h1>
      <div class="hero-row">
        <p class="hero-lead">${bLead}</p>
        <div class="hero-cta">
          <a class="btn btn-ink" href="#rating">Смотреть рейтинг ${arrow}</a>
        </div>
      </div>
    </div>
  </section>

  <section class="mcards" id="rating" aria-labelledby="rating-title">
    <div class="wrap">
      <div class="dir-bar" data-tint="base">
        <h2 class="h2" id="rating-title">Направление</h2>
        <nav class="directions" aria-label="Направления курсов">
        ${directions}
        </nav>
        <div class="dir-status-row">
          <h2 class="h2 dir-status" id="filter-status" aria-live="polite">Все курсы: ${allB.length} лучших ${plural(allB.length)}</h2>
          <div class="views" role="group" aria-label="Вид списка">
            <button type="button" class="view" data-view="grid" aria-pressed="true"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg>Сетка</button>
            <button type="button" class="view" data-view="list" aria-pressed="false"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="5" rx="1.2"/><rect x="2" y="9" width="12" height="5" rx="1.2"/></svg>Плитки</button>
          </div>
        </div>
      </div>
      <div class="mgrid" id="mgrid">${bOrder.map(courseCard).join('')}
      </div>
    </div>
  </section>
${methodSection}

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
      <div class="picks">${finalPicksB}
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту, ${SITE.year}.</p>
    <p>Страница содержит партнерские ссылки: если вы купите курс по ссылке, мы можем получить вознаграждение. На оценки это не влияет. Стоимость и условия обучения указаны на дату обновления рейтинга и могут меняться.</p>
    <p class="foot-links">
      <a href="index.html">Лучшие курсы по нейросетям</a>
      <a href="about.html">О нас</a>
      <a href="privacy.html">Политика конфиденциальности</a>
      <a href="consent.html">Согласие на cookie</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="privacy.html">политике</a> и <a href="consent.html">согласии</a>.</p>
  <div class="consent-actions">
    <button type="button" class="btn btn-ink btn-sm" id="consent-all">Хорошо</button>
    <button type="button" class="btn btn-line btn-sm" id="consent-min">Отказаться</button>
  </div>
</div>

<div class="dock dock-b" id="dock" hidden>
  <div class="dock-in" style="--c:${ACCENT}">
    <span class="dock-num" id="dock-num">1</span>
    <span class="dock-text"><b id="dock-title">${esc(courses[0].short)}</b><span id="dock-meta">${esc(schools[courses[0].school].name)} · ${fmt(courses[0].total)}</span></span>
    <a class="btn btn-ink btn-sm" id="dock-link" href="${esc(courses[0].urlB)}" target="_blank" rel="${rel}" data-course="1" data-place="dock" data-school="${esc(schools[courses[0].school].name)}">Подробнее ${arrow}</a>
  </div>
</div>

<script>
window.NR_YM_ID = ${JSON.stringify(SITE.ymId)};
window.NR_GOAL = 'rating_course_click';
window.NR_DIR_ALIAS = ${JSON.stringify(dirAliases)};
window.NR_COURSES = ${JSON.stringify(allB.map((c) => ({ rank: c.rank, short: c.short, school: schools[c.school].name, score: fmt(c.total), url: c.urlB, color: ACCENT })))};
${js}
</script>
</body>
</html>
`;

// ============ Страница «О нас» ============
// Общая для обеих страниц рейтинга: о проекте, почта для сотрудничества, история прогресса ИИ и вывод.
const spark = '<svg class="ab-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1c.9 5.8 4.2 9.1 10 10-5.8.9-9.1 4.2-10 10-.9-5.8-4.2-9.1-10-10 5.8-.9 9.1-4.2 10-10z"/></svg>';
const mail = esc(SITE.contact);
const copyIco = '<svg class="ico ico-copy" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const aboutTitle = `О нас · ${SITE.name}`;
const aboutDescription = 'Course Ai — независимая подборка онлайн-курсов по нейросетям. Как ИИ изменил мир за последние годы и почему учиться работать с ним стоит уже сейчас.';
const aboutHtml = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(aboutTitle)}</title>
<meta name="description" content="${esc(aboutDescription)}">
${SITE.url ? `<link rel="canonical" href="${SITE.url}about.html">` : ''}
<link rel="icon" href="${favicon}">
${analyticsHints}
${fonts}
<style>${css}</style>
${themeBoot}
</head>
<body class="about">
<header class="mtop">
  <div class="wrap mtop-in">
    <a class="logo" href="index.html"><span class="logo-dot" aria-hidden="true"></span>${esc(SITE.name)}</a>
    <nav class="ab-nav" aria-label="Разделы сайта">
      <a href="index.html">Топ-10</a>
      <a href="b.html">Рейтинг</a>
      <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
        <span class="theme-knob" aria-hidden="true"></span>
      </button>
    </nav>
  </div>
</header>

<main>
  <section class="hero ab-hero">
    <div class="wrap">
      <p class="hero-kicker">О проекте ${esc(SITE.name)}</p>
      <h1 class="hero-title">
        <span class="mega mega-word">Будущее</span> <span class="hero-sub">за теми, кто умеет работать с ИИ</span>
      </h1>
      <div class="ab-hero-row">
        <div class="ab-hero-text">
          <p class="hero-lead">${esc(SITE.name)} — независимая подборка онлайн-курсов, где учат работать с нейросетями. Мы сравниваем программы, практику и цены, чтобы вы быстрее нашли свой курс и начали учиться.</p>
        </div>
        <aside class="ab-contact" aria-labelledby="ab-contact-title">
          <span class="ab-paper ab-paper-1" aria-hidden="true"></span>
          <span class="ab-paper ab-paper-2" aria-hidden="true"></span>
          <div class="ab-card">
            <h2 class="ab-card-title" id="ab-contact-title">${spark}Сотрудничество и вопросы</h2>
            <button class="ab-mail" type="button" data-copy="${mail}" aria-describedby="ab-copy-hint">
              <span class="ab-mail-text">${mail}</span>
              <span class="ab-mail-ico" aria-hidden="true">${copyIco}${check}</span>
            </button>
            <p class="ab-copy-hint" id="ab-copy-hint" aria-live="polite">Нажмите, чтобы скопировать</p>
          </div>
        </aside>
      </div>
    </div>
  </section>

  <section class="ab-time" aria-labelledby="ab-time-title">
    <div class="wrap">
      <h2 class="h2 ab-h2" id="ab-time-title">Несколько лет, которые изменили все</h2>
      <ol class="ab-line">${timeline
        .map(
          (t, i) => `
        <li class="ab-step" data-reveal style="--c:${palette[i % palette.length]}">
          <span class="ab-year">${esc(t.year)}</span>
          <div class="ab-step-body">
            <h3>${esc(t.title)}</h3>
            <p>${esc(t.text)}</p>
          </div>
        </li>`
        )
        .join('')}
      </ol>
    </div>
  </section>

  <section class="ab-stat" aria-labelledby="ab-stat-title">
    <div class="wrap ab-stat-in" data-reveal>
      <h2 class="ab-stat-title" id="ab-stat-title">${esc(bigStat.title)}</h2>
      <p class="ab-stat-num"><b data-count="${bigStat.value}">${bigStat.value}</b> ${esc(bigStat.unit)}</p>
      <p class="ab-stat-text">${esc(bigStat.text)}</p>
    </div>
  </section>

  <section class="ab-final">
    <div class="wrap">
      <div class="ab-final-in" data-reveal>
        <h2 class="ab-final-title">Лучший момент начать — сейчас</h2>
        <div class="hero-cta">
          <a class="btn ab-btn-dark" href="index.html">Топ-10 курсов по нейросетям ${arrow}</a>
          <a class="btn ab-btn-outline" href="b.html">Рейтинг по направлениям</a>
        </div>
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту, ${SITE.year}. Сотрудничество: <a href="mailto:${mail}">${mail}</a></p>
    <p class="foot-links">
      <a href="index.html">Лучшие курсы по нейросетям</a>
      <a href="b.html">Рейтинг курсов</a>
      <a href="privacy.html">Политика конфиденциальности</a>
      <a href="consent.html">Согласие на cookie</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="privacy.html">политике</a> и <a href="consent.html">согласии</a>.</p>
  <div class="consent-actions">
    <button type="button" class="btn btn-ink btn-sm" id="consent-all">Хорошо</button>
    <button type="button" class="btn btn-line btn-sm" id="consent-min">Отказаться</button>
  </div>
</div>

<script>
window.NR_YM_ID = ${JSON.stringify(SITE.ymId)};
${js}
</script>
</body>
</html>
`;

const legalPage = (doc, other) => {
  const body = doc.sections
    .map(
      (sec) => `
      <section>
        ${sec.h ? `<h2>${esc(sec.h)}</h2>` : ''}
        ${(sec.p || []).map((t) => `<p>${esc(t)}</p>`).join('\n        ')}
        ${sec.list ? `<ul>${sec.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${(sec.after || []).map((t) => `<p>${esc(t)}</p>`).join('\n        ')}
      </section>`
    )
    .join('');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(doc.title)} · ${esc(SITE.name)}</title>
<meta name="robots" content="noindex, follow">
<link rel="icon" href="${favicon}">
${fonts}
<style>${css}</style>
${themeBoot}
</head>
<body class="legal-page">
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="index.html"><span class="logo-dot" aria-hidden="true"></span>${esc(SITE.name)}</a>
    <a class="btn btn-line btn-sm legal-back" href="index.html">К рейтингу</a>
  </div>
</header>
<main class="wrap legal">
  <p class="hero-kicker">Редакция от ${esc(SITE.policyDate)}</p>
  <h1>${esc(doc.title)}</h1>
  <p class="legal-lead">${esc(doc.lead)}</p>${body}
  <p class="legal-other">Смотрите также: <a href="${other.href}">${esc(other.title)}</a></p>
</main>
<footer class="foot">
  <div class="wrap foot-in"><p><b>${esc(SITE.name)}</b> · ${SITE.year}</p></div>
</footer>
</body>
</html>
`;
};
const policyDoc = policy(SITE);
const consentDoc = consent(SITE);
const legal = {
  'privacy.html': legalPage(policyDoc, { href: 'consent.html', title: consentDoc.title }),
  'consent.html': legalPage(consentDoc, { href: 'privacy.html', title: policyDoc.title }),
};
if (/[ёЁ]/.test(Object.values(legal).join(''))) throw new Error('В юридических текстах есть буква «ё»');
if (/[ёЁ]/.test(bHtml)) throw new Error('В варианте Б есть буква «ё»');

const out = new URL(artifact ? 'dist/' : 'site/', root);
await rm(out, { recursive: true, force: true });
await mkdir(new URL('images/', out), { recursive: true });
await mkdir(new URL('fonts/', out), { recursive: true });

const pages = { [artifact ? 'preview.html' : 'index.html']: html, 'b.html': bHtml, 'about.html': aboutHtml, ...legal };
for (const [name, page] of Object.entries(pages)) await writeFile(new URL(name, out), minifyHtml(page));

const used = new Set(Object.values(schools).map((sc) => sc.logo).concat(courses.map((c) => c.image)).filter(Boolean));
for (const file of used) await copyFile(new URL(file, root), new URL(file, out));
for (const f of await readdir(new URL('src/fonts/', root))) await copyFile(new URL(`src/fonts/${f}`, root), new URL(`fonts/${f}`, out));

if (!artifact) {
  await writeFile(
    new URL('robots.txt', out),
    `User-agent: *\nDisallow: /privacy.html\nDisallow: /consent.html\nDisallow: /b.html\n${SITE.url ? `\nSitemap: ${SITE.url}sitemap.xml\n` : ''}`
  );
  if (SITE.url) {
    await writeFile(
      new URL('sitemap.xml', out),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE.url}</loc></url><url><loc>${SITE.url}about.html</loc></url></urlset>\n`
    );
  }
  await copyFile(new URL('src/htaccess', root), new URL('.htaccess', out));
}
console.log(`${artifact ? 'dist' : 'site'}/: ${Object.keys(pages).join(', ')}, ${used.size} картинок, шрифты`);
