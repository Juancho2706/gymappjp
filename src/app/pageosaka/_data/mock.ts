export const mockPlayer = {
  name: "Joaquín M.",
  level: 14,
  xpCurrent: 2840,
  xpTarget: 4000,
  xpPct: 72,
  coins: 28,
  coinsLabel: "clients",
};

export const mockMissionMain = {
  stage: "STAGE 03 · 01",
  jp: "メイン",
  titleLines: ["PUSH", "DAY"] as const,
  sub: "Chest · Shoulders · Triceps",
  difficultyStars: 3,
  enemies: [
    { n: "01", name: "Barbell Bench Press", hp: "4×8" },
    { n: "02", name: "Incline DB Press", hp: "3×10" },
    { n: "03", name: "Face Pull", hp: "4×15" },
  ],
  enemiesMore: 3,
};

export const mockSideMissions = [
  { tag: "BONUS" as const, name: ["Cardio", "Zone 2"] as const, meta: "20 min · +40 XP" },
  { tag: "DAILY" as const, name: ["Mobility", "Flow"] as const, meta: "10 min · +20 XP" },
];

export const mockScores = {
  jp: "個人記録",
  badge: "W3 · APR",
  combo: 12,
  stats: [
    { val: "47", lbl: "Stages cleared" },
    { val: "8,460", lbl: "Total XP", tone: "red" as const },
    { val: "96%", lbl: "Adherence", tone: "mint" as const },
  ],
  prRows: [
    {
      rank: "01",
      top: true,
      name: "Bench Press",
      sub: "+2.5 KG · 2 DAYS AGO",
      value: "85",
      unit: "KG × 8",
    },
    {
      rank: "02",
      name: "Barbell Squat",
      sub: "+5 KG · 5 DAYS AGO",
      value: "120",
      unit: "KG × 5",
    },
    {
      rank: "03",
      name: "Deadlift",
      sub: "+2.5 KG · 8 DAYS AGO",
      value: "140",
      unit: "KG × 3",
    },
    {
      rank: "04",
      name: "OHP",
      sub: "+1.25 KG · 12 DAYS AGO",
      value: "55",
      unit: "KG × 6",
    },
  ],
  achievement: {
    kick: "achievement unlocked",
    name: "10-Day Streak",
  },
};

export const mockPalette = [
  { name: "Ivory", hex: "#FAF6EC", bg: "#FAF6EC" },
  { name: "Black", hex: "#0D0D0D", bg: "#0D0D0D" },
  { name: "Red", hex: "#E91B24", bg: "#E91B24" },
  { name: "Yellow", hex: "#F5DC00", bg: "#F5DC00" },
  { name: "Mint", hex: "#3DD9A8", bg: "#3DD9A8" },
];

export const principles: { n: string; strong: string; rest: string }[] = [
  {
    n: "01",
    strong: "Gamificación elegante.",
    rest: " Combos, XP, missions, stages — sí. Pero sin neón rosa ni sonidos 8-bit. El arcade se referencia con tipografía y layout, no con stock-icons de videojuegos.",
  },
  {
    n: "02",
    strong: "Sombras duras.",
    rest: " Nunca box-shadow con blur. Siempre offset sólido (4–8px) en negro puro. Le da peso físico a cada elemento, como stickers en un gabinete arcade.",
  },
  {
    n: "03",
    strong: "Kanji como acento.",
    rest: " Nunca para contenido crítico. Siempre como decoración con significado (大阪 = Osaka, 選択 = select, 記録 = records). El usuario no necesita leerlo — le aporta carácter.",
  },
];
