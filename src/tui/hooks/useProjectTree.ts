import { useState, useEffect, useCallback } from "react";
import { loadTree } from "../loadTree.js";
import type { ProjectNode } from "../types.js";

export interface UseProjectTreeResult {
  projects: ProjectNode[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectNode[]>>;
  reload: () => ProjectNode[];
}

/**
 * Hook that encapsulates tree loading and state management.
 * Calls loadTree() on mount and exposes a reload function
 * that re-reads the YAML files and returns the new projects array.
 */
export function useProjectTree(): UseProjectTreeResult {
  const [projects, setProjects] = useState<ProjectNode[]>([]);

  // Load tree on initial mount
  useEffect(() => {
    const data = loadTree();
    setProjects(data.projects);
  }, []);

  // Reload function: re-reads YAML, updates state, and returns new projects
  const reload = useCallback((): ProjectNode[] => {
    const data = loadTree();
    setProjects(data.projects);
    return data.projects;
  }, []);

  return { projects, setProjects, reload };
}
