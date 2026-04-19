import Link from "next/link";
import { KineticHalo } from "@/components/fx/KineticHalo";

export default function LoginPreview() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 z-0">
        <KineticHalo size={900} opacity={0.055} />
      </div>

      <div
        className="pv-glass-strong relative z-10 w-full max-w-[420px] rounded-2xl p-10 md:p-12"
        style={{ borderRadius: 20 }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-[0.28em] text-[rgb(var(--theme-primary-rgb))]"
          style={{ margin: 0 }}
        >
          EVA
        </p>
        <h1 className="display mt-3 text-3xl tracking-[-0.03em] text-[var(--obs-text)] md:text-4xl">
          Inicia sesión
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--obs-text-dim)]">
          Accede a tu cuenta
        </p>

        <div className="mt-10 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--obs-text-faint)]">
              Email
            </label>
            <input className="input" placeholder="tu@email.com" defaultValue="coach@fitcoach.studio" />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--obs-text-faint)]">
                Contraseña
              </label>
              <a href="#" className="text-[11px] font-semibold text-[rgb(var(--theme-primary-rgb))]">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
            <input className="input" type="password" placeholder="••••••••" defaultValue="preview-demo" />
          </div>

          <button type="button" className="btn btn-primary btn-lg mt-2 w-full">
            Entrar
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--obs-text-dim)]">
          ¿No tenés cuenta?{" "}
          <a href="#" className="font-semibold text-[rgb(var(--theme-primary-rgb))]">
            Probar gratis
          </a>
        </p>

        <Link
          href="/preview"
          className="mt-10 block text-center text-xs text-[var(--obs-text-faint)] hover:text-[var(--obs-text-dim)]"
        >
          ← Volver al índice de preview
        </Link>
      </div>
    </div>
  );
}
