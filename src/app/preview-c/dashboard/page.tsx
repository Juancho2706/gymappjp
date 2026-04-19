import { BrutalistShell } from "../_components/BrutalistShell";
import { BrutalPrimaryCta } from "../_components/BrutalPrimaryCta";
import { clients } from "../_data/mock";

export default function PreviewCDashboardPage() {
  return (
    <BrutalistShell
      title="Command board"
      subtitle="Grid 12 brutal · número hero · barras rellenas con pigmento coach."
      marquee="ADHERENCIA 87% · PRÓXIMO: PIERNA · RACHA 12 · CHECK-INS 32 PENDIENTES"
      actions={
        <>
          <button type="button" className="pc-btn-ghost !min-h-10 text-[0.6rem]">
            CSV
          </button>
          <button type="button" className="pc-btn-solid !min-h-10">
            Nuevo
          </button>
          <BrutalPrimaryCta brandHex="#6B6B6B" label="Marca tenue (wrap)" />
        </>
      }
    >
      <section className="grid grid-cols-6 gap-3 md:grid-cols-12 md:gap-4">
        <div className="col-span-6 md:col-span-7">
          <p className="pc-caps-micro text-[var(--pc-primary)]">Activos</p>
          <p className="pc-hero-num mt-2 text-[clamp(3.5rem,16vw,12.5rem)] leading-none text-[var(--pc-chalk)]">
            48
          </p>
          <p className="pc-mono mt-2 text-xs text-[var(--pc-muted)]">alumnos · rolling 30d</p>
        </div>
        <div className="col-span-6 flex flex-col justify-end gap-2 md:col-span-5">
          <span className="pc-tape pc-tape-primary w-fit">KPI · MRR</span>
          <span className="pc-tape w-fit border-[var(--pc-tape-cyan)] text-[var(--pc-tape-cyan)]">
            Retención
          </span>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-6 gap-3 md:grid-cols-12 md:gap-4">
        {clients.slice(0, 3).map((c, i) => (
          <article
            key={c.id}
            className="pc-edge-muted col-span-6 p-4 transition-transform hover:-translate-y-0.5 md:col-span-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="pc-caps-micro text-[var(--pc-muted)]">0{i + 1}</p>
                <h3 className="mt-1 text-lg font-bold uppercase tracking-wide text-[var(--pc-chalk)]">
                  {c.name}
                </h3>
              </div>
              <span className="pc-mono text-sm text-[var(--pc-primary)]">{c.initials}</span>
            </div>
            <div className="mt-4 h-2 w-full border border-[rgba(255,255,255,0.2)]">
              <div
                className="h-full bg-[var(--pc-primary)]"
                style={{ width: `${c.adherence}%` }}
              />
            </div>
            <p className="pc-mono mt-2 text-xs text-[var(--pc-muted)]">{c.adherence}% adherencia</p>
          </article>
        ))}
      </section>

      <section className="pc-edge-muted mt-8 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--pc-chalk)]">
              <th className="pc-caps-micro p-3 text-[var(--pc-muted)]">Alumno</th>
              <th className="pc-caps-micro p-3 text-[var(--pc-muted)]">Plan</th>
              <th className="pc-caps-micro p-3 text-[var(--pc-muted)]">%</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-[rgba(255,255,255,0.12)]">
                <td className="p-3 font-semibold text-[var(--pc-chalk)]">{c.name}</td>
                <td className="p-3 text-[var(--pc-muted)]">{c.plan}</td>
                <td className="pc-mono p-3 text-[var(--pc-primary)]">{c.adherence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </BrutalistShell>
  );
}
