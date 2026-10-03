(function () {
  var root = document.documentElement;
  var body = document.body;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var data = window.NR_COURSES || [];

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  /* Тема */
  var toggle = document.getElementById('theme-toggle');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : systemDark.matches;
  }
  function syncToggle() {
    toggle.setAttribute('aria-label', isDark() ? 'Включить светлую тему' : 'Включить темную тему');
  }
  toggle.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    var apply = function () {
      root.setAttribute('data-theme', next);
      syncToggle();
    };
    if (document.startViewTransition && !reduce) document.startViewTransition(apply);
    else apply();
    store('nr-theme', next);
  });
  if (systemDark.addEventListener) systemDark.addEventListener('change', syncToggle);
  syncToggle();

  var courses = Array.prototype.slice.call(document.querySelectorAll('.course, .mcard'));
  var tinted = Array.prototype.slice.call(document.querySelectorAll('.course, .mcard, [data-tint]'));
  /* Страница Б (карточки .mcard): фон не перекрашивается под курс, место в плашке берем с карточки */
  var cardPage = !!document.querySelector('.mcard');
  var rail = document.querySelector('.rail');
  var railLinks = rail ? Array.prototype.slice.call(rail.querySelectorAll('a')) : [];
  var dock = document.getElementById('dock');
  var dockNum = document.getElementById('dock-num');
  var dockTitle = document.getElementById('dock-title');
  var dockMeta = document.getElementById('dock-meta');
  var dockLink = document.getElementById('dock-link');
  var current = 0;
  var banner = document.getElementById('consent');

  function syncDock() {
    if (!dock) return;
    dock.hidden = !current || (banner && !banner.hidden);
  }

  function placeOf(rank) {
    var badge = cardPage && document.querySelector('#kurs-' + rank + ' .mcard-rank');
    return badge ? badge.textContent : rank;
  }

  function setCurrent(rank) {
    if (rank === current) return;
    current = rank;
    var c = data[rank - 1];
    if (!cardPage) body.style.setProperty('--page', c ? c.color : 'var(--bg)');
    railLinks.forEach(function (a) {
      a.classList.toggle('is-active', Number(a.getAttribute('data-rank')) === rank);
    });
    if (rail) rail.classList.toggle('is-on', !!c);
    syncDock();
    if (dock && c) {
      dockNum.textContent = placeOf(c.rank);
      dockNum.parentNode.style.setProperty('--c', c.color);
      dockTitle.textContent = c.short;
      dockMeta.textContent = c.school + ' · ' + c.score;
      dockLink.href = c.url;
      dockLink.setAttribute('data-course', c.rank);
      dockLink.setAttribute('data-school', c.school);
    }
  }

  if ('IntersectionObserver' in window) {
    /* Фон страницы перетекает в цвет курса, который сейчас в центре экрана */
    root.classList.add('morph');
    var watch = new IntersectionObserver(
      function (list) {
        list.forEach(function (item) {
          if (!item.isIntersecting) return;
          setCurrent(Number(item.target.getAttribute('data-rank')) || 0);
        });
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    tinted.forEach(function (el) {
      watch.observe(el);
    });

    /* Появление цифры, печати и полос оценок */
    if (!reduce) {
      var reveal = new IntersectionObserver(
        function (list) {
          list.forEach(function (item) {
            if (!item.isIntersecting) return;
            item.target.classList.remove('await');
            reveal.unobserve(item.target);
          });
        },
        { rootMargin: '0px 0px -20% 0px' }
      );
      courses.forEach(function (el) {
        if (el.getBoundingClientRect().top > window.innerHeight) {
          el.classList.add('await');
          reveal.observe(el);
        }
      });
    }
  }

  /* Подбор под задачу */
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var directions = Array.prototype.slice.call(document.querySelectorAll('.direction'));
  var status = document.getElementById('filter-status');
  var currentFilter = 'all';
  var heroSub = directions.length ? document.getElementById('hero-sub') : null;
  var baseHeading = heroSub ? heroSub.textContent : '';
  var baseTitle = document.title;
  var picks = Array.prototype.slice.call(document.querySelectorAll('.pick[data-tags]'));
  function plural(n) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'курс';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'курса';
    return 'курсов';
  }
  /* «1 лучший курс», «4 лучших курса», «7 лучших курсов» */
  function bestCourses(n) {
    var one = n % 10 === 1 && n % 100 !== 11;
    return n + (one ? ' лучший ' : ' лучших ') + plural(n);
  }
  function applyFilter(key, animate) {
    currentFilter = key;
    var run = function () {
      var shown = 0;
      courses.forEach(function (el) {
        var match = key === 'all' || el.getAttribute('data-tags').split(' ').indexOf(key) !== -1;
        el.hidden = !match;
        if (match) {
          shown++;
          el.classList.remove('await');
          /* На странице направлений места считаются заново внутри выбранного направления */
          if (directions.length) {
            var place = key === 'all' ? el.getAttribute('data-all') || el.getAttribute('data-rank') : String(shown);
            var badge = el.querySelector('.mcard-rank');
            var sr = el.querySelector('.mcard-place');
            if (badge) badge.textContent = place;
            if (sr) sr.textContent = place + ' место. ';
          }
        }
        /* «Лучший выбор» — у первого места в выбранном направлении */
        if (directions.length) el.classList.toggle('is-best', match && shown === 1);
      });
      directions.forEach(function (d) {
        var on = d.getAttribute('data-filter') === key;
        if (on) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
        /* Заголовок первого экрана и вкладки под выбранное направление */
        if (on && heroSub) {
          heroSub.textContent = d.getAttribute('data-heading');
          document.title = baseTitle.replace(baseHeading, heroSub.textContent);
        }
      });
      /* Финальный блок: три лучших курса выбранного направления */
      var picked = 0;
      picks.forEach(function (p) {
        var match = key === 'all' || p.getAttribute('data-tags').split(' ').indexOf(key) !== -1;
        p.hidden = !match || picked >= 3;
        if (!p.hidden) p.querySelector('.pick-num').textContent = ++picked;
      });
      if (cardPage && current) {
        var cur = document.getElementById('kurs-' + current);
        if (cur && cur.hidden) setCurrent(0);
        else if (dockNum) dockNum.textContent = placeOf(current);
      }
      railLinks.forEach(function (a) {
        var target = document.getElementById('kurs-' + a.getAttribute('data-rank'));
        a.hidden = target ? target.hidden : false;
      });
      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('data-filter') === key));
      });
      var label = document.querySelector('[data-filter="' + key + '"]').firstChild.textContent.trim();
      status.textContent = directions.length
        ? label + ': ' + bestCourses(shown)
        : key === 'all'
          ? 'Показаны все ' + courses.length + ' ' + plural(courses.length)
          : 'Задача «' + label + '»: ' + shown + ' ' + plural(shown) + ' из ' + courses.length + ', места в рейтинге сохранены';
    };
    if (animate && document.startViewTransition && !reduce) document.startViewTransition(run);
    else run();
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var key = chip.getAttribute('data-filter');
      applyFilter(key, true);
      store('nr-filter', key);
    });
  });
  function setDirUrl(key) {
    try {
      history.replaceState(null, '', key === 'all' ? location.pathname : location.pathname + '?dir=' + key);
    } catch (e) {}
  }

  if (directions.length) {
    /* Направления: ссылка вида b.html?dir=marketing сразу открывает нужный список — на нее можно вести рекламу */
    directions.forEach(function (d) {
      d.addEventListener('click', function (e) {
        e.preventDefault();
        var key = d.getAttribute('data-filter');
        setDirUrl(key);
        applyFilter(key, true);
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'direction_click', direction: key });
        if (typeof window.ym === 'function' && window.YM_ID) window.ym(window.YM_ID, 'reachGoal', 'direction_click', { direction: key });
      });
    });
    var dir = /[?&]dir=([\w-]+)/.exec(location.search);
    /* Старые адреса объединенных направлений (например, ?dir=business) открывают новое */
    var dirKey = dir && ((window.NR_DIR_ALIAS || {})[dir[1]] || dir[1]);
    if (dirKey && document.querySelector('.direction[data-filter="' + dirKey + '"]')) {
      applyFilter(dirKey, false);
      var target = document.getElementById('rating');
      /* Прокрутка к списку после первой отрисовки, чтобы браузер успел зафиксировать скорость загрузки */
      if (target && !location.hash) {
        var jump = function () {
          requestAnimationFrame(function () {
            target.scrollIntoView({ behavior: 'instant' });
          });
        };
        if (document.readyState === 'complete') jump();
        else window.addEventListener('load', jump);
      }
    }
  } else {
    var saved = store('nr-filter');
    if (saved && document.querySelector('[data-filter="' + saved + '"]')) applyFilter(saved, false);
  }

  /* Cookie и статистика (152-ФЗ): Метрика запускается сразу при заходе на сайт.
     Уведомление внизу экрана информирует об этом и дает отказаться на этом устройстве —
     тогда при следующих visitах Метрика не загружается. */
  var analyticsOn = false;
  function loadAnalytics() {
    var id = window.NR_YM_ID;
    if (!id || analyticsOn) return;
    analyticsOn = true;
    (function (m, e, t, r, i, k, a) {
      m[i] =
        m[i] ||
        function () {
          (m[i].a = m[i].a || []).push(arguments);
        };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + id, 'ym');
    window.ym(id, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });
    window.YM_ID = id;
  }
  function openBanner(open, focus) {
    if (!banner) return;
    banner.hidden = !open;
    syncDock();
    if (open && focus) document.getElementById('consent-all').focus({ preventScroll: true });
  }
  function decide(value) {
    store('nr-consent', value);
    store('nr-consent-at', new Date().toISOString());
    openBanner(false);
    if (value === 'out' && analyticsOn) location.reload();
    else if (value === 'all') loadAnalytics();
  }
  if (banner) {
    document.getElementById('consent-all').addEventListener('click', function () {
      decide('all');
    });
    document.getElementById('consent-min').addEventListener('click', function () {
      decide('out');
    });
    var settings = document.getElementById('cookie-settings');
    if (settings)
      settings.addEventListener('click', function () {
        openBanner(true, true);
      });
    var decision = store('nr-consent');
    if (decision !== 'out') loadAnalytics();
    if (!decision) openBanner(true);
  }

  /* Ссылка на курс, скрытый фильтром: сначала показываем все курсы */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="#kurs-"]');
    if (!link) return;
    var target = document.getElementById(link.getAttribute('href').slice(1));
    if (target && target.hidden) {
      applyFilter('all', false);
      if (directions.length) setDirUrl('all');
      else store('nr-filter', 'all');
    }
  });

  /* Клики по кнопкам курсов: цель Метрики course_click для оптимизации рекламы.
     place показывает, какая именно кнопка сработала: cta — "Подробнее о курсе" у курса,
     table — строка в таблице сравнения, pick — блок внизу страницы, dock — плашка на телефоне. */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-course]');
    if (!link) return;
    var detail = {
      rank: Number(link.getAttribute('data-course')),
      url: link.href,
      place: link.getAttribute('data-place') || '',
      school: link.getAttribute('data-school') || '',
    };
    if (directions.length) detail.direction = currentFilter;
    /* У страницы рейтинга по направлениям своя цель (NR_GOAL), чтобы конверсии страниц не смешивались */
    var goal = window.NR_GOAL || 'course_click';
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: goal,
      course_rank: detail.rank,
      course_url: detail.url,
      course_place: detail.place,
      course_school: detail.school,
      course_direction: detail.direction || '',
    });
    if (typeof window.ym === 'function' && window.YM_ID) window.ym(window.YM_ID, 'reachGoal', goal, detail);
  });
})();
