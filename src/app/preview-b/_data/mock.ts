export const coach = {
  name: "Marina Costa",
  initials: "MC",
  brand: "Estudio Norte",
};

export type MockClient = {
  id: string;
  name: string;
  initials: string;
  plan: string;
  adherence: number;
  lastCheckin: string;
  status: "on-track" | "attention" | "inactive";
  streak: number;
};

export const clients: MockClient[] = [
  { id: "1", name: "Lucía Fernández", initials: "LF", plan: "Hipertrofia 12S", adherence: 94, lastCheckin: "Hoy", status: "on-track", streak: 28 },
  { id: "2", name: "Martín Herrera", initials: "MH", plan: "Recomp · Fase 2", adherence: 88, lastCheckin: "Ayer", status: "on-track", streak: 14 },
  { id: "3", name: "Sofía Paredes", initials: "SP", plan: "Fuerza 5/3/1", adherence: 72, lastCheckin: "3 días", status: "attention", streak: 6 },
  { id: "4", name: "Tomás Ríos", initials: "TR", plan: "Cutting · S4", adherence: 96, lastCheckin: "Hoy", status: "on-track", streak: 42 },
];

export const metrics = [
  { label: "Alumnos activos", value: "48", delta: "+6 este mes", good: true },
  { label: "Adherencia media", value: "87%", delta: "+3.2% vs mes anterior", good: true },
  { label: "Check-ins semana", value: "124", delta: "32 pendientes", good: false },
];

export const weeklyActivity = [38, 52, 48, 71, 63, 44, 28];
export const weeklyLabels = ["L", "M", "M", "J", "V", "S", "D"];

export const clientDetail = {
  name: "Lucía Fernández",
  initials: "LF",
  goal: "Hipertrofia — masa magra",
  since: "Enero 2026",
  adherence: 94,
  streak: 28,
  nextSession: "Mañana · 07:30",
  pullQuote: "La adherencia subió cuando pasamos a bloques más cortos los miércoles.",
  metrics: [
    { label: "Peso", value: "62.4 kg", delta: "+1.8 kg" },
    { label: "% Grasa", value: "19.2%", delta: "-2.1%" },
  ],
  checkins: [
    { date: "Hoy", text: "Semana 8. Piernas bien. Banca 52.5×5.", mood: "great" },
    { date: "Hace 7 días", text: "+30g carbs intra. Sueño mejor.", mood: "good" },
  ],
};

export const workoutDay = {
  name: "Día 2 · Empuje",
  duration: "65 min",
  blocks: [
    {
      letter: "A",
      title: "Activación",
      exercises: [{ name: "Band pull-apart", sets: "2 × 15", notes: "Control" }],
    },
    {
      letter: "B",
      title: "Fuerza principal",
      exercises: [
        { name: "Press banca", sets: "5 × 5", notes: "RPE 8" },
        { name: "Press militar", sets: "4 × 6", notes: "RPE 7" },
      ],
    },
    {
      letter: "C",
      title: "Hipertrofia",
      exercises: [
        { name: "Press inclinado", sets: "3 × 10", notes: "Pausa 1s" },
        { name: "Elevaciones laterales", sets: "4 × 12", notes: "Drop final" },
      ],
    },
  ],
};
