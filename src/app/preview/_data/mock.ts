export const coach = {
  name: "Javier Morales",
  initials: "JM",
  title: "Head Coach",
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
  { id: "4", name: "Tomás Ríos", initials: "TR", plan: "Cutting · Semana 4", adherence: 96, lastCheckin: "Hoy", status: "on-track", streak: 42 },
  { id: "5", name: "Camila Vera", initials: "CV", plan: "Full Body 3x", adherence: 61, lastCheckin: "6 días", status: "attention", streak: 2 },
  { id: "6", name: "Nicolás Soto", initials: "NS", plan: "Atleta · Bloque A", adherence: 90, lastCheckin: "Ayer", status: "on-track", streak: 21 },
  { id: "7", name: "Agustina Luna", initials: "AL", plan: "Movilidad + Core", adherence: 55, lastCheckin: "9 días", status: "inactive", streak: 0 },
  { id: "8", name: "Felipe Acuña", initials: "FA", plan: "Push/Pull/Legs", adherence: 83, lastCheckin: "2 días", status: "on-track", streak: 11 },
];

export const metrics = [
  { label: "Clientes activos", value: "48", delta: "+6 este mes", good: true },
  { label: "Adherencia promedio", value: "87%", delta: "+3.2% vs mes pasado", good: true },
  { label: "Check-ins esta semana", value: "124", delta: "32 pendientes", good: false },
  { label: "MRR", value: "$4.820", delta: "+$620", good: true },
];

export const weeklyActivity = [38, 52, 48, 71, 63, 44, 28];
export const weeklyLabels = ["L", "M", "M", "J", "V", "S", "D"];

export const clientDetail = {
  name: "Lucía Fernández",
  initials: "LF",
  age: 28,
  goal: "Hipertrofia — ganar 4kg masa magra",
  since: "Enero 2026",
  adherence: 94,
  streak: 28,
  nextSession: "Mañana · 07:30",
  metrics: [
    { label: "Peso", value: "62.4 kg", delta: "+1.8 kg" },
    { label: "% Grasa", value: "19.2%", delta: "-2.1%" },
    { label: "Brazo", value: "31.5 cm", delta: "+1.2 cm" },
    { label: "Cintura", value: "71.0 cm", delta: "-1.5 cm" },
  ],
  checkins: [
    { date: "Hoy", text: "Semana 8. Piernas volaron, banca subió a 52.5kg x 5. Energía 9/10.", mood: "great" },
    { date: "Hace 7 días", text: "Ajuste de macros — subí carbs +30g intra. Sueño mejoró.", mood: "good" },
    { date: "Hace 14 días", text: "Dolor leve en hombro derecho, modifiqué press inclinado.", mood: "mid" },
  ],
};

export const workoutDay = {
  name: "Día 2 · Empuje",
  duration: "65 min",
  blocks: [
    {
      letter: "A",
      title: "Activación",
      exercises: [
        { name: "Band pull-apart", sets: "2 x 15", notes: "Control" },
      ],
    },
    {
      letter: "B",
      title: "Fuerza principal",
      exercises: [
        { name: "Press banca", sets: "5 x 5", notes: "RPE 8 · 52.5kg" },
        { name: "Press militar", sets: "4 x 6", notes: "RPE 7" },
      ],
    },
    {
      letter: "C",
      title: "Hipertrofia",
      exercises: [
        { name: "Press inclinado mancuernas", sets: "3 x 10", notes: "Pausa 1s" },
        { name: "Elevaciones laterales", sets: "4 x 12", notes: "Drop final" },
        { name: "Fondos lastrados", sets: "3 x 8", notes: "+10kg" },
      ],
    },
    {
      letter: "D",
      title: "Accesorios",
      exercises: [
        { name: "Tríceps polea", sets: "3 x 15", notes: "Superset" },
        { name: "Face pull", sets: "3 x 15", notes: "Superset" },
      ],
    },
  ],
};
