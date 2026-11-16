// Собирает сайт из src/courses.mjs + src/styles.css + src/app.js.
//   node scripts/build.mjs             -> site/ (готовая папка для хостинга)
//   node scripts/build.mjs --artifact  -> dist/ (превью: главная страница без обертки html/head)
import { readFile, writeFile, mkdir, copyFile, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { criteria, filters, directionsB, schools, courses, coursesB, faq } from '../src/courses.mjs';
import { policy, consent, terms } from '../src/legal.mjs';
import { timelineTitle, timeline, bigStat } from '../src/about.mjs';
import { blog, posts, rubrics as allRubrics } from '../src/blog.mjs';

const root = new URL('../', import.meta.url);
const artifact = process.argv.includes('--artifact');

const SITE = {
  name: 'nomoreai.',
  // Название внутри предложения: русское — в кавычках-елочках, латинское — как есть
  get nameInText() {
    return /[а-яА-Я]/.test(this.name) ? `«${this.name}»` : this.name;
  },
  // Подпись рядом с логотипом в шапке (на телефоне скрыта)
  descriptor: 'рейтинг курсов по ИИ',
  domain: 'cursai.ru',
  updated: 'ноябрь 2026',
  year: 2026,
  // Адрес сайта со слешем на конце. Нужен для canonical, og:url и sitemap.xml.
  url: 'https://cursai.ru/',
  // Номер счетчика Яндекс Метрики. Метрика запускается сразу при заходе на сайт (см. src/app.js);
  // уведомление о cookie только информирует и дает отказаться на этом устройстве.
  // Номер счетчика Яндекс Метрики. null — счетчика нет: Метрика не грузится, уведомление о cookie не показывается
  ymId: 114267824,
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
  // Почта для сотрудничества: выводится на странице «О нас». Берется из переменной окружения SITE_CONTACT
  // (задается в настройках окружения). Если переменной нет, карточка с почтой на странице не выводится.
  contact: process.env.SITE_CONTACT || '',
};

// Адреса страниц. На хостинге — чистые адреса от корня сайта (главная — рейтинг, cursai.ru/about/; старый адрес /top-10/ ведет на главную),
// в превью (--artifact) — плоские файлы рядом друг с другом.
const U = artifact
  ? { home: './', faq: './#faq', about: 'about.html', blog: 'blog.html', post: (s) => `blog-${s}.html`, rubric: (s) => `blog-rubrika-${s}.html`, privacy: 'privacy.html', consent: 'consent.html', terms: 'terms.html' }
  : { home: '/', faq: '/#faq', about: '/about/', blog: '/blog/', post: (s) => `/blog/${s}/`, rubric: (s) => `/blog/rubrika/${s}/`, privacy: '/privacy.html', consent: '/consent.html', terms: '/terms.html' };

if (!SITE.contact) {
  console.warn('Переменная окружения SITE_CONTACT не задана: карточка с почтой на странице «О нас» не выводится.');
}
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
// 0 — бесплатный курс
const priceText = (n, { from, perMonth } = {}) => (n == null ? null : n === 0 ? 'Бесплатно' : `${from ? 'от ' : ''}${rub(n)}${perMonth ? '/мес' : ''}`);
const plural = (n) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'курс';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'курса';
  return 'курсов';
};
const verdict = (n) => (n >= 9.5 ? 'превосходно' : n >= 9.2 ? 'отлично' : 'очень хорошо');
const rel = 'nofollow sponsored noopener';

// Метка subid в партнерских ссылках — по ней в кабинете партнерки видно, с какой рекламной кампании пришла продажа.
// Практикум (zallj.com): параметр subid. Остальные школы (go.avnxt.site, go.avred.online, go.redav.online): параметр sub1 —
// он заменяет значение, зашитое в ссылку при ее создании.
const withSub = (url, sub) => {
  if (!sub || !/^https?:\/\/(zallj\.com|go\.avnxt\.site|go\.avred\.online|go\.redav\.online)\//.test(url)) return url;
  const u = new URL(url);
  u.searchParams.set(u.hostname === 'zallj.com' ? 'subid' : 'sub1', sub);
  return u.toString();
};

courses.forEach((c, i) => {
  c.rank = i + 1;
  c.total = total(c);
  c.color = palette[i % palette.length];
  // Партнерские ссылки: у варианта Б своя ссылка (другой параметр отслеживания у партнера).
  // Если для курса ссылку не прислали, обе кнопки ведут на обычный url курса.
  c.urlA = withSub(c.affiliateA || c.url, c.sub);
  c.urlB = withSub(c.affiliateB || c.url, c.sub);
  if (i > 0 && c.total > courses[i - 1].total) {
    throw new Error(`Оценка курса #${i + 1} выше, чем у #${i}: поправьте критерии`);
  }
});

// Курсы только для страницы Б: номера продолжают общий список (kurs-11, kurs-12...), чтобы не ломать ссылки на курсы главной
coursesB.forEach((c, i) => {
  c.rank = courses.length + i + 1;
  c.total = total(c);
  c.color = palette[(courses.length + i) % palette.length];
  c.urlA = withSub(c.affiliateA || c.url, c.sub);
  c.urlB = withSub(c.affiliateB || c.url, c.sub);
  // На главной курсы сортируются по оценке сами, поэтому порядок проверяем только внутри своего направления (первая метка)
  const prev = coursesB.slice(0, i).filter((p) => p.tags[0] === c.tags[0]).pop();
  if (prev && c.total > prev.total) {
    throw new Error(`Оценка курса страницы Б «${c.short}» выше, чем у предыдущего в том же направлении: поправьте критерии`);
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

const text = [JSON.stringify({ timelineTitle, timeline, bigStat }), JSON.stringify(allB), JSON.stringify(faq), JSON.stringify(filters), JSON.stringify(directionsB)].join('');
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
// Обложка-иллюстрация курса (c.art) с плашкой логотипа школы поверх
// Обложки курсов встраиваются прямо в страницу (SVG по 1–2 КБ): ни одного лишнего запроса, картинка видна сразу
const artCache = {};
const artSrc = (file) =>
  (artCache[file] ??= 'data:image/svg+xml,' + encodeURIComponent(readFileSync(new URL(file, root), 'utf8').trim()).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%22/g, "'"));
const artCover = (c, cls) => {
  const school = schools[c.school];
  const logo = `<span class="art-logo${school.logoSize[0] / school.logoSize[1] < 3 ? ' is-tall' : ''}" style="--logo-bg:${school.logoBg}"><img src="${esc(school.logo)}" alt="Логотип ${esc(school.name)}" width="${school.logoSize[0]}" height="${school.logoSize[1]}" decoding="async"></span>`;
  const img = `<img class="art-img" src="${artSrc(c.art)}" alt="" width="1600" height="1000" decoding="async">`;
  // Эксперимент: название курса прямо на обложке (artTitle: true в данных курса)
  if (c.artTitle) {
    return `<span class="${cls} art has-title" style="--art-bg:${c.color}"><span class="art-pic">${img}</span><span class="art-band"><span class="art-title">${esc(c.short)}</span>${logo}</span></span>`;
  }
  return `<span class="${cls} art">${img}${logo}</span>`;
};
const cover = (c, i) => {
  if (c.art) {
    return `
          <figure class="cover cover-pic">${artCover(c, 'cover-pic-in')}</figure>`;
  }
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

// Обложка курса — тоже ссылка на курс (та же, что у кнопки). Для чтения с экрана дублирующая ссылка скрыта,
// цель Метрики уходит с place: logo
const coverLink = (c, i) =>
  `<a class="cover-link" href="${esc(c.urlA)}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="logo" data-school="${esc(schools[c.school].name)}" tabindex="-1" aria-hidden="true">${cover(c, i)}</a>`;

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
          </div>${c.imageShape === 'landscape' ? '' : coverLink(c, i)}
        </div>
        <div class="course-body">
          <p class="course-meta">
            <span class="course-school">${esc(s.name)}</span>
            <span class="tape">${esc(c.award)}</span>${c.trial ? `
            <span class="tape tape-trial" title="${esc(c.trial)}">Бесплатный период</span>` : ''}
          </p>
          <h3 class="course-title" id="t-${c.rank}"><span class="sr-only">${c.rank} место. </span>${esc(c.title)}</h3>
          <p class="course-hook">${esc(c.hook)}</p>${c.imageShape === 'landscape' ? coverLink(c, i) : ''}
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

// Блок «Как формируется рейтинг»: методика в 4 шага, у второго шага — шкала весов критериев
const wColors = ['#FFD23F', '#FF7A59', '#9C8CFF', '#3DD6A0'];
const weightBar = `
          <div class="wbar" aria-hidden="true">${criteria.map((k, i) => `<span style="--w:${k.weight};--wc:${wColors[i % wColors.length]}"></span>`).join('')}</div>
          <ul class="wlegend">${criteria
            .map((k, i) => `<li style="--wc:${wColors[i % wColors.length]}" title="${esc(k.hint)}">${esc(k.label)} <b>${Math.round(k.weight * 100)}%</b></li>`)
            .join('')}</ul>`;
const methodSteps = [
  ['Изучаем программу', 'Разбираем модули, инструменты, формат занятий и то, что останется на руках после обучения.'],
  ['Ставим оценки', 'Четыре критерия от 0 до 10. Итоговый балл — взвешенная сумма, больше всего весит практика.'],
  ['Сверяем цены и сроки', 'Стоимость, рассрочку и срок берем со страниц школ. Если школа их не публикует, поле остается пустым.'],
  ['Сравниваем внутри направления', 'Курсы по Data Science соревнуются с Data Science, по дизайну — с дизайном. Место в разделе показывает лучший выбор под конкретную задачу.'],
];


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
// Цвет направления: свой (поле color) или по порядку из палитры среди направлений без своего цвета —
// так новая плитка со своим цветом не сдвигает цвета остальных
const dirColor = (d) => d.color || palette[directionsB.filter((x) => x.tags && !x.color).indexOf(d) % palette.length];
// Адрес направления: на хостинге — своя страница cursai.ru/slug/ (свой title, description и заголовок для поиска),
// в превью — ?dir=ключ на той же странице. Старые ссылки ?dir=... продолжают работать (см. app.js).
const dirHref = (d) => (artifact ? (d.slug ? `?dir=${d.key}` : U.home) : d.slug ? `/${d.slug}/` : '/');
const dirAliases = Object.fromEntries(directionsB.flatMap((d) => (d.aliases || []).map((a) => [a, d.key])));
const directions = directionsB
  .map((f, i) => {
    const n = f.key === 'all' ? allB.length : allB.filter((c) => dirsOf(c).includes(f)).length;
    const all = f.key === 'all';
    const style = all ? `--i:${i}` : `--c:${dirColor(f)}; --i:${i}`;
    return `<a class="direction${all ? ' direction-all' : ''}" href="${dirHref(f)}" data-filter="${f.key}" data-heading="${esc(f.heading)}" data-lead="${esc(f.lead)}"${artifact ? '' : ` data-path="${dirHref(f)}"`}${all ? ' aria-current="true"' : ''} style="${style}">${esc(f.label)}<span class="direction-n">${n} ${plural(n)}</span></a>`;
  })
  .join('\n        ');

const heroSub = filters.find((f) => f.key === 'all').heading;
const bLead = esc(directionsB.find((d) => d.key === 'all').lead);
const heroLead = `Освойте ИИ для работы, творчества и собственных проектов. Сравните ${courses.length} ${plural(courses.length)} по программе, практике и поддержке — и выберите тот, который подходит под ваши задачи и уровень.`;
const methodSection = `
  <section class="method" data-tint="base" aria-labelledby="method-title">
    <div class="wrap">
      <div class="method-head">
        <h2 class="h2" id="method-title">Как формируется рейтинг</h2>
        <p class="method-lead">Одна методика для всех курсов — чтобы их можно было честно сопоставить. Последняя проверка данных: <b>${esc(SITE.updated)}</b>.</p>
      </div>
      <ol class="steps">${methodSteps
        .map(
          ([title, text], i) => `
        <li class="step" style="--sc:${wColors[i]}">
          <span class="step-n" aria-hidden="true">0${i + 1}</span>
          <h3 class="step-title">${esc(title)}</h3>
          <p class="step-text">${esc(text)}</p>${i === 1 ? weightBar : ''}
        </li>`
        )
        .join('')}
      </ol>
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

const faviconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9C8CFF"/><stop offset="1" stop-color="#FF8FC7"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="#212121"/><rect x="3" y="5" width="26" height="22" rx="7" fill="url(#fg)" transform="rotate(-6 16 16)"/><path d="M10.5 22.8Q9.5 22.8 8.7 22.4Q7.9 22.1 7.5 21.4Q7 20.7 7 19.7Q7 18.8 7.5 18.1Q7.9 17.5 8.8 17.1Q9.6 16.8 10.7 16.8L13.2 16.8L13.2 16.3Q13.2 15.6 12.8 15.2Q12.4 14.7 11.5 14.7Q10.6 14.7 10.2 15.2Q9.7 15.6 9.6 16.2L7.4 15.5Q7.6 14.7 8.1 14.1Q8.6 13.6 9.5 13.2Q10.3 12.8 11.5 12.8Q13.4 12.8 14.5 13.7Q15.6 14.7 15.6 16.4L15.6 20Q15.6 20.5 16.1 20.5L16.9 20.5L16.9 22.5L15.3 22.5Q14.6 22.5 14.1 22.2Q13.6 21.8 13.6 21.2L13.6 21.2L13.3 21.2Q13.2 21.5 12.9 21.8Q12.7 22.2 12.1 22.5Q11.5 22.8 10.5 22.8M11 20.8Q12 20.8 12.6 20.3Q13.2 19.7 13.2 18.8L13.2 18.6L10.8 18.6Q10.2 18.6 9.8 18.9Q9.4 19.2 9.4 19.7Q9.4 20.2 9.8 20.5Q10.2 20.8 11 20.8M20.2 22.5L17.8 22.5L17.8 13.1L20.2 13.1L20.2 22.5M19 12Q18.4 12 17.9 11.6Q17.5 11.1 17.5 10.5Q17.5 9.8 17.9 9.4Q18.4 8.9 19 8.9Q19.7 8.9 20.1 9.4Q20.6 9.8 20.6 10.5Q20.6 11.1 20.1 11.6Q19.7 12 19 12M23.7 22.8Q22.9 22.8 22.4 22.3Q21.8 21.8 21.8 21Q21.8 20.2 22.4 19.7Q22.9 19.2 23.7 19.2Q24.4 19.2 24.9 19.7Q25.4 20.2 25.4 21Q25.4 21.8 24.9 22.3Q24.4 22.8 23.7 22.8" fill="#121212"/></svg>';
// Логотип-надпись (src/logo.svg, шрифт Space Grotesk в кривых): «nomore» — currentColor, «ai.» — на стикере с градиентом фиолетовый→розовый
const logoMark = `<span class="logo-mark" role="img" aria-label="${esc(SITE.name)}">${(await readFile(new URL('src/logo.svg', root), 'utf8')).trim()}</span>`;
const favicon = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg);
// На хостинге иконки лежат файлами в корне (их видят Яндекс и Google), в превью — встроенная SVG
const iconLinks = artifact
  ? `<link rel="icon" href="${favicon}">`
  : '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">';
// Картинка для соцсетей: своя для страницы (images/og/ключ.png, создает scripts/og.mjs) или общая images/og.png
const ogImage = (key) => {
  const post = key.startsWith('post-') && posts.find((p) => `post-${p.slug}` === key);
  if (post && post.cover) return post.cover;
  return ogImageFile(key);
};
const ogImageFile = (key) => (existsSync(new URL(`images/og/${key}.png`, root)) ? `images/og/${key}.png` : 'images/og.png');
const ogTags = (key) =>
  SITE.url
    ? `\n<meta property="og:image" content="${SITE.url}${ogImage(key)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">`
    : '';

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
const analyticsHints = SITE.ymId
  ? `<link rel="preconnect" href="https://mc.yandex.ru">
<link rel="dns-prefetch" href="https://mc.yandex.ru">`
  : '';

const themeBoot = `<script>var t;try{t=localStorage.getItem('nr-theme')}catch(e){}document.documentElement.setAttribute('data-theme',t||'dark')</script>`;

const head = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${SITE.url ? `<link rel="canonical" href="${SITE.url}top-10/">\n<meta property="og:url" content="${SITE.url}top-10/">\n` : ''}${SITE.verification.map((t) => t + '\n').join('')}<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="ru_RU">${ogTags('home')}
<meta name="theme-color" content="#212121" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#212121" media="(prefers-color-scheme: dark)">
${iconLinks}
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
    <a class="logo" href="${U.home}" aria-label="${esc(SITE.name)}, на главную">
      ${logoMark}<span class="logo-desc">${esc(SITE.descriptor)}</span>
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
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту ${SITE.year}.${SITE.contact ? ` <span class="foot-mail">Сотрудничество: <a href="mailto:${esc(SITE.contact)}">${esc(SITE.contact)}</a></span>` : ''}</p>
    <p>Стоимость и условия обучения указаны на дату обновления рейтинга и могут меняться. Страница содержит партнерские ссылки, на оценки это не влияет.</p>
    <p class="foot-links">
      <a href="${U.home}">Рейтинг курсов</a>
      <a href="${U.blog}">Блог</a>
      <a href="${U.about}">О нас</a>
      <a href="${U.privacy}">Политика конфиденциальности</a>
      <a href="${U.consent}">Согласие на обработку данных</a>
      <a href="${U.terms}">Пользовательское соглашение</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="${U.privacy}">политике</a> и <a href="${U.consent}">согласии</a>.</p>
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
</body>
</html>
`;

// ============ Страница Б: рейтинг по направлениям ============
// Первый экран и методика как на главной, затем цветные плитки направлений и компактные карточки курсов.
const calIco = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.2h11M5.3 2v2.4M10.7 2v2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const miniCover = (c) => {
  if (c.art) return artCover(c, 'mcard-art');
  if (c.image) {
    return `<img class="mcard-img" src="${esc(c.image)}" alt="${esc(c.title)}, ${esc(schools[c.school].name)}" width="640" height="400" loading="lazy" decoding="async">`;
  }
  const school = schools[c.school];
  return `<span class="mcard-logo" style="--logo-bg:${school.logoBg}"><img src="${esc(school.logo)}" alt="Логотип ${esc(school.name)}" width="${school.logoSize[0]}" height="${school.logoSize[1]}" loading="lazy" decoding="async"></span>`;
};

// На странице Б у всех карточек один акцентный цвет — фиолетовый из палитры сайта
const ACCENT = '#9C8CFF';

// Декор первого экрана главной: веер из трех лучших курсов рейтинга. Карточки не переставляются —
// они медленно «дышат» (каждая в своем ритме), а при наведении веер раскрывается. Клик ведет к курсу.
const deckDirs = directionsB.filter((d) => d.tags);
const heroTop = bOrder.slice(0, 3);
const heroArt = `
      <div class="hero-art">
        <div class="deck" aria-label="Три лучших курса рейтинга">${heroTop
          .map(
            (c, i) => `
          <a class="deck-card deck-card-${i + 1}" href="#kurs-${c.rank}" style="--art-bg:${c.color}">
            <span class="deck-pic"><img src="${artSrc(c.art)}" alt="""" width="1600" height="1000" decoding="async"><span class="deck-place">${c.placeAll}</span></span>
            <span class="deck-info">
              <span class="deck-school">${esc(schools[c.school].name)}</span>
              <span class="deck-title">${esc(c.short)}</span>
              <span class="deck-score">${fmt(c.total)}<small>/10</small></span>
            </span>
          </a>`
          )
          .reverse()
          .join('')}
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
    c.trial ? `<p class="mcard-who"><b>Бесплатный период:</b> ${esc(c.trial.charAt(0).toLowerCase() + c.trial.slice(1))}</p>` : '',
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
  const tags = dirsOf(c).filter((d) => !d.noLabel).map((d) => d.label).slice(0, 2);
  const facts = [c.duration ? `<span>${calIco}${esc(c.duration)}</span>` : '']
    .filter(Boolean)
    .join('');
  const priceRow = [
    c.price != null ? `<span class="mcard-price">${priceText(c.price, { from: c.priceFrom })}</span>` : '',
    c.priceMonthly ? `<span class="mcard-price-sub">${priceText(c.priceMonthly, { from: c.priceMonthlyFrom, perMonth: true })}</span>` : '',
  ]
    .filter(Boolean)
    .join('');
  return `
        <article class="mcard${c.placeAll === 1 ? ' is-best' : ''}" id="kurs-${c.rank}" data-tags="${dirsOf(c).map((d) => d.key).join(' ')}" data-rank="${c.rank}" data-all="${c.placeAll}" style="--c:${ACCENT}" aria-labelledby="mt-${c.rank}">
          <div class="mcard-cover">
            <a class="mcard-cover-link" href="${esc(c.urlB)}" target="_blank" rel="${rel}" data-course="${c.rank}" data-place="logo" data-school="${esc(s.name)}" tabindex="-1" aria-hidden="true">${miniCover(c)}</a>
            <span class="mcard-rank" aria-hidden="true">${c.placeAll}</span>
            <span class="mcard-best">Выбор редакции</span>${c.trial ? `
            <span class="mcard-trial" title="${esc(c.trial)}">Бесплатный период</span>` : ''}
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
const bDescription =
  'Рейтинг онлайн-курсов по нейросетям по направлениям: ИИ для себя, для работы и бизнеса, для маркетинга, ИИ-агенты, новая профессия и Data Science. Оценки программ, цены и сроки обучения.';
// Частые вопросы общие с «Топ-10», поэтому разметка FAQ для поиска есть на обеих страницах
const bJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    jsonLd['@graph'][1],
    { '@type': 'WebSite', name: SITE.name, description: 'Рейтинг курсов по ИИ и нейросетям', inLanguage: 'ru', ...(SITE.url ? { url: SITE.url } : {}) },
    { '@type': 'Organization', name: SITE.name, ...(SITE.url ? { url: SITE.url, logo: `${SITE.url}apple-touch-icon.png` } : {}), ...(SITE.contact ? { email: SITE.contact } : {}) },
  ],
};
const bHtml = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(bTitle)}</title>
<meta name="description" content="${esc(bDescription)}">
${SITE.url ? `<link rel="canonical" href="${SITE.url}">\n<meta property="og:url" content="${SITE.url}">\n` : ''}${artifact ? '' : SITE.verification.map((t) => t + '\n').join('')}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(bTitle)}">
<meta property="og:description" content="${esc(bDescription)}">
<meta property="og:locale" content="ru_RU">${ogTags('home')}
<meta name="theme-color" content="#212121" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#212121" media="(prefers-color-scheme: dark)">
${iconLinks}
${analyticsHints}
${fonts}
<style>${css}</style>
${themeBoot}
<script type="application/ld+json">${JSON.stringify(bJsonLd)}</script>
</head>
<body>
<header class="mtop">
  <div class="wrap mtop-in">
    <span class="logo">${logoMark}<span class="logo-desc">${esc(SITE.descriptor)}</span></span>
    <nav class="site-nav" aria-label="Разделы сайта">
      <a href="${U.home}" aria-current="page">Рейтинг курсов</a>
      <a href="${U.blog}">Блог</a>
      <a href="${U.about}">О нас</a>
    </nav>
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
        <p class="hero-lead" id="hero-lead">${bLead}</p>
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
      <h2 class="final-title">Лучшее время начать — сегодня</h2>
      <div class="picks">${finalPicksB}
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту ${SITE.year}.${SITE.contact ? ` <span class="foot-mail">Сотрудничество: <a href="mailto:${esc(SITE.contact)}">${esc(SITE.contact)}</a></span>` : ''}</p>
    <p>Стоимость и условия обучения указаны на дату обновления рейтинга и могут меняться. Страница содержит партнерские ссылки, на оценки это не влияет.</p>
    <p class="foot-links">
      <a href="${U.about}">О нас</a>
      <a href="${U.privacy}">Политика конфиденциальности</a>
      <a href="${U.consent}">Согласие на обработку данных</a>
      <a href="${U.terms}">Пользовательское соглашение</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="${U.privacy}">политике</a> и <a href="${U.consent}">согласии</a>.</p>
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
window.NR_DIR_GOALS = ${JSON.stringify(Object.fromEntries(directionsB.map((d) => [d.key, d.goal])))};
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
const aboutTitle = `О проекте ${SITE.nameInText} — рейтинг курсов по ИИ`;
const aboutDescription = `${SITE.nameInText} — независимая подборка онлайн-курсов по нейросетям. Как ИИ изменил мир за последние годы и почему учиться работать с ним стоит уже сейчас.`;
const aboutHtml = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(aboutTitle)}</title>
<meta name="description" content="${esc(aboutDescription)}">
${SITE.url ? `<link rel="canonical" href="${SITE.url}about/">\n<meta property="og:url" content="${SITE.url}about/">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(aboutTitle)}">
<meta property="og:description" content="${esc(aboutDescription)}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="${esc(SITE.name)}">${ogTags('about')}
${iconLinks}
${analyticsHints}
${fonts}
<style>${css}</style>
${themeBoot}
</head>
<body class="about">
<header class="mtop">
  <div class="wrap mtop-in">
    <a class="logo" href="${U.home}">${logoMark}<span class="logo-desc">${esc(SITE.descriptor)}</span></a>
    <nav class="site-nav" aria-label="Разделы сайта">
      <a href="${U.home}">Рейтинг курсов</a>
      <a href="${U.blog}">Блог</a>
      <a href="${U.about}" aria-current="page">О нас</a>
    </nav>
    <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
      <span class="theme-knob" aria-hidden="true"></span>
    </button>
  </div>
</header>

<main>
  <section class="hero ab-hero">
    <div class="wrap">
      <p class="hero-kicker">О проекте ${esc(SITE.nameInText)}</p>
      <h1 class="hero-title">
        <span class="mega mega-word">Выбор</span> <span class="hero-sub">курса по ИИ без долгих поисков</span>
      </h1>
      <div class="ab-hero-row">
        <div class="ab-hero-text">
          <p class="hero-lead">${esc(SITE.nameInText)} — рейтинг курсов для тех, кто хочет использовать ИИ в работе, творчестве и собственных проектах. Мы собираем программы по нейросетям и современным профессиям, где ИИ — часть практики. Сравниваем содержание, задания, поддержку и стоимость, чтобы вам было проще выбрать обучение под свои задачи.</p>
        </div>${mail ? `
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
        </aside>` : ''}
      </div>
    </div>
  </section>

  <section class="ab-time" aria-labelledby="ab-time-title">
    <div class="wrap">
      <h2 class="h2 ab-h2" id="ab-time-title">${esc(timelineTitle)}</h2>
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

  <section class="ab-stat" aria-label="Скорость распространения ИИ">
    <div class="wrap ab-stat-in" data-reveal>
      <p class="ab-stat-num"><b data-count="${bigStat.value}">${bigStat.value}</b> ${esc(bigStat.unit)}</p>
      <p class="ab-stat-text">${esc(bigStat.text)}</p>
    </div>
  </section>

  <section class="ab-final">
    <div class="wrap">
      <div class="ab-final-in" data-reveal>
        <h2 class="ab-final-title">Лучший момент начать — сейчас</h2>
        <div class="hero-cta">
          <a class="btn ab-btn-dark" href="${U.home}">Рейтинг по направлениям ${arrow}</a>
          <a class="btn ab-btn-outline" href="${U.faq}">Частые вопросы</a>
        </div>
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту ${SITE.year}.${mail ? ` <span class="foot-mail">Сотрудничество: <a href="mailto:${mail}">${mail}</a></span>` : ''}</p>
    <p class="foot-links">
      <a href="${U.home}">Рейтинг курсов</a>
      <a href="${U.blog}">Блог</a>
      <a href="${U.privacy}">Политика конфиденциальности</a>
      <a href="${U.consent}">Согласие на обработку данных</a>
      <a href="${U.terms}">Пользовательское соглашение</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="${U.privacy}">политике</a> и <a href="${U.consent}">согласии</a>.</p>
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


// ============ Блог ============
// Статьи — в src/blog.mjs. Список: cursai.ru/blog/, статья: cursai.ru/blog/slug/.
// Для поиска: свои title/description/canonical/og, разметка BlogPosting, BreadcrumbList и FAQPage, все адреса в sitemap.xml.
const ruDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][m - 1]} ${y}`;
};
const readMin = (html) => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 180));
const absUrl = (path) => (SITE.url ? SITE.url + path.replace(/^\//, '') : '');
// Ссылки в тексте статьи: {dir:key} — страница направления рейтинга, {post:slug} — другая статья
const postBody = (html) =>
  html
    .replace(/\{dir:(\w+)\}/g, (_, k) => {
      const d = directionsB.find((x) => x.key === k);
      if (!d) throw new Error(`Блог: нет направления ${k}`);
      return dirHref(d);
    })
    .replace(/\{post:([\w-]+)\}/g, (_, s) => {
      if (!posts.some((p) => p.slug === s)) throw new Error(`Блог: нет статьи ${s}`);
      return U.post(s);
    });
const pageShell = ({ title, description, path, ogType = 'website', og = 'blog', ld, current, body }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${SITE.url ? `<link rel="canonical" href="${absUrl(path)}">\n<meta property="og:url" content="${absUrl(path)}">\n` : ''}<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="${esc(SITE.name)}">${ogTags(og)}
<meta name="theme-color" content="#212121">
${iconLinks}
${analyticsHints}
${fonts}
<style>${css}</style>
${themeBoot}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
</head>
<body class="blog-page">
<header class="mtop">
  <div class="wrap mtop-in">
    <a class="logo" href="${U.home}">${logoMark}<span class="logo-desc">${esc(SITE.descriptor)}</span></a>
    <nav class="site-nav" aria-label="Разделы сайта">
      <a href="${U.home}">Рейтинг курсов</a>
      <a href="${U.blog}"${current === 'blog' ? ' aria-current="page"' : ''}>Блог</a>
      <a href="${U.about}">О нас</a>
    </nav>
    <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
      <span class="theme-knob" aria-hidden="true"></span>
    </button>
  </div>
</header>
${body}
<footer class="foot">
  <div class="wrap foot-in">
    <p><b>${esc(SITE.name)}</b> · независимая подборка онлайн-курсов по искусственному интеллекту ${SITE.year}.${SITE.contact ? ` <span class="foot-mail">Сотрудничество: <a href="mailto:${esc(SITE.contact)}">${esc(SITE.contact)}</a></span>` : ''}</p>
    <p class="foot-links">
      <a href="${U.home}">Рейтинг курсов</a>
      <a href="${U.blog}">Блог</a>
      <a href="${U.about}">О нас</a>
      <a href="${U.privacy}">Политика конфиденциальности</a>
      <a href="${U.consent}">Согласие на обработку данных</a>
      <a href="${U.terms}">Пользовательское соглашение</a>
      <button type="button" class="linklike" id="cookie-settings">Настройки cookie</button>
    </p>
  </div>
</footer>

<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" hidden>
  <p class="consent-title" id="consent-title">Мы используем cookie</p>
  <p class="consent-text">Сайт использует Яндекс Метрику для статистики посещений. Продолжая пользоваться сайтом, вы соглашаетесь с этим. Подробнее в <a href="${U.privacy}">политике</a> и <a href="${U.consent}">согласии</a>.</p>
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
const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(SITE.url ? { item: absUrl(path) } : {}) })),
});
const org = { '@type': 'Organization', name: SITE.name, ...(SITE.url ? { url: SITE.url } : {}) };
// Рубрики: публикуются только те, в которых есть статьи
const rubrics = allRubrics.filter((r) => posts.some((p) => p.rubric === r.slug));
posts.forEach((p) => {
  if (!allRubrics.some((r) => r.slug === p.rubric)) throw new Error(`Блог: у статьи ${p.slug} нет рубрики или она не описана`);
});
const rubricOf = (p) => allRubrics.find((r) => r.slug === p.rubric);
const rubricNav = (active) => `
      <nav class="rubrics" aria-label="Рубрики блога">
        <a href="${U.blog}"${active ? '' : ' aria-current="page"'}>Все статьи</a>${rubrics
          .map((r) => `<a href="${U.rubric(r.slug)}"${active === r.slug ? ' aria-current="page"' : ''}>${esc(r.name)}</a>`)
          .join('')}
      </nav>`;
const coverAlt = (p) => `Иллюстрация к статье «${p.h1}»`;
const postCard = (p) => `
        <article class="post-card">${p.cover ? `
          <img class="post-card-img" src="${esc(p.cover)}" alt="${esc(coverAlt(p))}" width="1200" height="630" loading="lazy" decoding="async">` : ''}
          <p class="post-meta"><time datetime="${p.date}">${ruDate(p.date)}</time> · ${readMin(p.body)} мин чтения</p>
          <h2 class="post-card-title"><a href="${U.post(p.slug)}">${esc(p.title)}</a></h2>
          <p class="post-card-text">${esc(p.description)}</p>
          <p class="post-tags"><a class="post-rubric" href="${U.rubric(p.rubric)}">${esc(rubricOf(p).name)}</a></p>
        </article>`;
const blogIndexHtml = pageShell({
  title: `${blog.title} · ${SITE.name}`,
  description: blog.description,
  path: '/blog/',
  current: 'blog',
  ld: {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Blog', name: blog.title, description: blog.description, publisher: org, ...(SITE.url ? { url: absUrl('/blog/') } : {}),
        blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, datePublished: p.date, ...(SITE.url ? { url: absUrl(`/blog/${p.slug}/`) } : {}) })) },
      crumbs([['Рейтинг курсов', '/'], ['Блог', '/blog/']]),
    ],
  },
  body: `
<main>
  <section class="hero blog-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Навигация"><a href="${U.home}">Рейтинг курсов</a><span aria-hidden="true">/</span><span>Блог</span></nav>
      <h1 class="hero-title"><span class="mega mega-word">${esc(blog.h1)}</span> <span class="hero-sub">${esc(blog.sub)}</span></h1>
      <p class="hero-lead">${esc(blog.lead)}</p>${rubricNav('')}
    </div>
  </section>
  <section class="blog-list">
    <div class="wrap posts">${posts.map(postCard).join('')}
    </div>
  </section>
</main>`,
});
const rubricHtml = (r) => {
  const list = posts.filter((p) => p.rubric === r.slug);
  const path = `/blog/rubrika/${r.slug}/`;
  return pageShell({
    title: `${r.name} — статьи о курсах по ИИ · ${SITE.name}`,
    description: r.description,
    path,
    og: `rubric-${r.slug}`,
    current: 'blog',
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'CollectionPage', name: r.name, description: r.description, ...(SITE.url ? { url: absUrl(path) } : {}) },
        crumbs([['Рейтинг курсов', '/'], ['Блог', '/blog/'], [r.name, path]]),
      ],
    },
    body: `
<main>
  <section class="hero blog-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Навигация"><a href="${U.home}">Рейтинг курсов</a><span aria-hidden="true">/</span><a href="${U.blog}">Блог</a></nav>
      <h1 class="blog-rubric-title">${esc(r.name)}</h1>
      <p class="hero-lead">${esc(r.description)}</p>${rubricNav(r.slug)}
    </div>
  </section>
  <section class="blog-list">
    <div class="wrap posts">${list.map(postCard).join('')}
    </div>
  </section>
</main>`,
  });
};
const postHtml = (p) => {
  const body = postBody(p.body);
  const toc = [...body.matchAll(/<h2 id="([\w-]+)">([^<]+)<\/h2>/g)];
  const others = posts.filter((x) => x.slug !== p.slug);
  return pageShell({
    // длинный заголовок статьи идет без названия сайта, чтобы title не обрезался в выдаче (до ~65 символов)
    title: p.title.length > 52 ? p.title : `${p.title} · ${SITE.name}`,
    description: p.description,
    path: `/blog/${p.slug}/`,
    ogType: 'article',
    og: `post-${p.slug}`,
    current: 'blog',
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BlogPosting',
          headline: p.title,
          description: p.description,
          datePublished: p.date,
          dateModified: p.dateModified || p.date,
          inLanguage: 'ru',
          author: org,
          publisher: org,
          ...(SITE.url ? { mainEntityOfPage: absUrl(`/blog/${p.slug}/`), image: `${SITE.url}${ogImage(`post-${p.slug}`)}` } : {}),
          articleSection: rubricOf(p).name,
          keywords: p.tags.join(', '),
        },
        crumbs([['Рейтинг курсов', '/'], ['Блог', '/blog/'], [rubricOf(p).name, `/blog/rubrika/${p.rubric}/`], [p.h1, `/blog/${p.slug}/`]]),
        ...(p.faq ? [{ '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
      ],
    },
    body: `
<main>
  <article class="post">
    <header class="wrap post-head">
      <nav class="crumbs" aria-label="Навигация"><a href="${U.home}">Рейтинг курсов</a><span aria-hidden="true">/</span><a href="${U.blog}">Блог</a><span aria-hidden="true">/</span><a href="${U.rubric(p.rubric)}">${esc(rubricOf(p).name)}</a></nav>
      <h1 class="post-title">${esc(p.h1)}</h1>
      <p class="post-meta"><a class="post-rubric" href="${U.rubric(p.rubric)}">${esc(rubricOf(p).name)}</a> <time datetime="${p.date}">${ruDate(p.date)}</time> · ${readMin(p.body)} мин чтения · Редакция ${esc(SITE.nameInText)}</p>
      <p class="post-lead">${esc(p.lead)}</p>${p.cover ? `
      <img class="post-cover" src="${esc(p.cover)}" alt="${esc(coverAlt(p))}" width="1200" height="630" decoding="async" fetchpriority="high">` : ''}
    </header>
    <div class="wrap post-grid">
      <aside class="post-toc" aria-label="Содержание">
        <p class="post-toc-title">Содержание</p>
        <ol>${toc.map(([, id, h]) => `<li><a href="#${id}">${h}</a></li>`).join('')}${p.faq ? '<li><a href="#voprosy">Частые вопросы</a></li>' : ''}</ol>
      </aside>
      <div class="post-body">${body}${
        p.faq
          ? `
<h2 id="voprosy">Частые вопросы</h2>${p.faq.map((f) => `
<details class="qa"><summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary><p>${esc(f.a)}</p></details>`).join('')}`
          : ''
      }
        <div class="post-cta">
          <p class="post-cta-title">Сравните курсы по одной методике</p>
          <p>Программы, практика, поддержка и цены в одном рейтинге.</p>
          <a class="btn btn-ink" href="${U.home}">Открыть рейтинг ${arrow}</a>
        </div>
      </div>
    </div>
  </article>
  <section class="blog-list blog-more" aria-labelledby="more-title">
    <div class="wrap">
      <h2 class="h2" id="more-title">Читайте также</h2>
      <div class="posts">${others.map(postCard).join('')}
      </div>
    </div>
  </section>
</main>`,
  });
};

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
${iconLinks}
${fonts}
<style>${css}</style>
${themeBoot}
</head>
<body class="legal-page">
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="${U.home}">${logoMark}<span class="logo-desc">${esc(SITE.descriptor)}</span></a>
    <a class="btn btn-line btn-sm legal-back" href="${U.home}">К рейтингу</a>
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
const termsDoc = terms(SITE);
const legal = {
  'terms.html': legalPage(termsDoc, { href: U.privacy, title: policyDoc.title }),
  'privacy.html': legalPage(policyDoc, { href: U.consent, title: consentDoc.title }),
  'consent.html': legalPage(consentDoc, { href: U.privacy, title: policyDoc.title }),
};
if (/[ёЁ]/.test(Object.values(legal).join(''))) throw new Error('В юридических текстах есть буква «ё»');
if (/[ёЁ]/.test(bHtml)) throw new Error('В варианте Б есть буква «ё»');
if (/[ёЁ]/.test(blogIndexHtml + posts.map(postHtml).join('') + rubrics.map(rubricHtml).join(''))) throw new Error('В блоге есть буква «ё»');

const out = new URL(artifact ? 'dist/' : 'site/', root);
await rm(out, { recursive: true, force: true });
await mkdir(new URL('images/', out), { recursive: true });
await mkdir(new URL('fonts/', out), { recursive: true });

// Страница 404: ненайденный адрес показывает понятную ошибку со ссылками, а не подменяется главной
const notFoundHtml = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Страница не найдена · ${esc(SITE.name)}</title>
<meta name="robots" content="noindex">
${iconLinks}
${fonts}
<style>${css}</style>
${themeBoot}
</head>
<body>
<header class="mtop">
  <div class="wrap mtop-in">
    <a class="logo" href="${U.home}">${logoMark}<span class="logo-desc">${esc(SITE.descriptor)}</span></a>
    <nav class="site-nav" aria-label="Разделы сайта">
      <a href="${U.home}">Рейтинг курсов</a>
      <a href="${U.blog}">Блог</a>
      <a href="${U.about}">О нас</a>
    </nav>
    <button class="theme" id="theme-toggle" type="button" aria-label="Переключить тему">
      <span class="theme-knob" aria-hidden="true"></span>
    </button>
  </div>
</header>
<main class="hero">
  <div class="wrap">
    <h1 class="hero-title"><span class="mega">404</span> <span class="hero-sub">Такой страницы нет</span></h1>
    <div class="hero-row">
      <p class="hero-lead">Возможно, адрес изменился. Рейтинг курсов по нейросетям — на главной.</p>
      <div class="hero-cta">
        <a class="btn btn-ink" href="${U.home}">На главную ${arrow}</a>
      </div>
    </div>
  </div>
</main>
<script>
${js}
</script>
</body>
</html>
`;

// Старые адреса (b.html, about.html) ведут на новые; ?dir= и #якорь сохраняются, чтобы рекламные ссылки не сломались.
// На Apache то же делает 301-редирект в .htaccess, эта страница — запасной вариант для другого хостинга.
const redirect = (to) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${esc(SITE.name)}</title>
<meta name="robots" content="noindex">
${SITE.url ? `<link rel="canonical" href="${SITE.url}${to.slice(1)}">` : ''}
<script>location.replace('${to}' + location.search + location.hash)</script>
<meta http-equiv="refresh" content="0; url=${to}">
</head>
<body><a href="${to}">Перейти на сайт ${esc(SITE.nameInText)}</a></body>
</html>
`;
// Страница направления (cursai.ru/slug/): та же главная, но заголовок, абзац, title и description — свои,
// а скрипт сразу показывает курсы этого направления (атрибут data-dir у <html>)
const dirPage = (d) => {
  const title = `Рейтинг ${d.heading} ${SITE.year}`;
  const url = SITE.url ? `${SITE.url}${d.slug}/` : '';
  let p = bHtml
    .replace('<html lang="ru">', `<html lang="ru" data-dir="${d.key}">`)
    .replace(`<title>${esc(bTitle)}</title>`, `<title>${esc(title)}</title>`)
    .replace(`<meta name="description" content="${esc(bDescription)}">`, `<meta name="description" content="${esc(d.lead)}">`)
    .replace(`<meta property="og:title" content="${esc(bTitle)}">`, `<meta property="og:title" content="${esc(title)}">`)
    .replace(`<meta property="og:description" content="${esc(bDescription)}">`, `<meta property="og:description" content="${esc(d.lead)}">`)
    .replace(`<span class="hero-sub" id="hero-sub">${heroSub}</span>`, `<span class="hero-sub" id="hero-sub">${esc(d.heading)}</span>`)
    .replace(`<p class="hero-lead" id="hero-lead">${bLead}</p>`, `<p class="hero-lead" id="hero-lead">${esc(d.lead)}</p>`);
  p = p.replace(ogTags('home'), ogTags(`dir-${d.key}`));
  if (url) p = p.replace(`<link rel="canonical" href="${SITE.url}">\n<meta property="og:url" content="${SITE.url}">`, `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">`);
  return p;
};
// В превью главная страница публикуется без обертки html/head — ее добавляет просмотрщик
const bare = (t) => t.replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*/, '').replace('</head>\n<body>', '').replace(/<\/body>\s*<\/html>\s*$/, '');
// На хостинге картинки и шрифты берутся от корня сайта: так они работают и на вложенных страницах (/about/)
const rootify = (t) => t.replace(/(["(])(images|fonts)\//g, '$1/$2/');
const dirPages = artifact
  ? {}
  : Object.fromEntries(
      directionsB
        .filter((d) => d.slug)
        .flatMap((d) => [
          [`${d.slug}/index.html`, rootify(dirPage(d))],
          // плоская копия: .htaccess отдает ее по адресу /slug/, даже если папка не загрузилась
          [`${d.slug}.html`, rootify(dirPage(d))],
        ])
    );
const pages = artifact
  ? { 'preview.html': bare(bHtml), 'about.html': aboutHtml, 'blog.html': blogIndexHtml, ...Object.fromEntries(posts.map((p) => [U.post(p.slug), postHtml(p)])), ...Object.fromEntries(rubrics.map((r) => [U.rubric(r.slug), rubricHtml(r)])), ...legal }
  : {
      'index.html': rootify(bHtml),
      // Страница «Курсы по ИИ» закрыта: заглушки ведут на главную, если хостинг не выполнит 301 из .htaccess
      'top-10/index.html': redirect('/'),
      'about/index.html': rootify(aboutHtml),
      'b.html': redirect('/'),
      // Та же страница плоским файлом в корне: .htaccess отдает ее по адресу /about/,
      // так что адреса работают, даже если хостинг не загрузил папки или не отдает index.html из них
      'about.html': rootify(aboutHtml),
      'top-10.html': redirect('/'),
      '404.html': rootify(notFoundHtml),
      ...dirPages,
      // Блог: папки + плоские копии (blog.html, blog-slug.html), которые .htaccess отдает по чистым адресам
      'blog/index.html': rootify(blogIndexHtml),
      'blog.html': rootify(blogIndexHtml),
      ...Object.fromEntries(posts.flatMap((p) => [[`blog/${p.slug}/index.html`, rootify(postHtml(p))], [`blog-${p.slug}.html`, rootify(postHtml(p))]])),
      ...Object.fromEntries(rubrics.flatMap((r) => [[`blog/rubrika/${r.slug}/index.html`, rootify(rubricHtml(r))], [`blog-rubrika-${r.slug}.html`, rootify(rubricHtml(r))]])),
      ...Object.fromEntries(Object.entries(legal).map(([k, v]) => [k, rootify(v)])),
    };
for (const [name, page] of Object.entries(pages)) {
  if (name.includes('/')) await mkdir(new URL(name.replace(/[^/]+$/, ''), out), { recursive: true });
  // Метрика для посетителей без JavaScript: пиксель сразу после <body> (только на хостинге)
  const withPixel = !artifact && SITE.ymId && !/http-equiv="refresh"/.test(page)
    ? page.replace(/<body([^>]*)>/, `<body$1><noscript><div><img src="https://mc.yandex.ru/watch/${SITE.ymId}" style="position:absolute;left:-9999px" alt=""></div></noscript>`)
    : page;
  await writeFile(new URL(name, out), minifyHtml(withPixel));
}

const used = new Set(Object.values(schools).map((sc) => sc.logo).concat(courses.map((c) => c.image), courses.concat(coursesB).map((c) => c.art), ['images/og.png']).filter(Boolean));
for (const file of used) await copyFile(new URL(file, root), new URL(file, out));
// Картинки для соцсетей и иконки сайта (создает scripts/og.mjs)
// Обложки статей блога
if (existsSync(new URL('images/blog/', root))) {
  await mkdir(new URL('images/blog/', out), { recursive: true });
  for (const f of await readdir(new URL('images/blog/', root))) await copyFile(new URL(`images/blog/${f}`, root), new URL(`images/blog/${f}`, out));
}
if (existsSync(new URL('images/og/', root))) {
  await mkdir(new URL('images/og/', out), { recursive: true });
  for (const f of await readdir(new URL('images/og/', root))) await copyFile(new URL(`images/og/${f}`, root), new URL(`images/og/${f}`, out));
}
if (!artifact) {
  await writeFile(new URL('favicon.svg', out), faviconSvg);
  for (const f of ['favicon-32.png', 'apple-touch-icon.png']) if (existsSync(new URL(`images/${f}`, root))) await copyFile(new URL(`images/${f}`, root), new URL(f, out));
}
for (const f of await readdir(new URL('src/fonts/', root))) await copyFile(new URL(`src/fonts/${f}`, root), new URL(`fonts/${f}`, out));

if (!artifact) {
  await writeFile(
    new URL('robots.txt', out),
    `User-agent: *\nDisallow: /privacy.html\nDisallow: /consent.html\nDisallow: /terms.html\nDisallow: /b.html\nDisallow: /about.html\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&ysclid&gclid&from\nDisallow: /blog.html\nDisallow: /blog-\n${SITE.url ? `\nSitemap: ${SITE.url}sitemap.xml\n` : ''}`
  );
  if (SITE.url) {
    await writeFile(
      new URL('sitemap.xml', out),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE.url}</loc></url>${directionsB.filter((d) => d.slug).map((d) => `<url><loc>${SITE.url}${d.slug}/</loc></url>`).join('')}<url><loc>${SITE.url}blog/</loc></url>${rubrics.map((r) => `<url><loc>${SITE.url}blog/rubrika/${r.slug}/</loc></url>`).join('')}${posts.map((p) => `<url><loc>${SITE.url}blog/${p.slug}/</loc><lastmod>${p.dateModified || p.date}</lastmod></url>`).join('')}<url><loc>${SITE.url}about/</loc></url></urlset>\n`
    );
  }
  // .htaccess: адреса страниц направлений подставляются из данных (src/courses.mjs, поле slug)
  const slugs = directionsB.filter((d) => d.slug).map((d) => d.slug.replace(/-/g, '\\-')).join('|');
  await writeFile(new URL('.htaccess', out), (await readFile(new URL('src/htaccess', root), 'utf8')).replaceAll('__DIR_SLUGS__', slugs));
}
console.log(`${artifact ? 'dist' : 'site'}/: ${Object.keys(pages).join(', ')}, ${used.size} картинок, шрифты`);
