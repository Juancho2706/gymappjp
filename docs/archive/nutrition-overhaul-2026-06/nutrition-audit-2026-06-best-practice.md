Best-practice map below. Synthesized from the four research findings; no files needed.

---

# Nutrition Software Best-Practice Map — June 2026

## 1. The bar for consumer logging UX

The whole game is **adherence**, and adherence = **low friction × accurate data**. 2026 is the first year both improved together (AI photo/voice logging cut friction without wrecking accuracy enough to matter for behavior change).

- **Multi-modal capture, mixable within one meal.** Photo (homemade/restaurant), voice (hands full), text (meetings), barcode (packaged, fastest+most accurate), plus quick-add/recents/copy-meal. Single modality loses; multi-modal logging correlates with ~3x higher logging rates vs manual entry.
- **Capture trigger at the eating moment.** The #1 photo-logging failure is *forgetting to shoot before eating*. Widgets, lock-screen shortcuts, one-tap relog of recent meals — put logging in front of the user with near-zero tax to start.
- **AI as draft, not oracle.** AI photo is ~82% accurate vs ~94% manual; portion sizing is the bottleneck (15–25% error on mixed plates, ~8–12% only with depth/LiDAR). Surface a per-item **confidence indicator**, make correction one tap, reconcile every input mode against **one verified DB**.
- **Adherence-neutral framing (the single biggest retention lever).** No punishing streaks, no red over-budget numbers, no good/bad food labels, no pre-log shame pop-ups. Shame makes users stop logging for the rest of the day, destroying the data the coach needs. If you use streaks, frame as restartable consistency ("logged 5 of 7 days"), never an all-or-nothing chain.
- **Hybrid visualization.** Calorie/energy **ring** + protein/carbs/fat **bars**, real-time, in small/medium/large variants incl. home-screen widget. Calories-alone is insufficient.
- **Contextual notifications.** Trigger at the user's *own* habitual mealtimes and ~30 min after a missed window — not a global "optimal hour." Evening (~6 PM) is the strongest generic fallback.
- **Adaptive targets.** Reverse-calculate true TDEE from logged intake + weight trend (converges in 2–3 weeks); don't freeze a signup-time calculator value. Protein-forward defaults for body-comp goals (the 50/30/20 default churns serious users).
- **Deep wearable sync.** Auto-import expenditure/sleep/RHR from Apple Health/Garmin/Fitbit/Oura.
- **Accessibility floor (non-negotiable).** WCAG 2.2 AA in *both* themes: ≥4.5:1 text contrast, ≥44/48px touch targets, Dynamic Type, screen-reader labels on icons. Macro ring color must never be the only signal — pair with labels for color-blind users.
- **Mobile-first.** Minimize taps, thumb-reach primary actions, `dvh` not `vh`, and make resume-after-a-lapse as frictionless as first-time logging (adherence decays steeply: 5.4→1.4 days/week by week 12).

**Bar-setters:** MacroFactor (adherence-neutral + adaptive TDEE), Cal AI (~2s photo-to-macros, depth sensor, >30% retention), Nutrola (multi-modal in one meal), Cronometer (verified DB + wearable sync).

## 2. What professional dietitians require (that consumer apps lack)

- **Verified scientific food data, no user submissions.** USDA FoodData Central, NCCDB, AUSNUT, UK McCance & Widdowson's — values an RD can cite in a clinical report and defend in consultation.
- **Full micronutrient panel.** 13 vitamins, 17 minerals, amino acids, fatty-acid subtypes — not calories + 3 macros. Required for deficiencies, CKD K/phosphorus, prenatal folate/iron (Cronometer 84+, Nutrium, That Clean Life 25+).
- **Deterministic macro auto-scaling.** Portions auto-scale to per-client targets with recalculation the RD can stand behind as foods are swapped — not AI-guessed. Manual macro math doesn't scale to 30–80+ clients.
- **Condition/disease-state + exchange templates out of the box.** PCOS, low-FODMAP, gout, diabetes, CKD, cardiac, IBS, medical weight loss (That Clean Life 150+, EatLove).
- **White-label deliverables.** Branded meal-plan PDFs and a client portal/app under the practitioner's brand. Lack of white-label is Nutrium's most-cited weakness; it's table stakes for paid client work.
- **Healthcare compliance + US insurance billing.** HIPAA + SOC 2, BAA on every plan, SOAP charting, superbills/claims, HSA/FSA (Healthie, Practice Better). *Region-dependent — not load-bearing for a Chile/Latam-first product.*
- **Unified PHI-secure workflow.** Telehealth + scheduling + charting + payments in one stack, not stitched Calendly/Zoom/EHR/Stripe.
- **Intake/assessment + longitudinal progress charting, incl. CGM.** Native Dexcom/Libre is increasingly expected for metabolic work (Cronometer Pro, 2026).
- **Interoperability.** Import from consumer trackers; export structured reports (50+ types), multi-language PDFs, label/menu compliance.

**Market reality:** no single tool wins both EHR and meal planning — the common RD stack is practice-management + a dedicated meal-plan tool (e.g. Practice Better + That Clean Life).

## 3. Methodologies & food DBs for Chile/Latam

- **Layer DBs by region (none covers everything):**
  - **INTA/SAFOODS (U. de Chile)** — gold standard for Chilean whole foods/preparations, but **no API**; manual ingest from print/PDF (INTA 2018 table + Schmidt-Hebbel). INTA itself flags Chile lacks updated composition data.
  - **FatSecret Platform API** — best **commercial Latam** fit: 2.3M+ items, 58+ countries, per-country datasets (local brands/supermarkets/barcodes). Free US "Premier" tier.
  - **Open Food Facts** — free barcode first-pass (>4M products, Chile portal), but Latam coverage thin and crowd-sourced.
  - **USDA FDC** — rich generic/reference fallback (fast monthly cadence, v15.1 May 2026), but US-centric.
  - **Tag every entry with source DB + verification flag; rank verified/local first.**
- **Chilean "porciones de intercambio" natively** — 7 food groups (food pyramid), portion = caloric equivalence across the 3 macros + each group's critical nutrient. Canonical: *Manual de Porciones de Intercambio para Chile*, 2nd ed. 2021 (UDD). This is how Chilean nutritionists actually prescribe — **distinct from US ADA exchange lists**, and a real differentiator vs US-built apps.
- **Energy equations:** default **Mifflin-St Jeor** when only height/weight/age known; switch to **Cunningham / Katch-McArdle** (LBM-based) when a reliable body-composition input exists. Mifflin *underestimates* RMR in athletes; gate the equation on whether body-fat/LBM was captured.
- **Daily totals first, timing as an opt-in advanced layer.** ISSN: protein distribution (20–40g every 3–4h) > exact peri-workout timing; carbs 3–12 g/kg scaled to training load. Separate **"meets DRI"** (health floor) from **"meets training goal"** (performance target: protein 1.6–2.2 g/kg).
- **AI photo for Latam = assistive draft only.** South American grains/dishes are under-represented in training data; food ID drops to 60–75% on regional/long-tail foods. Vendor accuracy claims ("±1.9%") are self-reported, not peer-reviewed. **Fitia** is the closest regional benchmark (strong Chilean/Latam coverage).

## 4. Coaching-platform competitive bar

Consistent industry split: **PT platforms build tracking/macros in-house but outsource serious meal planning.**

- **Floor (table stakes):** native calorie+macro tracking, large **verified** food DB + barcode scan, **included** (not an add-on). Kahunas 1.4M foods/600k barcodes; My PT Hub 650k bundled.
- **MyFitnessPal (and ideally Cronometer) sync** — universal; pass through **macros AND micros**, not just calories (PT Distinction).
- **Monetization split that works:** keep tracking free, **gate advanced meal-plan generation as a paid add-on** (Trainerize Smart Meal Planner $20–45/mo; Everfit Meal Plans $33/mo). Validates charging per nutrition module.
- **Check-in as the glue** linking nutrition + training + photos + messaging in one portal, with tracked history + automated reminders (Kahunas, PT Distinction; reminders cited to lift adherence 90%+).
- **Habit/adherence coaching**, not just numeric targets — build a nutrition habit once, assign to many, auto-track (PT Distinction).
- **AI food-photo scan** is the 2026 frontier beyond MFP sync (Everfit MacroSnap).
- **The dietitian bar every PT app misses** (the open wedge): allergy/intolerance filters, dietitian-validated recipe library, automated macro-precise plan generation, **food-exchange systems**, and **white-label branded meal-plan PDFs**. Trainerize brands the app shell but *not* the meal-plan output. A white-label-first product that ships branded outputs + allergy filters + intercambios serves **both coaches and nutritionists in one app** — a genuine wedge competitors leave open. Promealplan sets that bar (1,000+ validated recipes, 200+ allergy filters, branded outputs).

## 5. Prioritized capabilities for a best-in-class coach + nutritionist product

**P0 — credibility floor (without these it's not taken seriously):**
1. Native calorie+macro tracking with a **verified, source-tagged** food DB + barcode scan, bundled.
2. **Region-layered food catalog:** INTA/SAFOODS (Chilean foods) + FatSecret (Latam brands/barcodes) + Open Food Facts (free barcode) + USDA fallback, each entry source-tagged + verification flag, verified/local ranked first.
3. **Multi-modal low-friction logging** (photo + voice + barcode + text + recents/copy-meal) with capture triggers at the eating moment.
4. **AI photo as confirm/correct draft** with per-item confidence; reconcile to one verified DB.
5. **Adherence-neutral UX** (no shame, restartable consistency feedback) + hybrid ring/bar visualization + WCAG 2.2 AA in both themes.

**P1 — professional/nutritionist enablement (the open wedge):**
6. **Chilean "porciones de intercambio" (7-group)** meal planning natively, with macro-matched **one-tap swaps / equivalence cards** (allergy & dislike-aware).
7. **Deterministic macro auto-scaling** of portions to per-client targets.
8. **White-label branded meal-plan PDFs + client portal** — branding extends to the *output*, not just the app shell.
9. **Full micronutrient analysis** (vitamins/minerals/amino/fatty acids) with DRI vs training-goal separation.
10. **Allergy/intolerance filters + condition templates** (diabetes, CKD, PCOS, low-FODMAP, etc.).

**P2 — retention & coaching loop:**
11. **Adaptive TDEE** from logged intake + weight trend; equation gating (Mifflin default → Cunningham/Katch-McArdle when LBM captured); protein-forward defaults.
12. **Check-in as glue** (nutrition + training + photos + messaging) with tracked history; **contextual reminders** at the client's own mealtimes.
13. **Habit-based coaching** (assignable nutrition habits, build-once/assign-many) + single coach **review inbox** with timely-specific-adaptive feedback and async video.
14. **Daily-totals-first contract**, with nutrient timing / carb periodization as an opt-in advanced layer.

**P3 — depth & differentiation:**
15. Wearable sync (Apple Health/Garmin/Oura) + CGM (Dexcom/Libre) for metabolic clients.
16. Diet-pattern / fasting-window engagement modes matched to the client's actual lever.
17. Per-coach add-on monetization of the advanced meal-planning module (proven free-tracking / paid-planning split).

**The strategic wedge:** a white-label-first, Chile/Latam-native product that ships branded meal-plan outputs + allergy filters + **intercambios** clears the dietitian bar every PT platform leaves open — serving coaches *and* real nutritionists in one app, which no competitor in this set does.