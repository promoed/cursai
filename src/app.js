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

  var courses = Array.prototype.slice.call(document.querySelectorAll('.course'));
  var tinted = Array.prototype.slice.call(document.querySelectorAll('.course, [data-tint]'));
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

  function setCurrent(rank) {
    if (rank === current) return;
    current = rank;
    var c = data[rank - 1];
    body.style.setProperty('--page', c ? c.color : 'var(--bg)');
    railLinks.forEach(function (a) {
      a.classList.toggle('is-active', Number(a.getAttribute('data-rank')) === rank);
    });
    if (rail) rail.classList.toggle('is-on', !!c);
    syncDock();
    if (dock && c) {
      dockNum.textContent = c.rank;
      dockNum.parentNode.style.setProperty('--c', c.color);
      dockTitle.textContent = c.short;
      dockMeta.textContent = c.school + ' · ' + c.score;
      dockLink.href = c.url;
      dockLink.setAttribute('data-course', c.rank);
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
  var status = document.getElementById('filter-status');
  function plural(n) {
    var m10 = n % 10;
    var m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'курс';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'курса';
    return 'курсов';
  }
  function applyFilter(key, animate) {
    var run = function () {
      var shown = 0;
      courses.forEach(function (el) {
        var match = key === 'all' || el.getAttribute('data-tags').split(' ').indexOf(key) !== -1;
        el.hidden = !match;
        if (match) {
          shown++;
          el.classList.remove('await');
        }
      });
      railLinks.forEach(function (a) {
        var target = document.getElementById('kurs-' + a.getAttribute('data-rank'));
        a.hidden = target ? target.hidden : false;
      });
      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('data-filter') === key));
      });
      var label = document.querySelector('[data-filter="' + key + '"]').firstChild.textContent.trim();
      status.textContent =
        key === 'all'
          ? 'Показаны все 10 курсов'
          : 'Задача «' + label + '»: ' + shown + ' ' + plural(shown) + ' из 10, места в рейтинге сохранены';
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
  var saved = store('nr-filter');
  if (saved && document.querySelector('[data-filter="' + saved + '"]')) applyFilter(saved, false);

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
      store('nr-filter', 'all');
    }
  });

  /* Клики по кнопкам курсов: событие для аналитики */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-course]');
    if (!link) return;
    var detail = { rank: Number(link.getAttribute('data-course')), url: link.href };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'course_click', course_rank: detail.rank, course_url: detail.url });
    if (typeof window.ym === 'function' && window.YM_ID) window.ym(window.YM_ID, 'reachGoal', 'course_click', detail);
  });
})();
