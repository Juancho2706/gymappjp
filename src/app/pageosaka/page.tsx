import { HighScoresScreen } from "./_components/HighScoresScreen";
import { MissionSelectScreen } from "./_components/MissionSelectScreen";
import { OsakaAppMirrors } from "./_components/OsakaAppMirrors";
import { OsakaExtendedSpecimens } from "./_components/OsakaExtendedSpecimens";
import { OsakaFoundations } from "./_components/OsakaFoundations";
import { OsakaPhoneFrame } from "./_components/OsakaPhoneFrame";
import { OsakaScreenLabel } from "./_components/OsakaScreenLabel";
import { OsakaStudioHero } from "./_components/OsakaStudioHero";
import { OsakaMobileDock } from "./_components/OsakaMobileDock";
import { OsakaToc } from "./_components/OsakaToc";

export default function PageOsaka() {
  return (
    <>
      <a href="#attract" className="osaka-skip">
        Saltar al contenido
      </a>
      <main className="pageosaka-stack">
        <section className="pageosaka-section pageosaka-section--hero" aria-label="Cabecera del estudio Osaka">
          <OsakaStudioHero />
        </section>

        <div className="pageosaka-shell">
          <OsakaToc />

          <div className="pageosaka-main-column">
            <section className="pageosaka-section pageosaka-section--foundations" id="foundations" aria-label="Fundamentos de diseño">
              <OsakaFoundations />
            </section>

            <section className="pageosaka-section pageosaka-section--cabinet" aria-labelledby="cabinet-title">
              <h2 className="sr-only" id="cabinet-title">
                Cabinet wall — mockups móvil del estudio 06
              </h2>

              <div className="screens-wrap">
                <div className="pageosaka-cabinet-pair">
                  <div id="spec-061">
                    <OsakaScreenLabel num="[06·1]" title="MISSION SELECT // ALUMNO" jp="選択" />
                    <OsakaPhoneFrame>
                      <MissionSelectScreen />
                    </OsakaPhoneFrame>
                  </div>

                  <div id="spec-062">
                    <OsakaScreenLabel num="[06·2]" title="RECORDS // HIGH SCORES" jp="記録" />
                    <OsakaPhoneFrame>
                      <HighScoresScreen />
                    </OsakaPhoneFrame>
                  </div>
                </div>
              </div>
            </section>

            <div className="pageosaka-specimens-stack">
              <OsakaAppMirrors />
              <OsakaExtendedSpecimens />
            </div>
          </div>
        </div>
      </main>
      <OsakaMobileDock />
    </>
  );
}
