/*
 * First-run demo data so the gacha is playable before any real illustrations
 * have been added through the admin screen. Safe to delete entries for from
 * the admin screen once you add your own art.
 */
(function (global) {
  function placeholderImage(text, colorA, colorB) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${colorA}"/>
            <stop offset="100%" stop-color="${colorB}"/>
          </linearGradient>
        </defs>
        <rect width="400" height="400" fill="url(#g)"/>
        <text x="50%" y="55%" font-size="120" font-family="'Segoe UI', sans-serif"
          fill="#ffffff" fill-opacity="0.9" text-anchor="middle" dominant-baseline="middle">${text}</text>
      </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  const DEMO_ITEMS = [
    {
      name: 'ちいさな旅ネコ',
      rarity: 'N',
      author: 'サンプル作家A',
      flavorText: 'どこへでもふらっと出かける、気まぐれな旅の相棒。',
      colors: ['#8bd3c7', '#4fa3a1'],
    },
    {
      name: 'そよ風のうさぎ',
      rarity: 'N',
      author: 'サンプル作家A',
      flavorText: '草原を駆け抜けると、あたたかい風のにおいがする。',
      colors: ['#a5d8ff', '#4dabf7'],
    },
    {
      name: '夜更かしフクロウ',
      rarity: 'R',
      author: 'サンプル作家B',
      flavorText: '誰よりも夜が好き。星を数えるのが日課。',
      colors: ['#7f7fd5', '#4b3f72'],
    },
    {
      name: 'あめふらし雲',
      rarity: 'R',
      author: 'サンプル作家B',
      flavorText: '機嫌が悪いとすぐ泣いてしまう、ちょっと涙もろい雲。',
      colors: ['#89f7fe', '#66a6ff'],
    },
    {
      name: '花霞の狐',
      rarity: 'SR',
      author: 'サンプル作家C',
      flavorText: '桜が満開になる夜だけ、姿を見せるという言い伝え。',
      colors: ['#ff9a9e', '#fecfef'],
    },
    {
      name: '深海のクラゲ姫',
      rarity: 'SR',
      author: 'サンプル作家C',
      flavorText: '深い海の底で静かに光る、誰も知らない王国の主。',
      colors: ['#43cea2', '#185a9d'],
    },
    {
      name: '黄金の麒麟',
      rarity: 'SSR',
      author: 'サンプル作家D',
      flavorText: '千年に一度、幸運を運ぶ者の前にだけ現れるという。',
      colors: ['#f6d365', '#fda085'],
    },
    {
      name: '星屑の竜',
      rarity: 'SSR',
      author: 'サンプル作家D',
      flavorText: '銀河のかけらを集めて生まれた、伝説の竜。',
      colors: ['#a18cd1', '#fbc2eb'],
    },
  ];

  async function seedIfEmpty() {
    const count = await GachaDB.ItemsStore.count();
    if (count > 0) return;
    const items = DEMO_ITEMS.map((d, i) => ({
      id: 'demo-' + (i + 1),
      name: d.name,
      rarity: d.rarity,
      author: d.author,
      flavorText: d.flavorText,
      image: placeholderImage(d.name.slice(0, 2), d.colors[0], d.colors[1]),
      createdAt: Date.now() + i,
    }));
    await GachaDB.ItemsStore.bulkPut(items);
  }

  global.GachaSeed = { seedIfEmpty, placeholderImage };
})(window);
