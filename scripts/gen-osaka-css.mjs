import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlPath = path.join(root, "public", "UI PROPOSALS", "eva-design-06-osaka.html");
const outPath = path.join(root, "src", "app", "pageosaka", "_styles", "osaka.css");

const h = fs.readFileSync(htmlPath, "utf8");
const m = h.match(/<style>([\s\S]*?)<\/style>/);
if (!m) throw new Error("no <style> in osaka html");

let c = m[1];
c = c.replace(/\*\s*\{[^}]+\}/g, "");
c = c.replace(/html,\s*body\s*\{[^}]+\}/g, "");
c = c.replace(/:root\s*\{/g, ":scope {");
c = c.replace(/body::before/g, ":scope::before");
c = c.replace(/'Unbounded',\s*sans-serif/g, "var(--font-osaka-display), system-ui, sans-serif");
c = c.replace(/'Noto Sans JP',\s*sans-serif/g, "var(--font-osaka-jp), sans-serif");
c = c.replace(/'JetBrains Mono',\s*monospace/g, "var(--font-osaka-mono), ui-monospace, monospace");

const extra = `
  :scope {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-right: max(12px, env(safe-area-inset-right));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    padding-left: max(12px, env(safe-area-inset-left));
  }
  :scope * {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
  }
  .pageosaka-stack {
    position: relative;
    z-index: 1;
  }
  .pageosaka-study-pill {
    position: fixed;
    z-index: 50;
    right: max(12px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
    font-family: var(--font-osaka-mono), ui-monospace, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 8px 12px;
    background: var(--black);
    color: var(--ivory);
    border: 2px solid var(--black);
    box-shadow: 3px 3px 0 var(--red);
    max-width: min(92vw, 280px);
    text-align: center;
    pointer-events: none;
  }
  .pageosaka-shell {
    display: grid;
    gap: 24px;
    max-width: 1480px;
    margin: 0 auto;
    padding: 0 12px 48px;
  }
  @media (min-width: 1024px) {
    .pageosaka-shell {
      grid-template-columns: min(240px, 28vw) 1fr;
      align-items: start;
      gap: 32px;
      padding: 0 20px 64px;
    }
  }
  .pageosaka-toc {
    position: sticky;
    top: max(8px, env(safe-area-inset-top));
    z-index: 20;
    align-self: start;
  }
  @media (max-width: 1023px) {
    .pageosaka-toc {
      position: relative;
      top: auto;
    }
  }
  .pageosaka-toc summary {
    list-style: none;
    cursor: pointer;
    font-family: var(--font-osaka-mono), ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 12px 14px;
    background: var(--black);
    color: var(--ivory);
    border: 3px solid var(--black);
    box-shadow: 4px 4px 0 var(--red);
  }
  .pageosaka-toc summary::-webkit-details-marker { display: none; }
  .pageosaka-toc nav {
    margin-top: 10px;
    padding: 12px;
    background: var(--ivory-2);
    border: 3px solid var(--black);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  @media (min-width: 1024px) {
    .pageosaka-toc nav {
      margin-top: 0;
    }
    .pageosaka-toc summary { display: none; }
    .pageosaka-toc { border: 3px solid var(--black); background: var(--ivory-2); padding: 12px; box-shadow: 5px 5px 0 var(--black); }
    .pageosaka-toc nav {
      border: none;
      padding: 0;
      background: transparent;
    }
  }
  .pageosaka-toc a {
    font-family: var(--font-osaka-mono), ui-monospace, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink);
    text-decoration: none;
    padding: 10px 8px;
    border: 2px solid transparent;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .pageosaka-toc a:hover {
    border-color: var(--black);
    background: var(--yellow);
  }
  .pageosaka-toc a:focus-visible {
    outline: 3px solid var(--black);
    outline-offset: 2px;
  }
  .pageosaka-cabinet-rail {
    display: flex;
    gap: 20px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 12px;
    padding-bottom: 8px;
  }
  @media (min-width: 900px) {
    .pageosaka-cabinet-rail { display: contents; }
  }
  .pageosaka-cabinet-rail > * {
    scroll-snap-align: start;
    flex: 0 0 min(92vw, 400px);
  }
  @media (min-width: 900px) {
    .pageosaka-cabinet-rail > * { flex: none; }
  }
  .osaka-desktop-frame {
    width: 100%;
    background: var(--ivory);
    border: 3px solid var(--black);
    box-shadow: 6px 6px 0 var(--black);
    padding: 20px;
  }
  .osaka-desktop-frame h3 {
    font-family: var(--font-osaka-display), system-ui, sans-serif;
    font-weight: 900;
    letter-spacing: -0.03em;
    font-size: clamp(22px, 3vw, 32px);
    margin-bottom: 16px;
  }
`;

const out =
  "/* Derived from eva-design-06-osaka.html — scoped for .pageosaka-root */\n@scope (.pageosaka-root) {\n" +
  c +
  extra +
  "\n}\n@media (prefers-reduced-motion: reduce) {\n  .pageosaka-root .insert-coin .dot { animation: none !important; opacity: 1 !important; }\n}\n";

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, out.length);
