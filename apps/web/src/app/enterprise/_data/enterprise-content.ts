import {
  Users2, ShieldCheck, BarChart3, Building2, Bell, Lock,
  Fingerprint, FileText, Zap, Globe, Database, Layers,
  XCircle,
} from 'lucide-react'

// ─── Constants ─────────────────────────────────────────────────────────────
export const CALENDLY_URL = 'https://calendly.com/contacto-eva-app/eva-enterprise'
export const CONTACT_EMAIL = 'contacto@eva-app.cl'
export const ENTERPRISE_LOGIN_PATH = '/org/login'

// ─── Hero ──────────────────────────────────────────────────────────────────
export const HERO = {
  eyebrow: 'EVA Enterprise · Gyms & Academias',
  headline: 'El sistema operativo\nde tu organización fitness',
  sub: 'Centraliza coaches, alumnos y datos en un solo panel. Sin hojas de cálculo. Sin silos. Con white-label por coach incluido.',
  ctaPrimary: 'Agendar demo de 30 min',
  ctaSecondary: 'Iniciar sesión',
  trustBadges: [
    'MFA obligatorio',
    'Datos aislados por RLS',
    'Ley 19.628 Chile',
    'SLA 99.5%',
    '30 días gratis',
  ],
} as const

// ─── Problem Statement ─────────────────────────────────────────────────────
export const PROBLEM = {
  eyebrow: 'El problema',
  headline: 'Gestionar un equipo de coaches es caótico',
  pains: [
    {
      title: 'Datos dispersos',
      desc: 'Cada coach tiene su planilla, su WhatsApp, sus notas. No hay visión consolidada.',
      icon: XCircle,
    },
    {
      title: 'Sin control de acceso',
      desc: 'Cualquier coach puede ver alumnos de otro. Privacidad comprometida.',
      icon: XCircle,
    },
    {
      title: 'Métricas invisibles',
      desc: 'No sabes quién trabaja bien ni quién está abandonando clientes.',
      icon: XCircle,
    },
  ],
  solution: {
    title: 'EVA Enterprise resuelve todo esto',
    desc: 'Panel unificado, datos aislados por RLS, reportes automáticos y white-label por coach — sin fricción técnica.',
  },
} as const

// ─── Features Bento ────────────────────────────────────────────────────────
export const FEATURES = [
  {
    icon: Users2,
    title: 'Pool de alumnos compartido',
    desc: 'Importa un CSV y asigna alumnos a cada coach con un clic. Historial y datos centralizados.',
    size: 'large',
  },
  {
    icon: ShieldCheck,
    title: 'Aislamiento total de datos',
    desc: 'Row-Level Security en PostgreSQL. Cada coach ve solo sus asignados — restricción técnica, no solo de UI.',
    size: 'normal',
  },
  {
    icon: BarChart3,
    title: 'Reportes de actividad',
    desc: 'Health score por coach, check-ins semanales, adherencia nutricional. Alertas automáticas cuando algo cae.',
    size: 'normal',
  },
  {
    icon: Building2,
    title: 'Panel centralizado',
    desc: 'Un admin gestiona el equipo completo: invitar coaches, reasignar alumnos, ver todas las métricas.',
    size: 'normal',
  },
  {
    icon: Bell,
    title: 'Anuncios al equipo',
    desc: 'Envía comunicados a todos tus coaches desde un solo lugar. Todos reciben notificación push.',
    size: 'normal',
  },
  {
    icon: Layers,
    title: 'Templates de nutrición',
    desc: 'Crea planes base que todo el equipo puede reutilizar. Consistencia nutricional en toda la org.',
    size: 'normal',
  },
  {
    icon: Globe,
    title: 'White-label por coach',
    desc: 'Cada coach mantiene su app con su nombre y URL propia. Tu gym, su marca, un solo backend.',
    size: 'large',
  },
  {
    icon: Lock,
    title: 'MFA obligatorio',
    desc: 'Doble factor para admins y propietarios. Cumplimiento de seguridad enterprise sin configuración extra.',
    size: 'normal',
  },
] as const

// ─── Use Cases ─────────────────────────────────────────────────────────────
export const USE_CASES = [
  {
    icon: Building2,
    title: 'Gimnasios urbanos',
    desc: 'Unifica tu equipo de coaches en un panel. Control de alumnos compartidos, reportes y métricas por coach.',
    tags: ['5–20 coaches', 'Alumnos compartidos', 'Reportes'],
  },
  {
    icon: Zap,
    title: 'Academias deportivas',
    desc: 'Deportes de equipo donde múltiples entrenadores trabajan con el mismo plantel. Aislamiento + coordinación.',
    tags: ['Multi-disciplina', 'Nutrición centralizada', 'Anuncios'],
  },
  {
    icon: Globe,
    title: 'Cadenas y franquicias',
    desc: 'Múltiples sedes, un panel. Cada ubicación con sus coaches; el dueño con visión global.',
    tags: ['Multi-sede', 'White-label por sede', 'Control total'],
  },
  {
    icon: Users2,
    title: 'Federaciones y selecciones',
    desc: 'Coaching de alto rendimiento con staff técnico múltiple. Perfiles médicos, nutrición y rendimiento unificados.',
    tags: ['Alto rendimiento', 'Múltiples roles', 'Exportación PDF'],
  },
] as const

// ─── Security & Compliance ─────────────────────────────────────────────────
export const SECURITY = {
  eyebrow: 'Seguridad enterprise',
  headline: 'Diseñado para cumplimiento real',
  items: [
    {
      icon: Fingerprint,
      title: 'MFA obligatorio',
      desc: 'TOTP de dos factores requerido para org_owner y org_admin antes de acceder al panel. No se puede omitir.',
    },
    {
      icon: Database,
      title: 'Row-Level Security',
      desc: 'RLS nativo de PostgreSQL via Supabase. Aislamiento de datos a nivel de base de datos, no solo de API.',
    },
    {
      icon: Lock,
      title: 'Cookies aisladas por subdominio',
      desc: 'Sessions de enterprise.eva-app.cl no se comparten con eva-app.cl. Aislamiento CSRF cross-subdomain intencional.',
    },
    {
      icon: FileText,
      title: 'Audit log inmutable',
      desc: 'Cada acción admin queda registrada en org_audit_logs con checksums. Trazabilidad completa.',
    },
    {
      icon: ShieldCheck,
      title: 'Ley 19.628 / 21.719 Chile',
      desc: 'DPA incluido en contrato enterprise. Procesamiento de datos personales según normativa chilena vigente.',
    },
    {
      icon: Zap,
      title: 'Rate limiting edge',
      desc: 'Protección anti-brute-force en login via Upstash Redis. Límites por IP en endpoints sensibles.',
    },
  ],
} as const

// ─── Integrations ──────────────────────────────────────────────────────────
export const INTEGRATIONS = [
  { name: 'MercadoPago', desc: 'Pagos y pre-aprobaciones', status: 'active' },
  { name: 'Supabase', desc: 'Base de datos + Auth + RLS', status: 'active' },
  { name: 'Resend', desc: 'Email transaccional y drip', status: 'active' },
  { name: 'Web Push', desc: 'Notificaciones push nativas', status: 'active' },
  { name: 'PostHog', desc: 'Analytics y feature flags', status: 'active' },
  { name: 'Upstash Redis', desc: 'Rate limiting edge', status: 'active' },
  { name: 'Calendly', desc: 'Booking de demos', status: 'active' },
  { name: 'API REST custom', desc: 'Integración vía webhook', status: 'soon' },
] as const

// ─── FAQ ───────────────────────────────────────────────────────────────────
export const FAQS = [
  {
    q: '¿Cómo se maneja la privacidad entre coaches?',
    a: 'Cada coach ve exclusivamente los alumnos que tiene asignados. El aislamiento se implementa con Row-Level Security (RLS) en PostgreSQL — es una restricción técnica de base de datos, no solo una validación de interfaz.',
  },
  {
    q: '¿Los coaches mantienen su panel individual de EVA?',
    a: 'Sí. Los coaches mantienen acceso completo a su panel individual (eva-app.cl/c/su-slug). El plan Enterprise agrega el panel organizacional como capa adicional sin reemplazar nada.',
  },
  {
    q: '¿Es obligatorio el MFA para todos?',
    a: 'MFA es obligatorio para org_owner y org_admin antes de acceder al panel enterprise. Los coaches en su panel individual no están obligados salvo que tu organización lo requiera.',
  },
  {
    q: '¿Puedo migrar cuentas individuales existentes al plan Enterprise?',
    a: 'Sí. Hacemos el proceso de migración en el onboarding. Los coaches mantienen su historial, alumnos y configuración. El proceso toma menos de 30 minutos por organización.',
  },
  {
    q: '¿Qué pasa con los alumnos que ya tienen los coaches?',
    a: 'Se mantienen tal como están. La Enterprise solo agrega la capa de organización: pool compartido, visibilidad del admin y reportes. Los alumnos existentes de cada coach no se ven afectados.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Sí, con 15 días de aviso por correo. Sin penalidades ni compromisos de permanencia. Los datos se retienen 90 días para facilitar la migración de salida.',
  },
  {
    q: '¿Hay contrato formal?',
    a: 'Sí. Firmamos un Contrato de Servicio Enterprise que incluye SLA, DPA (conforme a Ley 21.719) y condiciones de terminación. Puedes ver el contrato en el footer antes de firmar.',
  },
  {
    q: '¿Funciona en Chile solamente?',
    a: 'El producto funciona en cualquier país hispanohablante. Los pagos B2B se hacen por transferencia bancaria o MercadoPago (CLP o USD según acuerdo). Soporte en español.',
  },
  {
    q: '¿Cuánto tarda el onboarding?',
    a: 'El onboarding estándar dura 2-3 días hábiles. Incluye configuración de la organización, invitación de coaches, y migración de alumnos existentes. Tienes un punto de contacto durante todo el proceso.',
  },
  {
    q: '¿Tienen SLA por escrito?',
    a: 'Sí. Starter y Pro tienen SLA de 99% mensual. Elite y Enterprise tienen SLA de 99.5% con compensación en créditos si no se cumple. Incluido en el contrato.',
  },
] as const

// ─── ROI Comparison ────────────────────────────────────────────────────────
export const ROI_CONTENT = {
  eyebrow: 'Calculá tu ahorro',
  headline: 'Cuentas individuales cuestan más de lo que pensás',
  sub: 'Mové el slider para ver cuánto ahorra tu gym con un plan Enterprise.',
  comparisonLabel: {
    individual: 'Cuentas individuales EVA',
    enterprise: 'Plan Enterprise EVA',
    savings: 'Ahorro mensual',
    annualSavings: 'Ahorro anual',
  },
} as const

// ─── Testimonials placeholder ──────────────────────────────────────────────
export const TESTIMONIALS = [
  {
    quote: 'Pasamos de manejar 8 coaches por WhatsApp a tener visibilidad total en un panel. El cambio fue inmediato.',
    author: 'Nicolás R.',
    role: 'Director, Gym Urbano Santiago',
    initials: 'NR',
  },
  {
    quote: 'El aislamiento de datos por coach fue la funcionalidad que nos convenció. Nuestros alumnos son nuestro activo más importante.',
    author: 'Catalina M.',
    role: 'Dueña, Academia CrossFit Providencia',
    initials: 'CM',
  },
  {
    quote: 'Onboarding impecable. En 2 días teníamos a todos los coaches dentro y el historial migrado.',
    author: 'Rodrigo V.',
    role: 'CEO, Cadena Fit Network (3 sedes)',
    initials: 'RV',
  },
] as const
