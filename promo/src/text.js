// On-screen copy per language. *word* = accent colour, | = line break.
export const TEXT = {
  he: {
    dir: 'rtl',
    hook: 'איפה *הכיתה?*',
    hookKicker: 'יום ראשון בבגין',
    maze: 'הכול נראה|*אותו דבר*',
    revealSub: 'המפה החכמה של בית הספר',
    search: ['מקלידים.', 'בוחרים.', '*יוצאים לדרך.*'],
    room: 'דולפין',
    routeMeta: (m) => `כ־${m} מ׳ · 1 דק׳ הליכה`,
    start: '*מתחילים*|מאיפה שאתם',
    here: 'אתם כאן',
    chips: ['שירותים קרובים', 'מזכירות ראשית', 'ממ"ד קרוב'],
    view3d: '*תלת־ממד*|ותמונות אמיתיות',
    photoCaptions: ['החצר הפנימית', 'הכניסה לבית הספר', 'מסדרון חט"ב', 'אשכול פיס', 'אולם הספורט', 'החצר, הצד המזרחי'],
    langs: ['עברית', 'Русский', 'English'],
    tagline: 'פחות לחפש.|*יותר להגיע.*',
    cta: 'פתחו *עכשיו*',
    ctaSub: 'בחינם · מכל טלפון',
    qrTitle: 'סרקו ונסו',
    creditsLabel: 'יוצרי האפליקציה',
    ideaLabel: 'הרעיון לסרטון',
    endSub: 'הדרך שלכם בבית הספר בגין',
    // word indices in the VO lines that visuals lock onto
    sync: {
      maze: 3, revealLogo: 2, revealSub: 4, search: [0, 4, 5], startTap: 4, startRoute: 7, startHead: 8,
      chips: [0, 1, 3], chipPress: 6, v3dTap: 4, v3dCards: 7, langs: [0, 1, 2], tag1: 2, tag2: 4, ctaSub: 2,
    },
    sync30: { revealLogo: 2, revealSub: 3, search: [0, 2, null], chips: [0, 1, 2], chipPress: null, v3dTap: 1, v3dCards: 3, tag1: 0, tag2: 2, ctaSub: null },
    capMerge: [['בגין', 'מאפ', 'Begin Map']],
    capReplace: {},
  },
  ru: {
    dir: 'ltr',
    hScale: 0.8,
    hook: 'Где мой|*кабинет?*',
    hookKicker: 'Первый день в Бегине',
    maze: 'Всё выглядит|*одинаково*',
    revealSub: 'Умная карта школы',
    search: ['Вводите.', 'Выбираете.', '*Идёте.*'],
    room: 'Дольфин',
    routeMeta: (m) => `≈${m} м · 1 мин пешком`,
    start: '*Старт*|там, где вы',
    here: 'Вы здесь',
    chips: ['Ближайший туалет', 'Главный офис', 'Ближайшее убежище'],
    view3d: '*3D*|и настоящие фото',
    photoCaptions: ['Внутренний двор', 'Вход в школу', 'Коридор средней школы', 'Эшколь Пайс', 'Спортзал', 'Двор, восточная часть'],
    langs: ['עברית', 'Русский', 'English'],
    tagline: 'Меньше искать.|*Быстрее дойти.*',
    cta: 'Открывайте|*сейчас*',
    ctaSub: 'Бесплатно · с любого телефона',
    qrTitle: 'Наведите камеру',
    creditsLabel: 'Создатели приложения',
    ideaLabel: 'Идея для видео',
    endSub: 'Ваш путь по школе Бегин',
    sync: {
      maze: 3, revealLogo: 1, revealSub: 3, search: [0, 3, 5], startTap: 3, startRoute: 7, startHead: 8,
      chips: [0, 1, 4], chipPress: 6, v3dTap: 3, v3dCards: 6, langs: [1, 2, 4], tag1: 2, tag2: 4, ctaSub: 2,
    },
    sync30: { revealLogo: 1, revealSub: 2, search: [0, 2, null], chips: [0, 1, 2], chipPress: null, v3dTap: 2, v3dCards: 4, tag1: 0, tag2: 2, ctaSub: null },
    capMerge: [['Бегин', 'Мэп', 'Begin Map']],
    capReplace: { 'три-дэ': '3D' },
  },
};

export const PHOTOS = [
  'public/photos/yard/yard-4-c.jpg',
  'public/photos/gate/gate-2.jpg',
  'public/photos/htb/htb-1-b.jpg',
  'public/photos/eshkol/eshkol-4.jpg',
  'public/photos/hall/hall-4-b.jpg',
  'public/photos/yard/yard-10-c.jpg',
];

// Scene starts (s) and VO cue times — shared by every language so the music fits all.
// A scene with zero length is skipped (the 30-second cut drops maze, start, languages and the CTA).
export const T = {
  hook: 0, maze: 8, reveal: 14, search: 20, route: 26, start: 32, chips: 40, view3d: 48, langs: 56, tagline: 60, cta: 64.6, end: 70, total: 74,
};
export const VO_AT = {
  hook: 0.7, maze: 8.3, reveal: 15.2, search: 20.6, route: 26.6, start: 32.4, chips: 40.3, view3d: 48.4, langs: 56.3, tagline: 60.4, cta: 65.0,
};

export const EDITS = {
  full: { T, VO_AT },
  // "liquid light" cut: tighter pacing, same narration
  silk: {
    T: { hook: 0, maze: 6, reveal: 11, search: 17, route: 22.5, start: 28.5, chips: 34.5, view3d: 41, langs: 48, tagline: 51, cta: 55.5, end: 59, total: 62.5 },
    VO_AT: { hook: 0.6, maze: 6.1, reveal: 12.8, search: 17.3, route: 22.8, start: 28.8, chips: 34.8, view3d: 41.3, langs: 48.2, tagline: 51.3, cta: 55.8 },
  },
  // story cut: clouds -> a student on the first day -> the app on the phone -> AR route
  story: {
    T: { intro: 0, lost: 7.2, app: 12.1, search: 16.5, route: 21.9, start: 27.3, chips: 33.3, view3d: 39.7, langs: 46.5, tagline: 49.7, cta: 54.5, end: 58.6, total: 62.6 },
    VO_AT: { hook: 2.4, maze: 7.4, reveal: 12.35, search: 16.7, route: 22.1, start: 27.5, chips: 33.5, view3d: 39.9, langs: 46.7, tagline: 49.95, cta: 54.7 },
  },
  30: {
    T: { hook: 0, maze: 4, reveal: 4, search: 8, route: 12.5, start: 17.5, chips: 17.5, view3d: 21, langs: 23.5, tagline: 23.5, cta: 27, end: 27, total: 30 },
    VO_AT: { hook: 0.4, reveal: 5.0, search: 8.4, route: 12.9, chips: 17.8, view3d: 21.05, tagline: 23.85, cta: 27.2 },
  },
};
