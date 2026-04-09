import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AGENT_HEARTBEAT_STALE_MS,
  getHeartbeatStaleThresholdMs,
  listAgents,
} from "../../lib/agent-state.js";
import { getPmDir } from "../../lib/codes.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";

const HEARTBEAT_REFRESH_MS = Math.max(5_000, AGENT_HEARTBEAT_STALE_MS / 4);

export interface UseAgentListResult {
  agents: ObservedAgentState[];
  hasAgents: boolean;
  reload: () => void;
}

/**
 * Hook that loads agent state files from .pm/agents/.
 * Returns an empty array if the directory doesn't exist or has no valid agents.
 */
export function useAgentList(): UseAgentListResult {
  const [agents, setAgents] = useState<ObservedAgentState[]>([]);

  const pmDir = useMemo(() => {
    try {
      return getPmDir();
    } catch {
      return null;
    }
  }, []);

  const loadAgents = useCallback(() => {
    if (!pmDir) {
      setAgents([]);
      return;
    }
    try {
      const staleAfterMs = getHeartbeatStaleThresholdMs(pmDir);
      const result = listAgents(pmDir, staleAfterMs);
      setAgents(result);
    } catch {
      setAgents([]);
    }
  }, [pmDir]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!pmDir) {
      return;
    }

    const interval = setInterval(() => {
      loadAgents();
    }, HEARTBEAT_REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadAgents, pmDir]);

  const hasAgents = agents.length > 0;

  return { agents, hasAgents, reload: loadAgents };
}
