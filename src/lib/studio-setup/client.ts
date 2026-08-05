"use client";

const DISMISS_KEY = "ritmokit-studio-setup-dismissed";
const ACCUEIL_TRIED_KEY = "ritmokit-studio-setup-accueil-tried";

export function isStudioSetupBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

export function dismissStudioSetupBanner(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, "1");
}

export function resetStudioSetupBannerDismiss(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DISMISS_KEY);
}

export function isAccueilStepMarked(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ACCUEIL_TRIED_KEY) === "1";
}

export function markAccueilStepTried(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCUEIL_TRIED_KEY, "1");
}
