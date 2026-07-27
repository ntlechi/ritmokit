"use client";

/**
 * Mirok — Landing page marketing (mirok.com)
 * Design system : "Modernist Organic" dark-first — halos zinc discrets, glassmorphism.
 * Composant autonome : Tailwind inline + lucide-react uniquement.
 */

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChefHat,
  Flame,
  GraduationCap,
  HeartHandshake,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wifi,
  X,
  Zap,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Données de démonstration (micro-UIs produit)
   ──────────────────────────────────────────────────────────── */

const STATIONS = [
  {
    name: "Cuisine",
    time: "11 h — 19 h",
    badge: "Rush midi",
    ring: "ring-amber-400/40",
    chip: "bg-amber-400/15 text-amber-300",
    bar: "from-amber-400 to-orange-500",
  },
  {
    name: "Service",
    time: "16 h — 23 h",
    badge: "Soir",
    ring: "ring-cyan-400/40",
    chip: "bg-cyan-400/15 text-cyan-300",
    bar: "from-cyan-400 to-sky-500",
  },
  {
    name: "Entretien",
    time: "22 h — 1 h",
    badge: "Fermeture",
    ring: "ring-zinc-400/40",
    chip: "bg-zinc-400/15 text-zinc-300",
    bar: "from-zinc-400 to-zinc-600",
  },
] as const;

const COMPARISON = [
  {
    label: "Stations de plancher",
    mirok: "Multi-tenant dynamiques — configurées par bannière",
    legacy: "Créneaux codés en dur, identiques partout",
  },
  {
    label: "Conformité CNESST",
    mirok: "Garde-fous automatisés avant publication (repos 32 h, certifications)",
    legacy: "Révision manuelle, violations découvertes à la paie",
  },
  {
    label: "Trou de dernière minute",
    mirok: "Code Rouge : bassin interne qualifié, premier clic gagnant",
    legacy: "Textos en rafale ou mercenaires externes non formés",
  },
  {
    label: "Labor cost",
    mirok: "Courbe temps réel main-d’œuvre vs ventes, heure par heure",
    legacy: "Rapport post-mortem le lundi suivant",
  },
  {
    label: "Punch d’horodateur",
    mirok: "Verrou physique Wi-Fi + géorepérage — aucun punch hors site",
    legacy: "Punch possible depuis le stationnement (ou le sofa)",
  },
  {
    label: "Culture d’équipe",
    mirok: "Pulse + Shout-outs intégrés au clock-out, chaque quart",
    legacy: "Sondage annuel RH que personne ne remplit",
  },
] as const;

/* ────────────────────────────────────────────────────────────
   Primitives internes
   ──────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────
   Hero — carte mobile animée de Sam
   ──────────────────────────────────────────────────────────── */

function HeroShiftCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % STATIONS.length), 3200);
    return () => clearInterval(t);
  }, []);
  const s = STATIONS[i];

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* Halo derrière le téléphone */}
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-white/15 via-white/5 to-cyan-400/10 blur-3xl"
      />
      <div className="rounded-[2.5rem] border border-white/[0.08] bg-zinc-900/60 p-3 shadow-2xl backdrop-blur-xl">
        <div className="rounded-[2rem] border border-white/[0.05] bg-zinc-950 p-5">
          {/* Barre de statut fictive */}
          <div className="mb-5 flex items-center justify-between text-[10px] text-zinc-500">
            <span>9:41</span>
            <span className="font-semibold tracking-widest text-zinc-400">MIROK</span>
            <Wifi className="h-3 w-3" />
          </div>

          <p className="text-xs font-medium text-zinc-500">Ton prochain quart</p>

          {/* Carte héro — change de couleur selon la station */}
          <div
            key={s.name}
            className={`relative mt-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/80 p-4 ring-1 transition-all duration-700 ${s.ring}`}
          >
            {/* Balayage shimmer */}
            <div
              aria-hidden
              className="mirok-shimmer pointer-events-none absolute inset-0"
            />
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.bar}`} />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-white">{s.name}</p>
                <p className="mt-0.5 text-sm text-zinc-400">{s.time}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${s.chip}`}
              >
                {s.badge}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
              <MapPin className="h-3.5 w-3.5" />
              Succursale Plateau — vérifié Wi-Fi
            </div>
          </div>

          {/* Rappel formation */}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-zinc-200">
              <GraduationCap className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-zinc-200">
                Module J3 débloqué : Salubrité — friteuse
              </p>
              <p className="text-[10px] text-zinc-500">4 min · obligatoire avant samedi</p>
            </div>
          </div>

          {/* Shout-out */}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-zinc-200">
              <HeartHandshake className="h-4 w-4" />
            </span>
            <p className="text-xs text-zinc-300">
              <span className="font-semibold text-white">Léa</span> t’a envoyé un
              shout-out · <span className="text-zinc-200">« Esprit d’équipe »</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Micro-UIs produit — The Crunch Matrix
   ──────────────────────────────────────────────────────────── */

function CodeRougeMicroUI() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-zinc-900/40 p-5 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-500 via-orange-400 to-red-500" />
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <p className="text-xs font-bold uppercase tracking-widest text-red-400">
          Code Rouge · actif
        </p>
        <span className="ml-auto text-[10px] text-zinc-500">il y a 12 s</span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-bold text-white">
            <ChefHat className="h-4 w-4 text-amber-300" /> Cuisine — 17 h à 22 h
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Aujourd’hui · Succursale Plateau
          </p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-cyan-400/15 px-3 py-1 text-sm font-bold text-cyan-300">
          +2,50 $/h
        </span>
      </div>
      <button
        type="button"
        className="card-lift mt-4 w-full rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white shadow-xs"
      >
        Je prends le quart — premier clic gagnant
      </button>
      <p className="mt-3 text-center text-[11px] text-zinc-500">
        Diffusé à 14 employés qualifiés, disponibles et conformes CNESST
      </p>
    </div>
  );
}

function VerrousMicroUI() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          Horodateur — tentative de punch
        </p>
        <Lock className="h-4 w-4 text-zinc-500" />
      </div>
      <div className="mt-4 space-y-2.5">
        {[
          { label: "Réseau Wi-Fi du restaurant détecté", ok: true },
          { label: "Géorepérage : à l’intérieur du périmètre", ok: true },
          { label: "Quart planifié dans les 15 prochaines minutes", ok: true },
          { label: "Punch à 14 h 12 pour un quart de 17 h", ok: false },
        ].map((row) => (
          <div
            key={row.label}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
              row.ok
                ? "border-emerald-400/15 bg-emerald-400/[0.04] text-zinc-300"
                : "border-red-400/20 bg-red-400/[0.05] text-zinc-300"
            }`}
          >
            {row.ok ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <X className="h-4 w-4 shrink-0 text-red-400" />
            )}
            {row.label}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Punch refusé → zéro minute fantôme sur la paie.
      </p>
    </div>
  );
}

function CultureMicroUI() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          Fin de quart — 23 h 04
        </p>
        <Sparkles className="h-4 w-4 text-zinc-300" />
      </div>
      <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-white">
              4,7<span className="text-lg text-zinc-500">/5</span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">Santé de culture · 30 jours</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-300">
            <TrendingUp className="h-3 w-3" /> +0,4
          </span>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-sm text-zinc-200">
          <span className="font-bold text-white">Sam → Karim :</span> « T’as tenu le
          rush de 18 h en solo. Chapeau. »
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-200">
          <HeartHandshake className="h-3 w-3" /> Valeur : On se couvre
        </span>
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Pulse anonyme + shout-outs, câblés au clock-out. Chaque quart nourrit la
        culture.
      </p>
    </div>
  );
}

function OnboardingMicroUI() {
  const steps = [
    { j: "J1", label: "Accueil & code vestimentaire", done: true },
    { j: "J2", label: "Stations & plan de salle", done: true },
    { j: "J3", label: "Salubrité — équipement chaud", done: true },
    { j: "J4", label: "Caisse & protocoles de rush", active: true },
    { j: "J5", label: "Autonomie plancher — validation gérant", locked: true },
  ];
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/40 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          Parcours J1–J5 · ancienneté : 4 jours
        </p>
        <GraduationCap className="h-4 w-4 text-zinc-300" />
      </div>
      <div className="mt-4 space-y-2">
        {steps.map((s) => (
          <div
            key={s.j}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              s.active
                ? "border-white/20 bg-white/[0.07]"
                : "border-white/[0.04] bg-white/[0.01]"
            }`}
          >
            <span
              className={`flex h-7 w-11 items-center justify-center rounded-lg text-xs font-bold ${
                s.done
                  ? "bg-emerald-400/15 text-emerald-300"
                  : s.active
                    ? "bg-white text-zinc-900"
                    : "bg-white/[0.04] text-zinc-600"
              }`}
            >
              {s.done ? <Check className="h-3.5 w-3.5" /> : s.j}
            </span>
            <p
              className={`text-sm ${s.locked ? "text-zinc-600" : "text-zinc-200"}`}
            >
              {s.label}
            </p>
            {s.locked && <Lock className="ml-auto h-3.5 w-3.5 text-zinc-600" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Les modules se débloquent selon l’ancienneté — configurable par bannière via
        le Brand Kit.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Rangée de feature (copy + micro-UI)
   ──────────────────────────────────────────────────────────── */

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
        <p
          className={`text-xs font-bold uppercase tracking-[0.2em] ${eyebrowClass}`}
        >
          {eyebrow}
        </p>
        <h3 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {title}
        </h3>
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

/* ────────────────────────────────────────────────────────────
   Composant principal
   ──────────────────────────────────────────────────────────── */

export default function MirokLandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased">
      {/* Keyframes locales (shimmer du hero) */}
      <style>{`
        @keyframes mirok-shimmer {
          0% { transform: translateX(-100%) skewX(-12deg); }
          60%, 100% { transform: translateX(220%) skewX(-12deg); }
        }
        .mirok-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 45%;
          background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.07), transparent);
          animation: mirok-shimmer 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>

      {/* ── NAV ── */}
      <header className="header-hairline sticky top-0 z-40 border-b border-white/[0.04] bg-zinc-950/70 pt-safe backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <p className="text-lg font-bold tracking-tight text-white">Mirok</p>
          <div className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#systeme" className="hover:text-white">Le système</a>
            <a href="#comparaison" className="hover:text-white">Mirok vs le reste</a>
            <a href="#pilote" className="hover:text-white">Programme pilote</a>
          </div>
          <a
            href="#pilote"
            className="card-lift rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 shadow-xs hover:bg-zinc-200"
          >
            Réserver une démo
          </a>
        </nav>
      </header>

      {/* ── HERO ── */}
      <section className="relative px-6 pb-24 pt-20 sm:pt-28">
        <SectionHalo tone="indigo" />
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
          <div>
            <Eyebrow>
              <Zap className="h-3.5 w-3.5" /> Franchise OS · QSR & fast-casual
            </Eyebrow>
            <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Vos horaires ne sont pas le problème.
              </span>
              <br />
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Votre système d’exploitation, oui.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
              Mirok est le premier système d’exploitation de franchise conçu pour la
              restauration rapide. Une opération blindée : zéro dollar de
              main-d’œuvre qui fuit, zéro violation CNESST qui se rend à la paie,
              zéro culture qui s’effrite entre deux rushs.
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
                Voir l’anatomie du système
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-500">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-300" /> Conforme CNESST par
                design
              </span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-cyan-300" /> Données hébergées au
                Canada
              </span>
            </div>
          </div>
          <HeroShiftCard />
        </div>
      </section>

      {/* ── THE CRUNCH MATRIX ── */}
      <section id="systeme" className="relative px-6 py-24">
        <SectionHalo tone="violet" />
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <Eyebrow>L’anatomie du système</Eyebrow>
            <GradientTitle>
              Quatre verrous structurels que les apps d’horaires de 2014 ne peuvent
              pas copier.
            </GradientTitle>
          </div>

          <div className="mt-20 space-y-28">
            <FeatureRow
              eyebrow="🚨 Protocole Code Rouge"
              eyebrowClass="text-red-400"
              title="« Il me faut quelqu’un dans 2 heures. » Réglé en 90 secondes."
              copy="Un trou de dernière minute ne devrait jamais se régler à coups de textos paniqués ou d’un pigiste externe qui ne connaît ni votre cuisine ni vos SOP. Code Rouge mobilise instantanément votre liquidité interne qualifiée : les employés disponibles, formés sur la station et conformes CNESST reçoivent une alerte flash avec prime incitative. Premier clic gagnant."
              points={[
                "Diffusion atomique aux seuls profils qualifiés et disponibles",
                "Prime de surge configurable (ex. +2,50 $/h) par succursale",
                "Aucun mercenaire externe : votre monde, vos standards, votre marque",
              ]}
              visual={<CodeRougeMicroUI />}
            />

            <FeatureRow
              reversed
              eyebrow="🛡️ Les verrous opérationnels"
              eyebrowClass="text-emerald-400"
              title="Impossible de puncher si tu n’es pas physiquement sur le plancher."
              copy="Le vol de temps ne se règle pas avec des politiques : il se règle avec des contraintes physiques. L’horodateur Mirok valide le réseau Wi-Fi du restaurant et le géorepérage avant d’accepter le moindre punch, et refuse tout punch hors horaire. Les minutes fantômes disparaissent de votre labor cost avant même d’exister."
              points={[
                "Validation Wi-Fi routeur + géorepérage à chaque punch",
                "Blocage des punchs hors horaire et des dépassements non approuvés",
                "Kiosque tablette avec NIP 4 chiffres — zéro punch par un collègue",
              ]}
              visual={<VerrousMicroUI />}
            />

            <FeatureRow
              eyebrow="🤝 La constitution culturelle"
              eyebrowClass="text-zinc-300"
              title="La culture ne se décrète pas en réunion. Elle se mesure à chaque clock-out."
              copy="Chaque fin de quart déclenche une boucle : un pulse anonyme de 10 secondes et la possibilité d’envoyer un shout-out lié à une valeur de votre bannière. Vous obtenez un indice de santé de culture vivant, succursale par succursale — pas un sondage annuel que tout le monde ignore."
              points={[
                "Pulse anonyme intégré à la séquence de clock-out",
                "Shout-outs pair-à-pair rattachés à vos valeurs de marque",
                "Indice de culture par succursale, visible du siège social",
              ]}
              visual={<CultureMicroUI />}
            />

            <FeatureRow
              reversed
              eyebrow="📋 Onboarding dynamique J1–J5"
              eyebrowClass="text-zinc-300"
              title="Une recrue productive en 5 jours, pas en 5 semaines."
              copy="Le parcours J1–J5 débloque les modules selon l’ancienneté réelle de l’employé — pas selon un PDF oublié dans un cartable. Chaque bannière configure son propre parcours via le Brand Kit : couleurs, logo, mots de bienvenue, modules de salubrité. Moins de friction, moins de roulement, plus vite sur le plancher."
              points={[
                "Déblocage progressif indexé sur l’ancienneté d’embauche",
                "Entièrement personnalisable par organisation (Brand Kit)",
                "Certifications de salubrité tracées — bloquantes pour l’équipement à risque",
              ]}
              visual={<OnboardingMicroUI />}
            />
          </div>
        </div>
      </section>

      {/* ── COMPARAISON ── */}
      <section id="comparaison" className="relative px-6 py-24">
        <SectionHalo tone="cyan" />
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>Mirok vs les apps héritées</Eyebrow>
            <GradientTitle>
              Un OS de franchise contre des calendriers glorifiés.
            </GradientTitle>
            <p className="mt-5 text-lg text-zinc-400">
              Pivot, 7shifts et les apps de chat génériques planifient des cases.
              Mirok opère un restaurant.
            </p>
          </div>

          <div className="card-lift mt-14 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/40 backdrop-blur">
            <div className="grid grid-cols-[1fr_1.4fr_1.4fr] border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 text-sm font-bold">
              <span className="text-zinc-500" />
              <span className="text-white">Mirok</span>
              <span className="text-zinc-500">Apps héritées (2014)</span>
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
                  {row.mirok}
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

      {/* ── CTA FINAL ── */}
      <section id="pilote" className="relative px-6 py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 55% 60% at 50% 60%, rgb(255 255 255 / 0.1), transparent 65%), radial-gradient(ellipse 40% 45% at 70% 40%, rgb(34 211 238 / 0.08), transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>
            <Flame className="h-3.5 w-3.5" /> Cohorte pilote — places limitées
          </Eyebrow>
          <h2 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Le déploiement d’octobre 2026 se remplit.
            </span>
            <br />
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Verrouillez votre place pilote.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            Chaque cohorte pilote est limitée pour garantir un accompagnement
            d’implantation complet, succursale par succursale. Quand c’est plein,
            c’est la prochaine vague — en 2027.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:pilote@mirok.com"
              className="card-lift inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-semibold text-zinc-900 shadow-sm hover:bg-zinc-200"
            >
              Réserver une démo pilote <ArrowRight className="h-5 w-5" />
            </a>
          </div>
          <p className="mt-6 text-sm text-zinc-500">
            30 minutes. Vos chiffres, votre plancher, votre bannière. Aucun
            engagement.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
          <p>
            <span className="font-bold text-zinc-300">Mirok</span> — Le Franchise OS
            de la restauration rapide.
          </p>
          <p>© {new Date().getFullYear()} Mirok · Montréal, QC · Données hébergées au Canada</p>
        </div>
      </footer>
    </main>
  );
}
