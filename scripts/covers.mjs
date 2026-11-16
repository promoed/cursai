// Обложки курсов в спокойном тоновом стиле: node scripts/covers.mjs images → images/art-N.svg (N — номер курса).
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const P = ['#FFD23F', '#FF7A59', '#9C8CFF', '#3DD6A0', '#5AB0FF', '#FF8FC7', '#B8E04A', '#FFAA4C', '#6FD3E6', '#C79BFF'];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (c, k, base = '#262626') => {
  const a = hex(c), b = hex(base);
  return '#' + a.map((v, i) => Math.round(v * k + b[i] * (1 - k)).toString(16).padStart(2, '0')).join('');
};
const spark = (x, y, r, f) => `<path d="M${x} ${y - r}c${r * 0.1} ${r * 0.6} ${r * 0.4} ${r * 0.9} ${r} ${r}-${r * 0.6} ${r * 0.1}-${r * 0.9} ${r * 0.4}-${r} ${r}-${r * 0.1}-${r * 0.6}-${r * 0.4}-${r * 0.9}-${r}-${r} ${r * 0.6}-${r * 0.1} ${r * 0.9}-${r * 0.4} ${r}-${r}z" fill="${f}"/>`;
const rings = (c, n = 2) => `<g fill="none" stroke="${c}" stroke-opacity=".16" stroke-width="3">${[...Array(n)].map((_, i) => `<circle cx="800" cy="560" r="${360 + i * 120}"/>`).join('')}</g>`;
// k: bg, t1 (глубокий тон), t2 (средний), a (акцент — чистый цвет)
const M = {
  1: (k) => `${rings(k.a)}<circle cx="800" cy="720" r="290" fill="${k.t1}"/><circle cx="800" cy="720" r="185" fill="${k.t2}"/><rect x="-4000" y="720" width="9600" height="4000" fill="${k.bg}"/><path d="M370 720h860" stroke="${k.a}" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"/>${spark(1050, 330, 60, k.a)}`,
  2: (k) => `<rect x="580" y="320" width="370" height="370" rx="74" fill="${k.t1}" transform="rotate(-14 765 505)"/><rect x="625" y="365" width="370" height="370" rx="74" fill="${k.t2}" transform="rotate(-4 810 550)"/><rect x="670" y="410" width="370" height="370" rx="74" fill="${k.a}" transform="rotate(7 855 595)"/>${spark(855, 595, 62, k.bg)}`,
  3: (k) => `<g fill="none" stroke="${k.a}" stroke-width="4"><circle cx="800" cy="560" r="160" stroke-opacity=".6"/><circle cx="800" cy="560" r="275" stroke-opacity=".35"/><circle cx="800" cy="560" r="390" stroke-opacity=".18"/></g><circle cx="800" cy="560" r="90" fill="${k.a}"/><circle cx="1072" cy="514" r="24" fill="${k.t2}"/><circle cx="560" cy="755" r="16" fill="${k.a}"/><circle cx="905" cy="185" r="12" fill="${k.t2}"/>`,
  // 4 маркетинг: волны сигнала из точки
  4: (k) => `<g fill="none" stroke-linecap="round" stroke-width="34"><path d="M760 400a190 190 0 0 1 0 320" stroke="${k.t1}"/><path d="M860 300a330 330 0 0 1 0 520" stroke="${k.t2}"/></g><circle cx="640" cy="560" r="110" fill="${k.a}"/>${spark(1110, 300, 46, k.a)}`,
  // 5 ИИ-агенты: три узла, связанные линиями
  5: (k) => `<path d="M560 700L800 380L1040 700Z" fill="none" stroke="${k.t2}" stroke-width="10" stroke-linejoin="round"/><circle cx="560" cy="700" r="90" fill="${k.t1}"/><circle cx="1040" cy="700" r="90" fill="${k.t2}"/><circle cx="800" cy="380" r="110" fill="${k.a}"/>${spark(800, 380, 44, k.bg)}`,
  // 6 рабочие задачи: полосы-список
  6: (k) => `<rect x="560" y="300" width="480" height="520" rx="60" fill="${k.t1}"/><rect x="630" y="400" width="300" height="44" rx="22" fill="${k.a}"/><rect x="630" y="490" width="340" height="44" rx="22" fill="${k.t2}"/><rect x="630" y="580" width="250" height="44" rx="22" fill="${k.t2}"/><rect x="630" y="670" width="200" height="44" rx="22" fill="${k.t2}" fill-opacity=".6"/>`,
  // 7 специалист по ИИ: квадрат в квадрате (чип)
  7: (k) => `<rect x="540" y="300" width="520" height="520" rx="90" fill="${k.t1}"/><rect x="640" y="400" width="320" height="320" rx="60" fill="${k.t2}"/>${spark(800, 560, 100, k.a)}`,
  // 8 ChatGPT: два пузыря
  8: (k) => `<rect x="500" y="320" width="440" height="250" rx="125" fill="${k.t2}"/><rect x="680" y="560" width="440" height="250" rx="125" fill="${k.a}"/><circle cx="830" cy="685" r="20" fill="${k.bg}"/><circle cx="900" cy="685" r="20" fill="${k.bg}"/><circle cx="970" cy="685" r="20" fill="${k.bg}"/>`,
  // 9 бизнес: ступени роста
  9: (k) => `<rect x="520" y="620" width="170" height="200" rx="30" fill="${k.t1}"/><rect x="715" y="490" width="170" height="330" rx="30" fill="${k.t2}"/><rect x="910" y="340" width="170" height="480" rx="30" fill="${k.a}"/>${spark(600, 420, 50, k.a)}`,
  // 10 внедрение: два сцепленных кольца
  10: (k) => `<g fill="none" stroke-width="60"><circle cx="690" cy="560" r="170" stroke="${k.t2}"/><circle cx="910" cy="560" r="170" stroke="${k.a}"/></g><path d="M800 430a170 170 0 0 1 0 260" fill="none" stroke="${k.t2}" stroke-width="60"/>`,
  // 11 DS расширенный: точки и линия тренда
  11: (k) => `${[[560, 740, 'a'], [640, 660, 't2'], [720, 690, 't1'], [790, 590, 'a'], [860, 610, 't2'], [930, 500, 't1'], [1000, 470, 'a'], [1060, 380, 't2']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="${c === 'a' ? 30 : 22}" fill="${k[c]}"/>`).join('')}<path d="M520 790L1100 330" stroke="${k.a}" stroke-opacity=".5" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 22"/>`,
  // 12 DS + ИИ: три столбца и искра
  12: (k) => `<rect x="560" y="560" width="130" height="260" rx="40" fill="${k.t1}"/><rect x="735" y="440" width="130" height="380" rx="40" fill="${k.t2}"/><rect x="910" y="330" width="130" height="490" rx="40" fill="${k.a}"/>${spark(640, 360, 56, k.a)}`,
  // 13 DS Eduson: диаграмма-круг с сектором
  13: (k) => `<circle cx="800" cy="560" r="260" fill="${k.t1}"/><path d="M800 560V300a260 260 0 0 1 252 195z" fill="${k.a}"/><circle cx="800" cy="560" r="110" fill="${k.bg}"/>`,
  // 14 DS GB: сетка 3×3 с одной ячейкой-акцентом
  14: (k) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${560 + c * 170}" y="${320 + r * 170}" width="140" height="140" rx="34" fill="${r === 1 && c === 2 ? k.a : (r + c) % 2 ? k.t2 : k.t1}"/>`).join('')).join(''),
  // 15 DS с нуля: стопка дисков (данные)
  15: (k) => [[k.t1, 700], [k.t2, 560], [k.a, 420]].map(([f, y]) => `<path d="M590 ${y}v80a210 56 0 0 0 420 0v-80" fill="${f}"/><ellipse cx="800" cy="${y}" rx="210" ry="56" fill="${f}"/><ellipse cx="800" cy="${y}" rx="210" ry="56" fill="#fff" fill-opacity=".08"/>`).join(''),
  // 16 дизайн расширенный: кривая Безье и точки
  16: (k) => `<path d="M540 760C580 420 840 330 1080 360" fill="none" stroke="${k.a}" stroke-width="16" stroke-linecap="round"/><circle cx="540" cy="760" r="34" fill="${k.t2}"/><circle cx="1080" cy="360" r="34" fill="${k.t2}"/><circle cx="1000" cy="680" r="120" fill="${k.t1}"/>`,
  // 17 дизайнер: три пересекающихся круга (смешение цвета)
  17: (k) => `<circle cx="720" cy="490" r="190" fill="${k.t1}"/><circle cx="880" cy="490" r="190" fill="${k.t2}" fill-opacity=".85"/><circle cx="800" cy="640" r="190" fill="${k.a}" fill-opacity=".85"/>`,
  // 18 дизайнер с AI: композиция прямоугольников (макет)
  18: (k) => `<rect x="520" y="320" width="560" height="500" rx="56" fill="${k.t1}"/><rect x="580" y="380" width="260" height="220" rx="32" fill="${k.a}"/><rect x="870" y="380" width="150" height="40" rx="20" fill="${k.t2}"/><rect x="870" y="450" width="110" height="40" rx="20" fill="${k.t2}"/><rect x="580" y="640" width="440" height="120" rx="32" fill="${k.t2}"/>`,
  // 19 ИИ-дизайнер: рамка с солнцем и искрой (генерация изображения)
  19: (k) => `<rect x="540" y="330" width="460" height="460" rx="60" fill="${k.t1}" transform="rotate(-6 770 560)"/><circle cx="700" cy="500" r="80" fill="${k.t2}"/><path d="M570 760l160-170 110 110 80-70 120 130z" fill="${k.t2}"/>${spark(1060, 360, 80, k.a)}`,
  // 20 вводный дизайн: круг, треугольник, квадрат
  20: (k) => `<circle cx="620" cy="520" r="120" fill="${k.a}"/><path d="M820 700l140-250 140 250z" fill="${k.t2}"/><rect x="660" y="640" width="160" height="160" rx="30" fill="${k.t1}"/>`,
  // 21 агенты и автоматизация: цепочка узлов
  21: (k) => `<path d="M560 460H1040M800 460V700M560 700H1040" stroke="${k.t2}" stroke-width="10" stroke-linecap="round"/>${[[560, 460, 't1'], [800, 460, 'a'], [1040, 460, 't2'], [560, 700, 't2'], [800, 700, 't1'], [1040, 700, 'a']].map(([x, y, c]) => `<rect x="${x - 80}" y="${y - 54}" width="160" height="108" rx="40" fill="${k[c]}"/>`).join('')}`,
  // 22 агенты для бизнеса: «голова» агента и документ
  22: (k) => `<rect x="900" y="360" width="230" height="300" rx="36" fill="${k.t1}"/><rect x="940" y="420" width="150" height="24" rx="12" fill="${k.t2}"/><rect x="940" y="470" width="110" height="24" rx="12" fill="${k.t2}"/><rect x="480" y="380" width="380" height="320" rx="100" fill="${k.a}"/><circle cx="610" cy="530" r="30" fill="${k.bg}"/><circle cx="730" cy="530" r="30" fill="${k.bg}"/>`,
  // 23 нейросотрудники: три фигуры-команда
  23: (k) => `<circle cx="580" cy="500" r="80" fill="${k.t1}"/><rect x="480" y="600" width="200" height="200" rx="80" fill="${k.t1}"/><circle cx="1020" cy="500" r="80" fill="${k.t2}"/><rect x="920" y="600" width="200" height="200" rx="80" fill="${k.t2}"/><circle cx="800" cy="440" r="100" fill="${k.a}"/><rect x="675" y="565" width="250" height="250" rx="100" fill="${k.a}"/>`,
  // 24 Codex: окно терминала со знаком >_
  24: (k) => `<rect x="490" y="330" width="620" height="460" rx="56" fill="${k.t1}"/><path d="M600 480l90 80-90 80" fill="none" stroke="${k.a}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><rect x="730" y="610" width="140" height="30" rx="15" fill="${k.a}"/>${spark(1060, 330, 60, k.t2)}`,
  // 25 ИИ-креатор (Нетология): веер из трех рамок — разные форматы контента
  25: (k) => `<rect x="520" y="360" width="300" height="380" rx="44" fill="${k.t1}" transform="rotate(-12 670 550)"/><rect x="650" y="330" width="300" height="380" rx="44" fill="${k.t2}" transform="rotate(4 800 520)"/><rect x="780" y="360" width="300" height="380" rx="44" fill="${k.a}" transform="rotate(16 930 550)"/>${spark(930, 550, 56, k.bg)}`,
  // 26 AI-креатор (Contented): много инструментов — круги разного размера
  26: (k) => `<circle cx="660" cy="470" r="150" fill="${k.t1}"/><circle cx="920" cy="440" r="100" fill="${k.t2}"/><circle cx="880" cy="690" r="130" fill="${k.a}"/><circle cx="620" cy="720" r="60" fill="${k.t2}"/>`,
  // 27 AI-креатор (Skillbox): волшебная палочка
  27: (k) => `<rect x="520" y="560" width="560" height="64" rx="32" fill="${k.t2}" transform="rotate(-35 800 592)"/><rect x="900" y="360" width="150" height="64" rx="32" fill="${k.a}" transform="rotate(-35 975 392)"/>${spark(1040, 300, 70, k.a)}${spark(600, 360, 40, k.t2)}${spark(1100, 640, 34, k.t2)}`,
  // 28 AI-креатор (GB): звуковая волна — текст, видео и звук
  28: (k) => [180, 320, 460, 260, 400, 220, 340].map((h, i) => `<rect x="${520 + i * 85}" y="${560 - h / 2}" width="54" height="${h}" rx="27" fill="${i === 2 || i === 4 ? k.a : i % 2 ? k.t2 : k.t1}"/>`).join(''),
  // 29 ИИ для видео и музыки (Нетология): кнопка «плей» и нота
  29: (k) => `<circle cx="720" cy="560" r="230" fill="${k.t1}"/><path d="M660 440v240l200-120z" fill="${k.a}"/><path d="M1000 330v250" stroke="${k.t2}" stroke-width="26" stroke-linecap="round"/><path d="M1000 330l110 40v70l-110-40z" fill="${k.t2}"/><ellipse cx="960" cy="590" rx="60" ry="46" fill="${k.t2}" transform="rotate(-20 960 590)"/>`,

};for (const [n, f] of Object.entries(M)) {
  const c = P[(n - 1) % P.length];
  // Желтый в темных тонах уходит в болотный — для желтых курсов синяя основа с желтым акцентом
  const k = c === '#FFD23F' ? { bg: '#2e3768', t1: '#3b4687', t2: '#55629f', a: c } : { bg: mix(c, 0.3), t1: mix(c, 0.5), t2: mix(c, 0.72), a: c };
  writeFileSync(`${out}/art-${n}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="250 70 1100 980" preserveAspectRatio="xMidYMid meet"><rect x="-4000" y="-4000" width="9600" height="9000" fill="${k.bg}"/>${f(k)}</svg>\n`);
}
console.log('ok', Object.keys(M).length);
