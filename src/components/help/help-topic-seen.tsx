"use client";

import { useEffect } from "react";
import { markHelpTopicOpened } from "@/lib/help/recent";
import type { HelpTopicKey } from "@/lib/help/config";

/**
 * Enregistre la fiche dans l'historique local dès son affichage — c'est ce qui
 * alimente « Vu » et « Consultés récemment » sur le centre d'aide.
 */
export function HelpTopicSeen({ topicKey }: { topicKey: HelpTopicKey }) {
  useEffect(() => {
    markHelpTopicOpened(topicKey);
  }, [topicKey]);

  return null;
}
