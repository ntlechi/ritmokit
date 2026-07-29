"use client";

import { useState } from "react";
import {
  clampDemoDay,
  getDemoJourneyState,
  type DemoJourneyScreen,
} from "@/lib/demo/franchise-pitch";
import { cn } from "@/lib/utils";

export function FranchiseJourneyDemo({ initialDay = 1 }: { initialDay?: number }) {
  const [day, setDay] = useState(clampDemoDay(initialDay));
  const [screen, setScreen] = useState<DemoJourneyScreen>(0);
  const state = getDemoJourneyState(day, screen);
  const brand = state.brand;

  function go(next: DemoJourneyScreen) {
    setScreen(next);
  }

  return (
    <div
      className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950 p-3 shadow-[var(--shadow-lg)]"
      style={{ "--brand": brand.primaryColor } as React.CSSProperties}
    >
      <div className="overflow-hidden rounded-[22px] bg-[#f8f8f8] dark:bg-zinc-900">
        <div className="flex items-center justify-between bg-zinc-950 px-4 py-2 text-[11px] font-semibold text-white">
          <span>9:41</span>
          <span className="h-5 w-20 rounded-b-xl bg-zinc-950" />
          <span>●●●</span>
        </div>

        <div className="flex justify-center gap-1.5 py-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i as DemoJourneyScreen)}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition",
                screen === i ? "w-3" : "bg-zinc-300",
              )}
              style={screen === i ? { background: brand.primaryColor } : undefined}
              aria-label={`Écran ${i}`}
            />
          ))}
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDay(d);
                if (d === 1) go(0);
                else if (d === 2) go(4);
                else if (d >= 5) go(6);
                else go(5);
              }}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase",
                day === d ? "bg-zinc-950 text-white" : "bg-white text-zinc-400 border border-zinc-200",
              )}
            >
              J{d}
            </button>
          ))}
        </div>

        {screen === 0 && (
          <div className="flex min-h-[480px] flex-col items-center justify-center px-5 py-8 text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-black text-white"
              style={{ background: brand.primaryColor }}
            >
              {brand.logoMark}
            </div>
            <p className="text-[11px] uppercase tracking-widest text-zinc-400">Bienvenue chez</p>
            <p className="mt-1 text-3xl font-black uppercase" style={{ color: brand.primaryColor }}>
              {brand.name}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">{brand.welcomeCopy}</p>
            <button
              type="button"
              onClick={() => go(1)}
              className="mt-6 w-full rounded-xl py-3.5 text-sm font-black uppercase tracking-wide text-white"
              style={{ background: brand.primaryColor }}
            >
              Commencer mon onboarding
            </button>
          </div>
        )}

        {screen === 1 && (
          <JourneyPanel
            brandColor={brand.primaryColor}
            tag="Jour 1 · Étape 1"
            title="Ton profil"
            sub="1 minute pour tout préparer"
            progress={15}
          >
            <p className="mb-3 text-sm text-zinc-700">
              On a besoin de quelques infos pour configurer ton compte. C&apos;est rapide.
            </p>
            {state.profileItems.map((item) => (
              <ActionRow key={item.id} label={item.label} desc={item.desc} done={item.done} brand={brand.primaryColor} />
            ))}
            <PrimaryButton color={brand.primaryColor} onClick={() => go(2)}>
              Continuer
            </PrimaryButton>
          </JourneyPanel>
        )}

        {screen === 2 && (
          <JourneyPanel
            brandColor={brand.primaryColor}
            tag="Jour 1 · Étape 2"
            title="Signe ta convention"
            sub="Les règles du jeu, claires pour tout le monde"
            progress={40}
          >
            <p className="mb-3 text-sm text-zinc-700">
              Ta convention de travail est prête. Tu peux ajouter un commentaire avant de signer.
            </p>
            <ActionRow label="Convention de travail" desc="Lue et comprise" done brand={brand.primaryColor} />
            <ActionRow label="Signer maintenant" desc="Signature numérique sécurisée" done={false} brand={brand.primaryColor} />
            <p className="mt-2 text-[11px] text-zinc-400">Tu peux ajouter un commentaire — c&apos;est ton droit.</p>
            <PrimaryButton color={brand.primaryColor} onClick={() => go(3)}>
              Signer et continuer
            </PrimaryButton>
          </JourneyPanel>
        )}

        {screen === 3 && (
          <JourneyPanel
            brandColor={brand.primaryColor}
            tag="Jour 1 · Étape 3"
            title="Module 1"
            sub="Les valeurs du studio · 10 minutes"
            progress={65}
          >
            <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Ce que tu vas apprendre
              </p>
              {DEMO_SECTIONS.map((s, i) => (
                <div key={s.title} className="flex items-center gap-2 border-b border-zinc-100 py-2 last:border-0">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black",
                      i === 0 && "text-white",
                      i === 1 && "bg-zinc-950 text-white",
                      i === 2 && "bg-zinc-100 text-zinc-400",
                    )}
                    style={i === 0 ? { background: brand.primaryColor } : undefined}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{s.title}</p>
                    <p className="text-[10px] text-zinc-400">
                      {i === 2 ? "Se déverrouille après la section 2" : `${s.minutes} min`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <PrimaryButton color={brand.primaryColor} onClick={() => go(4)}>
              Continuer le module
            </PrimaryButton>
          </JourneyPanel>
        )}

        {screen === 4 && (
          <JourneyPanel
            brandColor={brand.primaryColor}
            tag="Jour 2 · Ton quart"
            title="Pointer"
            sub="Prêt au poste, en uniforme"
            progress={70}
          >
            <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-5 text-center">
              <p className="text-4xl font-black text-zinc-950">{state.punchTime}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-400">Début de quart</p>
              <p className="mt-3 text-sm text-zinc-500">
                Tu es attendu à <strong className="text-zinc-900">{state.punchStation}</strong>
              </p>
              <button
                type="button"
                className="mt-4 w-full rounded-xl py-3.5 text-sm font-black uppercase tracking-wide text-white"
                style={{ background: brand.primaryColor }}
              >
                Pointer — NIP
              </button>
            </div>
            <div className="flex gap-2 rounded-xl border border-zinc-200 bg-white p-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                style={{ background: brand.primaryColor }}
              >
                !
              </span>
              <div>
                <p className="text-xs font-bold text-zinc-900">Module 2 déverrouillé</p>
                <p className="text-[11px] text-zinc-500">
                  RitmoKit — disponible ce soir sur ton téléphone.
                </p>
              </div>
            </div>
            <PrimaryButton color={brand.primaryColor} onClick={() => go(5)}>
              Voir ma progression
            </PrimaryButton>
          </JourneyPanel>
        )}

        {screen === 5 && (
          <JourneyPanel
            brandColor={brand.primaryColor}
            tag="Semaine 1 · Suivi"
            title="Ta progression"
            sub="5 modules pour maîtriser le plancher"
            progress={Math.min(100, day * 20)}
          >
            <div className="mb-3 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((d) => (
                <span
                  key={d}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10px] font-black uppercase",
                    d < day && "border border-[var(--brand)] text-[var(--brand)]",
                    d === day && "bg-zinc-950 text-white",
                    d > day && "border border-zinc-200 text-zinc-400",
                  )}
                >
                  J{d}
                </span>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              {state.modules.map((m) => (
                <div key={m.id} className="flex items-center gap-2 border-b border-zinc-100 py-2.5 last:border-0">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black",
                      m.status === "active" && "bg-zinc-950 text-white",
                      m.status === "locked" && "bg-zinc-100 text-zinc-400",
                      m.status === "done" && "text-white",
                    )}
                    style={m.status === "done" ? { background: brand.primaryColor } : undefined}
                  >
                    {m.unlockDay}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{m.title}</p>
                    <p
                      className="text-[10px]"
                      style={{
                        color:
                          m.status === "done"
                            ? brand.primaryColor
                            : m.status === "active"
                              ? "#111"
                              : "#ccc",
                      }}
                    >
                      {m.status === "done"
                        ? "Complété"
                        : m.status === "active"
                          ? `En cours · ${m.estimatedMinutes} min`
                          : `Disponible J${m.unlockDay}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <PrimaryButton color={brand.primaryColor} onClick={() => go(6)}>
              Fin de semaine
            </PrimaryButton>
          </JourneyPanel>
        )}

        {screen === 6 && (
          <JourneyPanel
            brandColor="#0E0E0E"
            tag="Fin de semaine 1"
            title="Formation de base complétée"
            sub="Tu fais maintenant partie de l'équipe"
            progress={100}
            darkHeader
          >
            <div className="rounded-xl bg-zinc-950 p-4 text-center text-white">
              <p className="text-3xl">🏆</p>
              <p className="mt-2 text-sm font-black uppercase tracking-wide">Formation complétée</p>
              <p className="mt-1 text-[11px] text-zinc-400">{brand.rewardMessage}</p>
            </div>
            <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-bold text-zinc-900">Message de ton gérant</p>
              <p className="mt-1 text-[11px] text-zinc-500">&quot;{brand.managerMessageWeek1}&quot;</p>
            </div>
            <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-bold text-zinc-900">Prochain objectif déverrouillé</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Certification station — disponible semaine 2.
              </p>
            </div>
            <PrimaryButton color={brand.primaryColor} onClick={() => go(0)}>
              Rejouer le parcours
            </PrimaryButton>
          </JourneyPanel>
        )}

        <div className="flex justify-center gap-2 border-t border-zinc-200 bg-[#f8f8f8] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            disabled={screen === 0}
            onClick={() => go(Math.max(0, screen - 1) as DemoJourneyScreen)}
            className="rounded-lg bg-zinc-950 px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-30"
          >
            Préc.
          </button>
          <button
            type="button"
            disabled={screen === 6}
            onClick={() => go(Math.min(6, screen + 1) as DemoJourneyScreen)}
            className="rounded-lg px-4 py-2 text-[11px] font-black uppercase text-white disabled:opacity-30"
            style={{ background: brand.primaryColor }}
          >
            Suiv.
          </button>
        </div>
      </div>
    </div>
  );
}

const DEMO_SECTIONS = [
  { title: "Pourquoi ce studio existe", minutes: 3 },
  { title: "Les 5 valeurs de l'équipe", minutes: 4 },
  { title: "Quiz de validation", minutes: 3 },
];

function JourneyPanel({
  brandColor,
  tag,
  title,
  sub,
  progress,
  children,
  darkHeader,
}: {
  brandColor: string;
  tag: string;
  title: string;
  sub: string;
  progress: number;
  children: React.ReactNode;
  darkHeader?: boolean;
}) {
  return (
    <div className="min-h-[480px]">
      <div className="px-5 pb-4 pt-6 text-white" style={{ background: darkHeader ? "#0E0E0E" : brandColor }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">{tag}</p>
        <h2 className="mt-1 text-xl font-black uppercase leading-tight">{title}</h2>
        <p className="mt-1 text-xs opacity-85">{sub}</p>
      </div>
      <div className="px-4 py-4">
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: brandColor }} />
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionRow({
  label,
  desc,
  done,
  brand,
}: {
  label: string;
  desc: string;
  done: boolean;
  brand: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black text-white"
        style={{ background: done ? brand : "#222" }}
      >
        {done ? "✓" : "·"}
      </span>
      <div className="flex-1">
        <p className="text-xs font-bold text-zinc-900">{label}</p>
        <p className="text-[10px] text-zinc-400">{desc}</p>
      </div>
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px]",
          done ? "border-transparent text-white" : "border-zinc-300",
        )}
        style={done ? { background: brand } : undefined}
      >
        {done ? "✓" : ""}
      </span>
    </div>
  );
}

function PrimaryButton({
  color,
  onClick,
  children,
}: {
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 w-full rounded-xl py-3 text-sm font-black uppercase tracking-wide text-white"
      style={{ background: color }}
    >
      {children}
    </button>
  );
}
