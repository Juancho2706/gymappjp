# Plan D — EVA Enterprise Mobile App
**Version:** 1.0 | **Date:** 2026-05-22 | **Priority:** P3

---

## Prerequisites (NO empezar sin estos)

- [ ] Plan A en producción y validado (enterprise.eva-app.cl live)
- [ ] Plan C completado (mobile coach/alumno parity done)
- [ ] org admin puede gestionar coaches + alumnos desde web
- [ ] Al menos 1 org enterprise real usando el sistema

---

## Scope

App mobile separada (o sección dentro del app actual) para **org_admin / org_owner** de organizaciones enterprise.

### Pantallas core (7)

| # | Ruta | Descripción |
|---|------|-------------|
| D.1 | `/org/home` | Dashboard: stats rápidas (coaches activos, alumnos total, alertas) |
| D.2 | `/org/coaches` | Lista de coaches del org con health score badge |
| D.3 | `/org/coaches/[coachId]` | Detalle coach: alumnos asignados, health score, acciones |
| D.4 | `/org/clients` | Pool de alumnos del org |
| D.5 | `/org/clients/[clientId]` | Detalle alumno: coach asignado, check-ins recientes |
| D.6 | `/org/announcements` | Enviar anuncio a coaches del org |
| D.7 | `/org/settings` | Branding org, billing info, cerrar sesión |

---

## Auth Flow

```
App launch
  ↓
AsyncStorage: tiene 'eva_org_session'?
  ↓ No → /org/login (email + password)
  ↓ Sí → validar con supabase.auth.getSession()
              ↓ válido → /org/home
              ↓ expirado → /org/login
```

JWT claims requeridos: `org_id`, `org_role` (`org_owner` o `org_admin`)
Si claims ausentes → logout + error "No tienes acceso a una organización"

---

## Theme

- **Accent:** `amber-400` (#F59E0B) — diferenciado del coach/alumno (primary #007AFF / #10B981)
- Background: oscuro (`#0F0F0F` o `theme.background` existente)
- Mismo ThemeContext — agregar `orgPrimary: '#F59E0B'` como token adicional

---

## Implementación

### D.1 — Org Home Dashboard

Stats cards (horizontal scroll o 2×2 grid):
- Coaches activos (count)
- Alumnos totales (count)
- Check-ins esta semana
- Coaches con health score < 60 (alerta roja)

Query: `organization_members` count + `clients` count via `coach_client_assignments` + `coach_health_scores`

### D.2 — Coaches List

FlatList con:
- Avatar inicial + nombre + email
- Badge health score (verde/amarillo/rojo según valor)
- Badge status (active/suspended)
- Tap → D.3

### D.3 — Coach Detail

- Nombre, email, slug
- Health score ring (reutilizar SVG ring de RestTimer)
- Lista alumnos asignados (`coach_client_assignments`)
- Acciones: Suspender / Reactivar (actualiza `organization_members.status`)
- Botón: Reasignar alumnos (sheet con lista)

### D.4 — Client Pool

FlatList todos los `clients` de coaches del org (via assignments)
- Nombre + coach asignado
- Badge: activo/inactivo
- Tap → D.5

### D.5 — Client Detail

- Nombre, datos básicos
- Coach asignado actual
- Últimos 3 check-ins (fecha + peso)
- Acción: Reasignar a otro coach

### D.6 — Announcements

- TextInput multiline (título + cuerpo)
- Preview de destinatarios (coaches activos del org)
- Enviar → llama `/api/org/announcements` (ya existe en web)

### D.7 — Org Settings

- Logo org (upload → Supabase Storage)
- Nombre org
- Plan actual + próxima facturación
- Botón cerrar sesión

---

## Archivos a crear

```
apps/mobile/app/org/
├── login.tsx                    ← nueva
├── (tabs)/
│   ├── home.tsx                 ← nueva
│   ├── coaches.tsx              ← nueva
│   ├── clients.tsx              ← nueva
│   └── settings.tsx             ← nueva
├── coaches/
│   └── [coachId].tsx           ← nueva
├── clients/
│   └── [clientId].tsx          ← nueva
└── announcements.tsx            ← nueva

apps/mobile/lib/
└── org-mobile.ts                ← queries org para mobile

apps/mobile/context/
└── OrgContext.tsx               ← org session + claims
```

---

## Routing Guard

En `apps/mobile/app/org/_layout.tsx`:
```tsx
// Verificar org_id + org_role en JWT claims
// Si ausente → redirect /org/login
```

Tab bar org: Home / Coaches / Alumnos / Ajustes
Color activo: amber-400

---

## Verificación

- [ ] Login org desde mobile funciona
- [ ] Dashboard muestra stats reales del org
- [ ] Suspender coach actualiza estado inmediatamente
- [ ] Anuncio llega a coaches (push o in-app)
- [ ] Cerrar sesión limpia AsyncStorage + session
- [ ] No puede ver datos de otro org (RLS verifica)

---

## Estimación

~3–4 sesiones de trabajo después de Plan A en prod.
No bloquea Plan C. Ejecutar último.
