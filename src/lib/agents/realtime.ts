"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentTaskStatus } from "./schemas";

export interface AgentActivity {
  agentLogId: string;
  eventType: string;
  status: AgentTaskStatus;
}

/**
 * Live status of any agent task related to a given shift (e.g. the
 * Crisis Agent negotiating a replacement). Powers the "Recherche d'un
 * remplacement…" indicator in the calendar without polling — Supabase
 * Realtime streams `agent_logs` row changes over the same WebSocket
 * used for auth, so this stays cheap even with many open shifts.
 */
export function useShiftAgentActivity(shiftId: string | null): AgentActivity | null {
  const [state, setState] = useState<{ shiftId: string | null; activity: AgentActivity | null }>({
    shiftId,
    activity: null,
  });

  // Reset synchronously on prop change (recommended pattern) instead of
  // clearing state from inside the effect, which would cause an extra render.
  if (state.shiftId !== shiftId) {
    setState({ shiftId, activity: null });
  }

  useEffect(() => {
    if (!shiftId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`agent-activity:${shiftId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_logs",
          filter: `related_shift_id=eq.${shiftId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            id: string;
            event_type: string;
            status: AgentTaskStatus;
          } | null;

          if (!row) return;

          setState({
            shiftId,
            activity: { agentLogId: row.id, eventType: row.event_type, status: row.status },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shiftId]);

  return state.activity;
}
