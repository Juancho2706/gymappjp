"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { EvaWatermark } from "../_components/EvaWatermark";

const steps = ["Correo", "Clave", "Listo"] as const;

export default function PreviewCLoginPage() {
  const [step, setStep] = useState(0);
  const [shake, setShake] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 520);
  };

  const next = () => {
    if (step === 0 && !email.includes("@")) {
      triggerShake();
      return;
    }
    if (step === 1 && pass.length < 4) {
      triggerShake();
      return;
    }
    setStep((s) => Math.min(2, s + 1));
  };

  return (
    <div className="relative z-[1] flex min-h-dvh flex-col">
      <EvaWatermark />
      <div className="relative z-[1] flex flex-1 flex-col px-4 py-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/preview-c" className="pc-caps-micro text-[var(--pc-primary)]">
            ← Índice
          </Link>
          <span className="pc-caps-micro text-[var(--pc-muted)]">Auth demo</span>
        </div>

        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
          <motion.p
            className="pc-hero-num text-center text-[clamp(4rem,22vw,9rem)] text-[var(--pc-chalk)]"
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {step + 1}
          </motion.p>
          <p className="pc-caps-micro mt-2 text-center text-[var(--pc-muted)]">Paso · {steps[step]}</p>

          <motion.div
            className="mt-10"
            animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
            transition={{ duration: 0.45 }}
          >
            {step === 0 ? (
              <label className="block">
                <span className="pc-caps-micro text-[var(--pc-chalk)]">Correo</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-3 w-full border-b-2 border-[rgba(255,255,255,0.35)] bg-transparent py-3 text-lg font-medium text-[var(--pc-chalk)] outline-none focus:border-[var(--pc-primary)]"
                  placeholder="coach@void.io"
                  autoComplete="email"
                />
              </label>
            ) : null}
            {step === 1 ? (
              <label className="block">
                <span className="pc-caps-micro text-[var(--pc-chalk)]">Contraseña</span>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="mt-3 w-full border-b-2 border-[rgba(255,255,255,0.35)] bg-transparent py-3 text-lg font-medium text-[var(--pc-chalk)] outline-none focus:border-[var(--pc-primary)]"
                  placeholder="········"
                  autoComplete="current-password"
                />
              </label>
            ) : null}
            {step === 2 ? (
              <p className="text-center text-lg font-semibold uppercase tracking-[0.08em] text-[var(--pc-chalk)]">
                Sesión lista (mock)
              </p>
            ) : null}
          </motion.div>

          <div className="mt-auto flex flex-col gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
            {step < 2 ? (
              <button type="button" className="pc-btn-solid w-full" onClick={next}>
                Continuar
              </button>
            ) : (
              <Link
                href="/preview-c/dashboard"
                className="pc-btn-solid block w-full text-center no-underline"
              >
                Ir al panel
              </Link>
            )}
            <p className="pc-mono text-center text-[0.6rem] text-[var(--pc-muted)]">
              Validación demo: email con @ · clave ≥ 4
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
