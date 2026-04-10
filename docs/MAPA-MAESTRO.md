# Mapa Maestro — EVA Fitness Platform

> Radiografia completa de donde estamos y hacia donde vamos.
> **Generado:** 2026-04-10 America/Santiago — basado en auditoria de 225+ archivos, 24 tablas BD, 38 rutas.

---

## 1. Donde Estamos — Estado Actual por Modulo

### Mapa Visual de Completitud

```mermaid
graph LR
    subgraph completado ["Completados (90%+)"]
        DirClientes["Directorio Clientes<br/>90%"]
        PerfilAlumno["Perfil Alumno Coach<br/>95%"]
        Builder["Constructor Planes<br/>95%"]
        BiblioProgs["Biblioteca Programas<br/>95%"]
        NutriCoach["Nutricion Coach<br/>93%"]
        DashAlumno["Dashboard Alumno<br/>98%"]
        NutriAlumno["Nutricion Alumno<br/>96%"]
    end

    subgraph avanzado ["En Progreso (50-89%)"]
        WorkoutExec["Workout Execution<br/>82%"]
        CheckIn["Check-in Alumno<br/>80%"]
        Infra["Infraestructura<br/>80%"]
        CatEjAlumno["Catalogo Ejerc Alumno<br/>68%"]
        Landing["Landing Page<br/>60%"]
        Onboarding["Onboarding Alumno<br/>58%"]
        AuthAlumno["Auth Alumno<br/>50%"]
    end

    subgraph parcial ["Parcial (25-49%)"]
        DashCoach["Dashboard Coach<br/>45%"]
        LoginCoach["Login Coach<br/>40%"]
        EjercCoach["Ejercicios Coach<br/>40%"]
        ResetPw["Forgot/Reset PW<br/>40%"]
        RegCoach["Registro Coach<br/>35%"]
        MiMarca["Mi Marca Settings<br/>35%"]
        Pricing["Pricing Page<br/>25%"]
    end

    subgraph pendiente ["No Implementado (0%)"]
        Pagos["Pagos y Suscripciones<br/>0%"]
        PanelCEO["Panel CEO<br/>0%"]
        Testing["Testing<br/>10%"]
    end
```

### Tabla de Estado Detallada

| # | Modulo | % | Linea de Codigo | Archivos | Impacto en Revenue |
|---|--------|---|----------------|----------|-------------------|
| 1 | Dashboard Alumno | 98% | ~3,500 | 39 | Alto (retención) |
| 2 | Nutricion Alumno | 96% | ~1,200 | 12 | Alto (retención) |
| 3 | Constructor Planes | 95% | ~4,000 | 17 | Alto (valor coach) |
| 4 | Biblioteca Programas | 95% | ~1,800 | 9 | Medio (eficiencia coach) |
| 5 | Perfil Alumno Coach | 95% | ~5,000 | 40 | Alto (decisiones coach) |
| 6 | Nutricion Coach | 93% | ~3,000 | 24 | Alto (valor coach) |
| 7 | Directorio Clientes | 90% | ~3,500 | 15 | Alto (gestión) |
| 8 | Workout Execution | 82% | ~2,000 | 10 | **Critico** (core loop alumno) |
| 9 | Infraestructura | 80% | ~1,500 | 15 | Critico (base) |
| 10 | Check-in Alumno | 80% | ~1,100 | 4 | Alto (seguimiento) |
| 11 | Catalogo Ejerc Alumno | 68% | ~500 | 3 | Bajo |
| 12 | Landing Page | 60% | ~970 | 1 | **Critico** (adquisición) |
| 13 | Onboarding Alumno | 58% | ~500 | 3 | Medio (activación) |
| 14 | Auth Alumno | 50% | ~400 | 6 | Medio |
| 15 | Dashboard Coach | 45% | ~700 | 4 | Alto (retención coach) |
| 16 | Ejercicios Coach | 40% | ~400 | 4 | Bajo |
| 17 | Login Coach | 40% | ~200 | 2 | Medio (adquisición) |
| 18 | Forgot/Reset PW | 40% | ~300 | 4 | Bajo |
| 19 | Mi Marca Settings | 35% | ~500 | 7 | Medio (diferenciación) |
| 20 | Registro Coach | 78% | ~480 | 4 | **Critico** (adquisición) |
| 21 | Pricing | 25% | ~200 | 1 | **Critico** (conversión) |
| 22 | Pagos & Suscripciones | 85% | ~820 | 11 | **BLOQUEANTE** (monetización) |
| 23 | Panel CEO | 0% | 0 | 0 | Alto (operaciones) |
| 24 | Testing | 10% | ~50 | 2 | Critico (calidad) |

**TOTAL ESTIMADO: ~62%**

---

## 2. Metricas de la Base de Codigo

| Metrica | Valor |
|---------|-------|
| Archivos TypeScript/TSX | 225+ |
| Tablas Supabase | 24 |
| Rutas (pages) | 38 |
| API Routes | 5 |
| Layouts | 4 |
| Loading states | 11 |
| Componentes UI (shadcn) | 25+ |
| Componentes compartidos | 53 |
| Dependencias production | 36 |
| Dependencias dev | 17 |
| Unit tests | 1 |
| E2E tests | 1 |
| Idiomas soportados | 2 (es, en) parcial |

---

## 3. Mapa de Dependencias entre Modulos

```mermaid
graph TD
    Pagos["Pagos & Suscripciones"]
    Registro["Registro Coach"]
    Landing["Landing + Pricing"]
    Login["Login Coach"]
    DashCoach["Dashboard Coach"]
    Directorio["Directorio Clientes"]
    Perfil["Perfil Alumno"]
    Builder["Constructor Planes"]
    Biblioteca["Biblioteca Programas"]
    NutriCoach["Nutricion Coach"]
    EjercCoach["Ejercicios Coach"]
    MiMarca["Mi Marca"]

    LoginAlumno["Login Alumno"]
    Onboarding["Onboarding"]
    DashAlumno["Dashboard Alumno"]
    WorkoutExec["Workout Execution"]
    CheckIn["Check-in"]
    NutriAlumno["Nutricion Alumno"]

    PanelCEO["Panel CEO"]
    Testing["Testing"]

    Pagos -->|"bloquea"| Registro
    Registro -->|"bloquea"| Landing
    Landing -->|"alimenta"| Login
    Login -->|"entra a"| DashCoach
    DashCoach -->|"navega a"| Directorio
    Directorio -->|"abre"| Perfil
    Perfil -->|"edita via"| Builder
    Builder -->|"usa"| Biblioteca
    Builder -->|"usa"| EjercCoach
    NutriCoach -->|"asigna a"| Perfil
    MiMarca -->|"estiliza"| LoginAlumno

    LoginAlumno -->|"entra a"| Onboarding
    Onboarding -->|"completa a"| DashAlumno
    DashAlumno -->|"lanza"| WorkoutExec
    DashAlumno -->|"lanza"| CheckIn
    DashAlumno -->|"lanza"| NutriAlumno

    Pagos -->|"reporta a"| PanelCEO
    Testing -->|"valida"| Pagos
```

---

## 4. Camino Critico hacia Monetizacion

El camino critico es la secuencia minima de trabajo que desbloquea ingresos:

```mermaid
graph LR
    A["1. Definir tiers + moneda<br/>(Producto, 1 dia)"] --> B["2. Integrar MercadoPago<br/>(Backend, 5-7 dias)"]
    B --> C["3. Flujo registro+pago<br/>(Fullstack, 3-4 dias)"]
    C --> D["4. Webhooks suscripcion<br/>(Backend, 2-3 dias)"]
    D --> E["5. Control acceso por tier<br/>(Fullstack, 2-3 dias)"]
    E --> F["6. Alinear landing+pricing<br/>(Frontend, 2-3 dias)"]
    F --> G["7. QA + fix bugs criticos<br/>(QA, 3-5 dias)"]
    G --> H["8. LANZAMIENTO BETA<br/>Coach real + alumnos"]
```

**Estimacion total camino critico: 18-26 dias de desarrollo**

---

## 5. Hacia Donde Vamos — Fases del Producto

### Fase 0: Pre-Revenue (ACTUAL — ~62%)
> Producto funcional para demos y testing interno. Sin monetizacion.

**Logros:**
- Core loop completo: coach crea programa → alumno ejecuta → coach revisa
- Nutricion end-to-end: plan → asignacion → tracking alumno
- Dashboard alumno premium (compliance, PRs, streaks, nutricion)
- Directorio coach con attention scores y War Room
- PWA funcional (instalar, branding por coach)

**Gaps criticos:**
- Sin pagos = sin revenue
- Sin tests = sin confianza para produccion
- Inconsistencias (moneda, auth callback, sw.js naming)

---

### Fase 1: Revenue MVP (~75%)
> Primer coach real pagando. Monetizacion basica operativa.

**Objetivos:**
- MercadoPago integrado (Chile, CLP)
- Registro coach con pago obligatorio
- Landing/Pricing alineados en CLP
- Control de acceso por tier de suscripcion
- Dashboard coach mejorado (KPIs utiles)
- Testing minimo viable (flujos criticos)
- Fix de bugs bloqueantes

**KPIs de exito:**
- 1+ coach pagando
- 0 errores criticos en flujo de pago
- Flujo registro→pago <3 minutos

---

### Fase 2: Product-Market Fit (~80%)
> 10+ coaches activos. Validacion del modelo.

**Objetivos:**
- Dashboard coach reworkeado (War Room style, tendencias)
- Mi Marca mejorado (mas opciones, preview actualizado)
- Workout execution pulido (offline, vibration, batch logging)
- Check-in completo (medidas, notas, mas fotos)
- Onboarding alumno refinado
- Panel CEO basico (MRR, coaches, churn)
- Notificaciones (email transaccional minimo)

**KPIs de exito:**
- 10+ coaches pagando
- Retention coach mes 2 > 60%
- NPS coach > 40

---

### Fase 3: Growth (~88%)
> Escalar adquisicion. 50+ coaches.

**Objetivos:**
- Push notifications (PWA + servidor)
- Email marketing automatizado
- Gamificacion avanzada (logros, leaderboards)
- i18n completo (toda la app en es + en)
- SEO tecnico + ASO
- Programa de referidos coach-to-coach
- API publica para integraciones

**KPIs de exito:**
- 50+ coaches pagando
- CAC < CLP 50.000
- LTV/CAC > 3

---

### Fase 4: Scale (~95%)
> Optimizar para volumen. 200+ coaches.

**Objetivos:**
- App movil nativa (Capacitor o React Native)
- Offline-first completo
- CDN + edge caching
- Multi-region Supabase
- Marketplace de templates
- Integraciones wearables (Apple Health, Google Fit)
- Compliance GDPR / ley chilena de proteccion de datos

**KPIs de exito:**
- 200+ coaches
- MRR > CLP 5M
- Uptime 99.9%

---

## 6. Riesgos Principales

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| No monetizar a tiempo (cash runway) | Alta | Critico | Fase 1 como prioridad absoluta |
| Migraciones SQL perdidas (schema drift) | Media | Alto | `supabase db pull` inmediato, workflow de migraciones |
| Performance con muchos coaches (queries N+1) | Media | Alto | React.cache, indexes, monitoreo |
| PWA limitada vs apps nativas (percepcion) | Media | Medio | Offline basico, push notifications, A2HS optimizado |
| Seguridad RLS no validada formalmente | Alta | Critico | Test E2E RLS antes de produccion |
| Competencia (Trainerize, TrueCoach, etc.) | Alta | Alto | Diferenciacion: white-label + mercado Chile/LATAM |
| Un solo developer (bus factor = 1) | Alta | Critico | Documentacion, tests, codigo limpio |

---

## 7. Quick Wins (alto impacto, bajo esfuerzo)

| # | Quick Win | Esfuerzo | Impacto |
|---|-----------|----------|---------|
| 1 | Crear `.env.example` | 15 min | Desarrollo |
| 2 | Borrar `ClientCard.tsx` V1 huerfano | 5 min | Limpieza |
| 3 | Fix auth callback redirect (`/auth/login` → `/login`) | 10 min | Bug fix |
| 4 | Renombrar cache sw.js (`omnicoach` → `eva`) | 10 min | Branding |
| 5 | Unificar `LIBRARY_PROGRAM_LIST_SELECT` | 30 min | DRY |
| 6 | Mover `puppeteer` a devDependencies | 5 min | Deploy size |
| 7 | Agregar `font-outfit` al root layout o eliminar referencias | 20 min | Visual fix |
| 8 | Commit migraciones SQL al repo | 1 hr | Seguridad |

---

## 8. Resumen Ejecutivo

**EVA** es una plataforma SaaS de fitness coaching con un **core product solido al ~62%**. Los modulos de mayor valor (constructor de planes, dashboard alumno, nutricion, directorio con attention scores) estan al **90-98%** de completitud y representan una ventaja competitiva real.

**El bloqueante numero uno es la monetizacion:** sin pagos integrados, no hay revenue. Todo lo demas (polish de UX, features nuevas, testing) es secundario hasta que un coach pueda pagar.

**Siguiente paso inmediato:** Fase 1 (Revenue MVP) — estimacion 18-26 dias de desarrollo para tener el primer coach pagando.

**Ventaja competitiva:** White-label real (cada coach tiene su propia "app" con su marca), mercado Chile/LATAM desatendido por competidores anglosajones, stack moderno (Next.js 16, RSC, Supabase), UX premium en los modulos completados.
