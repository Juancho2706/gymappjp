import { mockPalette, principles } from "../_data/mock";

export function OsakaFoundations() {
  return (
    <footer className="style-footer">
      <div className="style-grid">
        <div className="style-block">
          <h4>
            PALETA <span className="jp-sm">色</span>
          </h4>
          <div className="palette">
            {mockPalette.map((row) => (
              <div key={row.hex} className="palette-row">
                <div className="swatch" style={{ background: row.bg }} />
                <div className="info">
                  <span className="name">{row.name}</span>
                  <span className="hex">{row.hex}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="style-block">
          <h4>
            TYPE <span className="jp-sm">書</span>
          </h4>
          <div className="font-demo">
            <div className="tag">{`// Display · Unbounded 900`}</div>
            <div className="sample-unbounded">PUSH DAY</div>
          </div>
          <div className="font-demo">
            <div className="tag">{`// Accent · Noto Sans JP`}</div>
            <div className="sample-jp" lang="ja">
              大阪道場
            </div>
          </div>
          <div className="font-demo">
            <div className="tag">{`// System · JetBrains Mono`}</div>
            <div className="sample-mono">STAGE 03·01 · LV 14</div>
          </div>
        </div>

        <div className="style-block">
          <h4>
            RULES <span className="jp-sm">原則</span>
          </h4>
          <div className="principles">
            {principles.map((p) => (
              <div key={p.n} className="principle-item">
                <div className="n">{p.n}</div>
                <p>
                  <strong>{p.strong}</strong>
                  {p.rest}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
