import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let css = fs.readFileSync(path.join(__dirname, '_extracted.css'), 'utf8')

css = css.replace(/\r\n/g, '\n')
css = css.replace(/:root\s*\{[^}]*\}/s, '')
css = css.replace(/@property\s+--aurora-hue\s*\{[^}]*\}\s*/s, '')
css = css.replace(/\* \{[^}]*\}/, '')
css = css.replace(
  /html, body \{[^}]*\}/s,
  ''
)
css = css.replace(
  /\/\* Ambient page background \*\/\s*body \{[^}]*\}/s,
  ''
)
css = css.replace(/\b\.glass\b/g, '.aurora-glass')
css = css.trim()

const header = `
/* Aurora showcase — scoped; .aurora-glass avoids clash with globals.css .glass */
@property --aurora-hue {
  syntax: '<angle>';
  initial-value: 270deg;
  inherits: true;
}

@scope (.aurora-root) {
  :scope {
    --font-display: var(--font-inter-tight), 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
    --font-body: var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif;
    --font-mono: ui-monospace, 'Geist Mono', 'SFMono-Regular', Menlo, monospace;
    min-height: 100dvh;
    overflow-x: hidden;
    font-feature-settings: "cv11", "ss01";
    font-family: var(--font-body);
    background:
      radial-gradient(ellipse at 20% 10%, rgba(123, 92, 255, 0.25) 0%, transparent 45%),
      radial-gradient(ellipse at 80% 30%, rgba(255, 138, 61, 0.18) 0%, transparent 50%),
      radial-gradient(ellipse at 40% 80%, rgba(80, 200, 255, 0.15) 0%, transparent 55%),
      #0A0A10;
    color: #f5f5fa;
  }

  :scope[data-page-theme='light'] {
    background:
      radial-gradient(ellipse at 15% 0%, rgba(123, 92, 255, 0.18) 0%, transparent 42%),
      radial-gradient(ellipse at 90% 20%, rgba(255, 138, 61, 0.12) 0%, transparent 48%),
      radial-gradient(ellipse at 50% 100%, rgba(80, 200, 255, 0.1) 0%, transparent 50%),
      #f5f5f7;
    color: #0a0a14;
  }

  :scope[data-page-theme='light'] .page-header {
    color: #0a0a14;
  }
  :scope[data-page-theme='light'] .kicker {
    background: rgba(9, 9, 20, 0.06);
    border-color: rgba(9, 9, 20, 0.1);
    color: #4a4a58;
  }
  :scope[data-page-theme='light'] .page-header h1 {
    background: linear-gradient(135deg, #0a0a14 0%, #5b4bdb 45%, #d97706 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  :scope[data-page-theme='light'] .sh-cell .lbl {
    color: rgba(60, 60, 72, 0.55);
  }
  :scope[data-page-theme='light'] .sh-cell .val {
    color: rgba(20, 20, 30, 0.88);
  }
  :scope[data-page-theme='light'] .sh-cell .val strong {
    color: #0a0a14;
  }
  :scope[data-page-theme='light'] .wl-strip {
    background: rgba(255, 255, 255, 0.65);
    border-color: rgba(9, 9, 20, 0.08);
    color: #3c3c48;
  }
  :scope[data-page-theme='light'] .screen-label {
    color: #4a4a58;
    border-bottom-color: rgba(9, 9, 20, 0.08);
  }
  :scope[data-page-theme='light'] .screen-label .title {
    color: #0a0a14;
  }
  :scope[data-page-theme='light'] .spec-footer {
    color: #3c3c48;
    border-top-color: rgba(9, 9, 20, 0.1);
  }
  :scope[data-page-theme='light'] .spec-block h4 {
    color: rgba(40, 40, 52, 0.65);
    border-bottom-color: rgba(9, 9, 20, 0.08);
  }
  :scope[data-page-theme='light'] .principle {
    background: rgba(255, 255, 255, 0.55);
    border-color: rgba(9, 9, 20, 0.08);
  }
  :scope[data-page-theme='light'] .principle p {
    color: rgba(20, 20, 30, 0.85);
  }
  :scope[data-page-theme='light'] .tech-item {
    border-bottom-color: rgba(9, 9, 20, 0.1);
  }

  :scope *,
  :scope *::before,
  :scope *::after {
    box-sizing: border-box;
  }

`

const extra = `
  /* —— Coach home dashboard —— */
  .ch-top {
    padding: 28px 22px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ch-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 18px;
    letter-spacing: -0.03em;
    color: var(--ink);
  }
  .ch-brand .mark {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    box-shadow: 0 8px 24px -6px var(--brand);
  }
  .ch-title-block { padding: 0 22px 18px; }
  .ch-title-block .lbl {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .ch-title-block h2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 28px;
    letter-spacing: -0.035em;
    color: var(--ink);
    line-height: 1.05;
  }
  .ch-stats {
    margin: 0 22px 16px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    border-radius: 22px;
    padding: 6px;
  }
  .ch-stat {
    text-align: center;
    padding: 12px 6px;
    border-radius: 16px;
  }
  .ch-stat .num {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
    color: var(--ink);
    letter-spacing: -0.03em;
  }
  .ch-stat .num.accent {
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .ch-stat .lbl {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 4px;
  }
  .ch-chart-mini {
    margin: 0 22px 14px;
    border-radius: 24px;
    padding: 18px;
  }
  .ch-chart-mini .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }
  .ch-chart-mini .t {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 14px;
    color: var(--ink);
  }
  .ch-chart-mini .r {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--brand);
    font-weight: 600;
  }
  .ch-clients {
    margin: 0 22px 100px;
    border-radius: 24px;
    padding: 18px;
  }
  .ch-clients .h {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 14px;
    color: var(--ink);
    margin-bottom: 12px;
  }
  .ch-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .ch-row:last-child { border-bottom: none; }
  .ch-row .av {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    background: var(--brand-bg);
    color: var(--brand);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }
  .ch-row .tx { flex: 1; min-width: 0; }
  .ch-row .nm { font-weight: 600; font-size: 13px; color: var(--ink); }
  .ch-row .sub { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-top: 2px; }
  .ch-row .pill {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 100px;
    background: var(--brand-bg);
    color: var(--brand);
  }
  .ch-nav {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 14px;
    padding: 8px;
    border-radius: 100px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
    z-index: 10;
  }
  .ch-nav button {
    background: transparent;
    border: none;
    padding: 12px;
    border-radius: 100px;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ch-nav button.active {
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    color: white;
    box-shadow: 0 6px 20px -4px var(--brand);
  }

  /* —— Mi marca —— */
  .br-top {
    padding: 28px 22px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .br-top .t {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 20px;
    color: var(--ink);
    letter-spacing: -0.03em;
  }
  .br-more {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
  }
  .br-logo-zone {
    margin: 8px 22px 16px;
    border-radius: 24px;
    padding: 28px;
    text-align: center;
    border: 2px dashed var(--border);
    background: var(--surface-glass);
  }
  .br-logo-zone .circle {
    width: 72px;
    height: 72px;
    margin: 0 auto 12px;
    border-radius: 20px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    box-shadow: 0 16px 40px -12px var(--brand);
  }
  .br-logo-zone .hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .br-colors {
    margin: 0 22px 14px;
    border-radius: 24px;
    padding: 18px;
  }
  .br-colors .h {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }
  .br-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .br-swatches span {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid var(--bg);
    box-shadow: 0 0 0 1px var(--border);
    cursor: default;
  }
  .br-toggle {
    margin: 0 22px 14px;
    border-radius: 20px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .br-toggle .txx {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
  }
  .br-toggle .subx {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    margin-top: 2px;
  }
  .br-switch {
    width: 48px;
    height: 28px;
    border-radius: 100px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    position: relative;
    flex-shrink: 0;
  }
  .br-switch::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  .br-preview-card {
    margin: 0 22px 100px;
    border-radius: 24px;
    padding: 16px;
  }
  .br-preview-card .lbl {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .br-mini-phone {
    border-radius: 20px;
    padding: 14px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .br-mini-phone .bar {
    height: 4px;
    width: 40%;
    margin: 0 auto 12px;
    border-radius: 100px;
    background: var(--border);
  }
  .br-mini-phone .cta {
    height: 36px;
    border-radius: 100px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
  }

  /* —— Plan builder —— */
  .pb-top {
    padding: 24px 22px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pb-top .back {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    flex-shrink: 0;
  }
  .pb-top .meta {
    flex: 1;
    min-width: 0;
  }
  .pb-top .t1 {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pb-top .t2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    color: var(--ink);
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pb-week {
    margin: 0 22px 14px;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .pb-day {
    flex: 0 0 auto;
    min-width: 44px;
    padding: 10px 8px;
    border-radius: 16px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    background: transparent;
    border: 1px solid transparent;
  }
  .pb-day.on {
    background: var(--brand-bg);
    color: var(--brand);
    border-color: rgba(123, 92, 255, 0.25);
    font-weight: 700;
  }
  .dark .pb-day.on {
    border-color: rgba(255, 138, 61, 0.35);
  }
  .pb-block {
    margin: 0 22px 12px;
    border-radius: 22px;
    padding: 16px;
  }
  .pb-block .line1 {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .pb-block .ex {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .pb-block .muscle {
    font-family: var(--font-mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-top: 2px;
  }
  .pb-block .sets {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--brand);
  }
  .pb-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pb-set-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-2);
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(128, 128, 160, 0.08);
  }
  .dark .pb-set-row {
    background: rgba(255, 255, 255, 0.05);
  }
  .pb-fab {
    position: absolute;
    right: 22px;
    bottom: 90px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12px 32px -8px var(--brand);
    z-index: 12;
    cursor: pointer;
  }
  .pb-bottom-bar {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 14px;
    padding: 10px 14px;
    border-radius: 100px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    z-index: 10;
  }
  .pb-bottom-bar .saved {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .pb-bottom-bar .btn {
    padding: 10px 18px;
    border-radius: 100px;
    border: none;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    color: white;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }

  .aurora-toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    max-width: 1400px;
    margin: 0 auto;
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    background: rgba(10, 10, 16, 0.65);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  :scope[data-page-theme='light'] .aurora-toolbar {
    background: rgba(255, 255, 255, 0.72);
    border-bottom-color: rgba(9, 9, 20, 0.08);
  }
  .aurora-toolbar a {
    color: inherit;
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    opacity: 0.9;
  }
  .aurora-toolbar button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 100px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: #f5f5fa;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  :scope[data-page-theme='light'] .aurora-toolbar button {
    border-color: rgba(9, 9, 20, 0.12);
    background: rgba(255, 255, 255, 0.9);
    color: #0a0a14;
  }

  /* —— Desktop browser frames —— */
  .aurora-desktop-wrap {
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.55);
    max-width: min(1160px, 100%);
    margin: 0 auto;
  }
  :scope[data-page-theme='light'] .aurora-desktop-wrap {
    border-color: rgba(9, 9, 20, 0.1);
    box-shadow: 0 32px 80px -24px rgba(0, 0, 0, 0.18);
  }
  .aurora-desktop-chrome {
    height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: rgba(0, 0, 0, 0.4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-family: var(--font-mono);
    font-size: 11px;
    color: rgba(210, 210, 220, 0.9);
    flex-shrink: 0;
  }
  :scope[data-page-theme='light'] .aurora-desktop-chrome {
    background: rgba(255, 255, 255, 0.88);
    border-bottom-color: rgba(9, 9, 20, 0.08);
    color: #4a4a58;
  }
  .aurora-dots {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .aurora-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .aurora-dots span:nth-child(1) { background: #ff5f57; }
  .aurora-dots span:nth-child(2) { background: #febc2e; }
  .aurora-dots span:nth-child(3) { background: #28c840; }
  .aurora-desktop-url {
    flex: 1;
    text-align: center;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.28);
    font-size: 10px;
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :scope[data-page-theme='light'] .aurora-desktop-url {
    background: rgba(9, 9, 20, 0.06);
  }
  .aurora-desktop-body {
    display: flex;
    min-height: 480px;
    max-height: min(720px, 70vh);
    background: var(--bg);
  }
  .aurora-desktop-sidebar {
    width: 220px;
    flex-shrink: 0;
    padding: 16px 10px;
    border-right: 1px solid var(--border);
    background: var(--surface-glass);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    overflow-y: auto;
  }
  .aurora-desktop-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    margin-bottom: 4px;
    cursor: default;
  }
  .aurora-desktop-nav-item.active {
    background: var(--brand-bg);
    color: var(--brand);
    font-weight: 600;
  }
  .aurora-desktop-main {
    flex: 1;
    padding: 20px 22px 28px;
    overflow: auto;
    min-width: 0;
  }
  .aurora-desktop-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 16px;
  }
  .aurora-desktop-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .aurora-desktop-grid { grid-template-columns: 1fr; }
    .aurora-desktop-grid-2 { grid-template-columns: 1fr; }
    .aurora-desktop-sidebar { width: 180px; }
  }
  .aurora-stat-pill {
    border-radius: 16px;
    padding: 14px 16px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -0.03em;
    color: var(--ink);
    line-height: 1.1;
  }
  .aurora-stat-pill .lbl {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
    margin-bottom: 4px;
  }
  .aurora-desktop-section {
    padding: 0 24px 56px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .aurora-desktop-intro {
    margin-bottom: 28px;
    max-width: 720px;
  }
  .aurora-desktop-intro h2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
    color: #f5f5fa;
  }
  :scope[data-page-theme='light'] .aurora-desktop-intro h2 {
    color: #0a0a14;
  }
  .aurora-desktop-intro p {
    font-size: 14px;
    line-height: 1.55;
    color: #a8a8b4;
  }
  :scope[data-page-theme='light'] .aurora-desktop-intro p {
    color: #4a4a58;
  }
  .aurora-dt-spacer {
    height: 40px;
  }

  /* Color de marca elegido por el coach (variables en .aurora-root) */
  :scope[data-coach-brand] .phone.light {
    --brand: var(--aurora-coach-primary);
    --brand-2: var(--aurora-coach-secondary);
    --brand-bg: color-mix(in srgb, var(--aurora-coach-primary) 10%, transparent);
  }
  :scope[data-coach-brand] .phone.dark {
    --brand: var(--aurora-coach-primary);
    --brand-2: var(--aurora-coach-secondary);
    --brand-bg: color-mix(in srgb, var(--aurora-coach-primary) 14%, transparent);
  }
`

const out = header + '\n  ' + css + '\n' + extra + '\n}\n'
fs.writeFileSync(path.join(__dirname, 'aurora.css'), out, 'utf8')
console.log('Wrote aurora.css')
