"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const CATALOG = [
  "Press banca",
  "Press militar",
  "Remo T",
  "Jalón al pecho",
  "Sentadilla",
  "Peso muerto rumano",
  "Zancadas",
  "Elevaciones laterales",
  "Curl predicador",
];

export function CommandPalettePreview() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const filtered = useMemo(
    () => CATALOG.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())),
    [q],
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pc-btn-ghost !min-h-10 text-[0.6rem]">
        ⌘K · Catálogo
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[max(4rem,12vh)] px-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute inset-0 bg-black/75"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal
              aria-label="Paleta de comandos"
              initial={{ scale: 0.65, opacity: 0, filter: "blur(12px)" }}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              exit={{ scale: 0.85, opacity: 0, filter: "blur(8px)" }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className="relative z-[1] w-full max-w-md border-2 border-[var(--pc-chalk)] bg-[var(--pc-void)] p-4 shadow-none"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="pc-caps-micro text-[var(--pc-primary)]">Spatial palette</p>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrar ejercicio…"
                className="mt-3 w-full border-b-2 border-[rgba(255,255,255,0.35)] bg-transparent py-2 text-sm font-medium text-[var(--pc-chalk)] outline-none focus:border-[var(--pc-primary)]"
              />
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                {filtered.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="pc-hover-ring flex w-full min-h-11 items-center px-2 py-2 text-left text-sm font-semibold uppercase tracking-wide text-[var(--pc-chalk)] hover:bg-[#0d0d0d]"
                      onClick={() => setOpen(false)}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="pc-caps-micro mt-3 text-[var(--pc-muted)]">Esc · cerrar · ⌘K alternar</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
