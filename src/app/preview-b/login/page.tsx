"use client";

import Image from "next/image";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { BRAND_APP_ICON } from "@/lib/brand-assets";
import { usePreviewBTheme } from "../_components/PreviewBRoot";

export default function PreviewBLoginPage() {
  const { isDark, toggleTheme } = usePreviewBTheme();

  return (
    <div className="flex min-h-dvh flex-col px-4 py-10 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <Link href="/preview-b" className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden smoked-badge">
              <Image
                src={BRAND_APP_ICON}
                alt=""
                width={28}
                height={28}
                className="relative z-[1] object-contain"
              />
            </div>
            <span className="caption-micro text-primary">EVA</span>
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-12 min-h-12 w-12 min-w-12 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:border-primary/40"
            aria-label={isDark ? "Modo claro" : "Modo oscuro"}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        <div className="paper-elevated mt-10 flex flex-1 flex-col rounded-2xl p-6 md:mt-14 md:p-10">
          <h1 className="display-editorial text-3xl tracking-tight text-foreground">
            Diario de sesión
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingresá con tu cuenta del estudio. Campos estilo subrayado editorial.
          </p>

          <form className="mt-10 flex flex-col gap-8" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="caption-micro block text-foreground" htmlFor="pb-email">
                Correo
              </label>
              <input
                id="pb-email"
                className="preview-b-input-line mt-2"
                type="email"
                autoComplete="email"
                placeholder="coach@estudio.com"
                defaultValue="marina@estudio.com"
              />
            </div>
            <div>
              <label className="caption-micro block text-foreground" htmlFor="pb-pass">
                Contraseña
              </label>
              <input
                id="pb-pass"
                className="preview-b-input-line mt-2"
                type="password"
                autoComplete="current-password"
                placeholder="········"
                defaultValue="preview-demo"
              />
            </div>

            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
            >
              Entrar al panel
            </button>
          </form>

          <p className="caption-micro mt-8 text-center text-muted-foreground">
            <Link href="/preview-b" className="text-primary hover:underline">
              ← Volver al índice
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
