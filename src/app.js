(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  systemDark.addEventListener && systemDark.addEventListener('change', syncToggle);
  syncToggle();

  /* Табло: перелистывание цифр при загрузке */
  document.querySelectorAll('[data-flap]').forEach(function (el, row) {
    var value = el.getAttribute('data-flap');
    el.textContent = '';
    var cells = value.split('').map(function (ch) {
      var span = document.createElement('span');
      var sep = !/\d/.test(ch);
      span.className = 'flap' + (sep ? ' is-sep' : '');
      span.textContent = ch;
      el.appendChild(span);
      return { el: span, ch: ch, sep: sep };
    });
    el.setAttribute('aria-label', value);
    if (reduce) return;
    cells.forEach(function (cell, i) {
      if (cell.sep) return;
      var flips = 8 + row * 3 + i * 4;
      var n = 0;
      cell.el.textContent = String(Math.floor(Math.random() * 10));
      setTimeout(function step() {
        n++;
        cell.el.classList.remove('tick');
        void cell.el.offsetWidth;
        cell.el.classList.add('tick');
        cell.el.textContent = n >= flips ? cell.ch : String((Number(cell.el.textContent) + 1) % 10);
        if (n < flips) setTimeout(step, 55);
      }, 350 + row * 60);
    });
  });

  /* Шапка с линией после прокрутки */
  var top = document.querySelector('.top');
  var onScroll = function () {
    top.classList.toggle('is-stuck', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Места рейтинга: заливка цифры, полосы и счетчик при появлении */
  var entries = Array.prototype.slice.call(document.querySelectorAll('.entry'));
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var start = performance.now();
    var from = Math.max(0, target - 2);
    (function frame(now) {
      var t = Math.min(1, (now - start) / 900);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (from + (target - from) * eased).toFixed(1).replace('.', ',');
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(
      function (list) {
        list.forEach(function (item) {
          if (!item.isIntersecting) return;
          item.target.classList.remove('await');
          item.target.classList.add('is-in');
          countUp(item.target.querySelector('[data-count]'));
          io.unobserve(item.target);
        });
      },
      { rootMargin: '0px 0px -15% 0px' }
    );
    entries.forEach(function (entry) {
      if (entry.getBoundingClientRect().top > window.innerHeight) {
        entry.classList.add('await');
        io.observe(entry);
      }
    });
  }

  /* Подбор под задачу */
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var status = document.getElementById('filter-status');
  entries.forEach(function (entry, i) {
    entry.style.viewTransitionName = 'entry-' + (i + 1);
  });
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
      entries.forEach(function (entry) {
        var match = key === 'all' || entry.getAttribute('data-tags').split(' ').indexOf(key) !== -1;
        entry.hidden = !match;
        if (match) {
          shown++;
          entry.classList.remove('await');
        }
      });
      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('data-filter') === key));
      });
      var label = document.querySelector('[data-filter="' + key + '"]').firstChild.textContent.trim();
      status.textContent =
        key === 'all'
          ? 'Показаны все 10 курсов'
          : 'Задача «' + label + '»: ' + shown + ' ' + plural(shown) + ' из 10, места сохранены';
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

  /* Нижняя панель с лидером рейтинга */
  var dock = document.getElementById('dock');
  var hero = document.querySelector('.hero');
  var final = document.querySelector('.final');
  if ('IntersectionObserver' in window && dock) {
    var visible = { hero: true, final: false };
    var watch = new IntersectionObserver(function (list) {
      list.forEach(function (item) {
        visible[item.target === hero ? 'hero' : 'final'] = item.isIntersecting;
      });
      dock.hidden = visible.hero || visible.final;
    });
    watch.observe(hero);
    watch.observe(final);
  }

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
