import { BrutalistShell } from "../_components/BrutalistShell";

export default function PreviewCClientePage() {
  return (
    <BrutalistShell
      title="Frontpage alumno"
      subtitle="Columnas editoriales + manifiesto. Marquee de estado arriba."
      marquee="ADHERENCIA 94% · PRÓXIMO: EMPUJE · RACHA 28 · PESO +1.8 KG"
      actions={
        <button type="button" className="pc-btn-solid !min-h-10">
          Check-in
        </button>
      }
    >
      <div className="columns-1 gap-8 md:columns-2 md:gap-10">
        <div className="mb-8 break-inside-avoid">
          <p className="pc-caps-micro text-[var(--pc-primary)]">Hoy</p>
          <h2 className="pc-hero-num mt-2 text-[clamp(2.5rem,10vw,7.5rem)] text-[var(--pc-chalk)]">
            Push
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--pc-muted)] md:text-base">
            Bloque principal press banca 5×5, accesorios hombro. Duración estimada 65 min. Recordá
            registrar RPE al final del set 3.
          </p>
        </div>
        <div className="mb-8 break-inside-avoid border-l-2 border-[var(--pc-primary)] pl-4">
          <p className="pc-caps-micro">Pull quote</p>
          <p className="mt-2 text-lg font-semibold leading-snug text-[var(--pc-chalk)]">
            &ldquo;La sesión corta del miércoles subió adherencia sin bajar volumen total.&rdquo;
          </p>
        </div>
        <div className="break-inside-avoid">
          <p className="pc-caps-micro text-[var(--pc-muted)]">Micro manifiesto</p>
          <ul className="mt-3 space-y-2 text-sm font-medium text-[var(--pc-chalk)]">
            <li>· Calentamiento dinámico 8 min</li>
            <li>· Tiras elásticas + activación escapular</li>
            <li>· Descansos estrictos 90s en compuestos</li>
          </ul>
        </div>
      </div>
    </BrutalistShell>
  );
}
