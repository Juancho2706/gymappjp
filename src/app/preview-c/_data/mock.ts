export const clients = [
  { id: "1", name: "Lucía Fernández", initials: "LF", plan: "Hipertrofia 12S", adherence: 94, streak: 28 },
  { id: "2", name: "Martín Herrera", initials: "MH", plan: "Recomp F2", adherence: 88, streak: 14 },
  { id: "3", name: "Sofía Paredes", initials: "SP", plan: "5/3/1", adherence: 72, streak: 6 },
];

export const workoutNodes = [
  { id: "d1", label: "D1", sub: "Pull", x: 12, y: 18 },
  { id: "d2", label: "D2", sub: "Push", x: 42, y: 22 },
  { id: "d3", label: "D3", sub: "Legs", x: 72, y: 16 },
  { id: "d4", label: "D4", sub: "Rest", x: 54, y: 48 },
];

export const workoutDay = {
  name: "Día 2 · Push",
  blocks: [
    { letter: "A", title: "Principal", exercises: ["Press banca 5×5", "Press militar 4×6"] },
    { letter: "B", title: "Volumen", exercises: ["Inclinado 3×10", "Laterales 4×12"] },
  ],
};
