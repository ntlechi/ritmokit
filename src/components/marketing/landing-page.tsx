"use client";

import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ClipboardCheck,
  DoorOpen,
  HeartHandshake,
  Lock,
  MapPin,
  Music2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";

const STATIONS = [
  {
    name: "Studio A",
    time: "18 h — 19 h 30",
    badge: "Salsa L1",
    ring: "ring-rose-400/40",
    chip: "bg-rose-400/15 text-rose-300",
    bar: "from-rose-400 to-pink-500",
  },
  {
    name: "Accueil",
    time: "17 h 45 — 22 h",
    badge: "Check-in",
    ring: "ring-emerald-400/40",
    chip: "bg-emerald-400/15 text-emerald-300",
    bar: "from-emerald-400 to-teal-500",
  },
  {
    name: "Studio B",
    time: "19 h 30 — 21 h",
    badge: "Bachata",
    ring: "ring-violet-400/40",
    chip: "bg-violet-400/15 text-violet-300",
    bar: "from-violet-400 to-indigo-500",
  },
] as const;

const COMPARISON = [
  {
    label: "Salles & départements",
    ritmokit: "Studios bookables + instructeurs, Accueil, direction — multi-salle natif",
    legacy: "Feuilles Excel par salle, conflits manuels",
  },
  {
    label: "Parité Lead / Follow",
    ritmokit: "Moteur intégré, listes d'attente par rôle, promotion auto",
    legacy: "Comptage manuel, Déséquilibre découvert le soir du cours",
  },
  {
    label: "Inscriptions publiques",
    ritmokit: "API headless + PayPal — le site web du studio reste la vitrine",
    legacy: "Formulaires déconnectés, double saisie",
  },
  {
    label: "Accueil & check-in",
    ritmokit: "Tablette 1-clic, parité en direct, cours du jour",
    legacy: "Feuille papier à l'entrée",
  },
  {
    label: "Paie instructeurs",
    ritmokit: "Horaire, forfait ou commission par cours — export paie Québec",
    legacy: "Calculs manuels chaque période",
  },
  {
    label: "Conformité CNESST",
    ritmokit: "Garde-fous avant publication des quarts staff",
    legacy: "Violations découvertes à la paie",
  },
] as const;

function SectionHalo({ tone }: { tone: "indigo" | "violet" | "cyan" }) {
  const gradient = {
    indigo:
      "radial-gradient(ellipse 60% 50% at 50% 0%, rgb(255 255 255 / 0.08), transparent 65%)",
    violet:
      "radial-gradient(ellipse 55% 45% at 15% 20%, rgb(255 255 255 / 0.06), transparent 62%)",
    cyan: "radial-gradient(ellipse 50% 45% at 85% 15%, rgb(34 211 238 / 0.10), transparent 60%)",
  }[tone];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{ background: gradient }}
    />
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
      {children}
    </span>
  );
}

function GradientTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
      {children}
    </h2>
  );
}

function HeroShiftCard() {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % STATIONS.length), 3200);
    return () => clearInterval(t);
  }, []);
  const s = STATIONS[i];

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-white/15 via-white/5 to-cyan-400/10 blur-3xl"
      />
      <div className="rounded-[2.5rem] border border-white/[0.08] bg-zinc-900/60 p-3 shadow-2xl backdrop-blur-xl">
        <div className="rounded-[2rem] border border-white/[0.05] bg-zinc-950 p-5">
          <div className="mb-5 flex items-center justify-between text-[10px] text-zinc-500">
            <span>9:41</span>
            <span className="font-semibold tracking-widest text-zinc-400">RITMOKIT</span>
            <Wifi className="h-3 w-3" />
          </div>
          <p className="text-xs font-medium text-zinc-500">Prochain cours · ce soir</p>
          <div
            className={`relative mt-3 overflow-hidden rounded-2xl border bg-zinc-900/80 p-4 ring-2 ${s.ring}`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.bar}`} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-white">{s.name}</p>
                <p className="mt-1 text-sm text-zinc-400">{s.time}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>
                {s.badge}
              </span>
            </div>
            <p className="mt-3 text-xs text-zinc-400">12 Leads · 11 Follows · 1 place Follow</p>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-zinc-200">
              <HeartHandshake className="h-4 w-4" />
            </span>
            <p className="text-xs text-zinc-300">
              <span className="font-semibold text-white">Jade</span> t&apos;a envoyé un shout-out ·{" "}
              <span className="text-zinc-200">« L&apos;équipe d&apos;abord »</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParityMicroUI() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-widest text-rose-400">Parité · Salsa L2</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          { role: "Leads", filled: 14, max: 16, color: "text-rose-300" },
          { role: "Follows", filled: 16, max: 16, color: "text-violet-300" },
        ].map((r) => (
          <div key={r.role} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <p className={`text-sm font-bold ${r.color}`}>{r.role}</p>
            <p className="mt-1 text-2xl font-bold text-white">
              {r.filled}
              <span className="text-sm text-zinc-500">/{r.max}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">Liste d&apos;attente Follow — promotion auto si un Lead paie.</p>
    </div>
  );
}

function AccueilMicroUI() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Accueil · 18 h 05</p>
      <div className="mt-4 space-y-2">
        {["Marie L. — Salsa L1 ✓", "Karim D. — Bachata L2 ✓", "Sophie P. — en attente paiement"].map(
          (row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-xl border border-white/[0.05] px-3 py-2.5 text-sm text-zinc-300"
            >
              <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              {row}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function RoomsMicroUI() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Salles · ce soir</p>
      <div className="mt-4 space-y-2">
        {[
          { room: "Studio A", pct: 92 },
          { room: "Studio B", pct: 78 },
          { room: "Studio C", pct: 45 },
        ].map((r) => (
          <div key={r.room}>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-300">{r.room}</span>
              <span className="text-zinc-500">{r.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureRow({
  eyebrow,
  eyebrowClass,
  title,
  copy,
  points,
  visual,
  reversed,
}: {
  eyebrow: string;
  eyebrowClass: string;
  title: string;
  copy: string;
  points: string[];
  visual: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
        reversed ? "lg:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div>
        <p className={`text-xs font-bold uppercase tracking-[0.2em] ${eyebrowClass}`}>{eyebrow}</p>
        <h3 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h3>
        <p className="mt-4 leading-relaxed text-zinc-400">{copy}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-zinc-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Check className="h-3 w-3 text-zinc-200" />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="card-lift">{visual}</div>
    </div>
  );
}

export default function RitmoKitLandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased">
      <header className="header-hairline sticky top-0 z-40 border-b border-white/[0.04] bg-zinc-950/70 pt-safe backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <p className="text-lg font-bold tracking-tight text-white">RitmoKit</p>
          <div className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#systeme" className="hover:text-white">
              Le système
            </a>
            <a href="#comparaison" className="hover:text-white">
              RitmoKit vs le reste
            </a>
            <a href="#pilote" className="hover:text-white">
              Pilote studio
            </a>
          </div>
          <a
            href="#pilote"
            className="card-lift rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 shadow-xs hover:bg-zinc-200"
          >
            Réserver une démo
          </a>
        </nav>
      </header>

      <section className="relative px-6 pb-24 pt-20 sm:pt-28">
        <SectionHalo tone="indigo" />
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
          <div>
            <Eyebrow>
              <Zap className="h-3.5 w-3.5" /> Studio OS · danse & fitness
            </Eyebrow>
            <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Vos cours ne sont pas le problème.
              </span>
              <br />
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Votre système d&apos;exploitation, oui.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
              RitmoKit est le kit d&apos;opérations pour écoles de danse : sessions, parité
              Lead/Follow, salles, Accueil, paie instructeurs et site public — une seule source de
              vérité pour votre studio.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#pilote"
                className="card-lift inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-semibold text-zinc-900 shadow-sm hover:bg-zinc-200"
              >
                Réserver une démo pilote <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#systeme"
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.02] px-7 py-3.5 font-semibold text-zinc-200 backdrop-blur hover:border-white/20 hover:text-white"
              >
                Voir le système
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-500">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-300" /> Conforme CNESST
              </span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-cyan-300" /> Données hébergées au Canada
              </span>
            </div>
          </div>
          <HeroShiftCard />
        </div>
      </section>

      <section id="systeme" className="relative px-6 py-24">
        <SectionHalo tone="violet" />
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <Eyebrow>Le système</Eyebrow>
            <GradientTitle>Quatre piliers que les agendas génériques ne couvrent pas.</GradientTitle>
          </div>
          <div className="mt-20 space-y-28">
            <FeatureRow
              eyebrow="Parité Lead / Follow"
              eyebrowClass="text-rose-400"
              title="Chaque place compte — et chaque rôle aussi."
              copy="Le moteur de parité bloque les déséquilibres, gère les listes d'attente par rôle et promeut automatiquement quand une place se libère. Fini le « on manque de Follows » découvert à 18 h 55."
              points={[
                "Quotas Lead/Follow par cours",
                "Promotion waitlist après paiement confirmé",
                "Visible en Accueil et dans le cockpit",
              ]}
              visual={<ParityMicroUI />}
            />
            <FeatureRow
              reversed
              eyebrow="Accueil & check-in"
              eyebrowClass="text-emerald-400"
              title="La file du lundi soir, réglée en un tap."
              copy="Tablette Accueil : cours du jour, parité en direct, check-in 1-clic. Votre équipe accueille les élèves au lieu de chercher des noms sur une feuille."
              points={[
                "Timeline des cours du jour",
                "Marquer présent / payé en un geste",
                "Conçu pour tablette en entrée de studio",
              ]}
              visual={<AccueilMicroUI />}
            />
            <FeatureRow
              eyebrow="Multi-salles"
              eyebrowClass="text-cyan-400"
              title="Cinq studios, un calendrier, zéro conflit."
              copy="Chaque salle a sa capacité, sa superficie et son yield. Les cours bloquent les créneaux ; les locations privées respectent les buffers — prêt pour l'accès autonome."
              points={[
                "Matrice salles + départements staff",
                "Analytics $/m² par studio",
                "API publique pour le site du studio",
              ]}
              visual={<RoomsMicroUI />}
            />
            <FeatureRow
              reversed
              eyebrow="Équipe & culture"
              eyebrowClass="text-zinc-300"
              title="HR, paie et culture — pas un outil séparé."
              copy="Instructeurs, Accueil, direction : onboarding, pointeuse, reviews, shout-outs et export paie Québec dans le même OS que vos inscriptions."
              points={[
                "Paie horaire, forfait ou commission par cours",
                "Constitution culture studio + Pulse",
                "Trilingue FR / EN / ES",
              ]}
              visual={
                <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-zinc-300" />
                    <Music2 className="h-5 w-5 text-rose-300" />
                    <DoorOpen className="h-5 w-5 text-cyan-300" />
                    <Sparkles className="h-5 w-5 text-violet-300" />
                  </div>
                  <p className="mt-4 text-sm text-zinc-300">
                    Un seul tableau de bord pour ops studio, pas cinq abonnements disjoints.
                  </p>
                </div>
              }
            />
          </div>
        </div>
      </section>

      <section id="comparaison" className="relative px-6 py-24">
        <SectionHalo tone="cyan" />
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>RitmoKit vs outils génériques</Eyebrow>
            <GradientTitle>Un OS studio contre des calendriers glorifiés.</GradientTitle>
            <p className="mt-5 text-lg text-zinc-400">
              Mindbody planifie des cours. RitmoKit opère votre école de danse au Québec.
            </p>
          </div>
          <div className="card-lift mt-14 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/40 backdrop-blur">
            <div className="grid grid-cols-[1fr_1.4fr_1.4fr] border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 text-sm font-bold">
              <span className="text-zinc-500" />
              <span className="text-white">RitmoKit</span>
              <span className="text-zinc-500">Outils génériques</span>
            </div>
            {COMPARISON.map((row, idx) => (
              <div
                key={row.label}
                className={`grid grid-cols-[1fr_1.4fr_1.4fr] gap-4 px-6 py-5 text-sm ${
                  idx !== COMPARISON.length - 1 ? "border-b border-white/[0.04]" : ""
                }`}
              >
                <span className="font-semibold text-zinc-300">{row.label}</span>
                <span className="flex items-start gap-2 text-zinc-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  {row.ritmokit}
                </span>
                <span className="flex items-start gap-2 text-zinc-500">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                  {row.legacy}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pilote" className="relative px-6 py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 55% 60% at 50% 60%, rgb(255 255 255 / 0.1), transparent 65%)",
          }}
        />
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>
            <MapPin className="h-3.5 w-3.5" /> Pilote fondateur · Québec
          </Eyebrow>
          <h2 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Rejoignez le premier studio pilote RitmoKit.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            Sessions live, Accueil, parité, salles et site public — déployés avec un studio partenaire
            au Québec. Places limitées pour l&apos;accompagnement fondateur.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:hello@ritmokit.com"
              className="card-lift inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-semibold text-zinc-900 shadow-sm hover:bg-zinc-200"
            >
              Réserver une démo <ArrowRight className="h-5 w-5" />
            </a>
          </div>
          <p className="mt-6 text-sm text-zinc-500">30 minutes · votre studio · sans engagement</p>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
          <p>
            <span className="font-bold text-zinc-300">RitmoKit</span> — Le kit d&apos;opérations pour
            écoles de danse.
          </p>
          <p>© {new Date().getFullYear()} RitmoKit · Montréal, QC · Données hébergées au Canada</p>
        </div>
      </footer>
    </main>
  );
}
