import { useState, useEffect, useCallback, useMemo } from "react";
import { listAgents } from "../../lib/agent-state.js";
import { getPmDir } from "../../lib/codes.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";

export interface UseAgentListResult {
  agents: AgentState[];
  hasAgents: boolean;
  reload: () => void;
}

/**
 * Hook that loads agent state files from .pm/agents/.
 * Returns an empty array if the directory doesn't exist or has no valid agents.
 */
export function useAgentList(): UseAgentListResult {
  const [agents, setAgents] = useState<AgentState[]>([]);

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
      const result = listAgents(pmDir);
      setAgents(result);
    } catch {
      setAgents([]);
    }
  }, [pmDir]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const hasAgents = agents.length > 0;

  return { agents, hasAgents, reload: loadAgents };
}
