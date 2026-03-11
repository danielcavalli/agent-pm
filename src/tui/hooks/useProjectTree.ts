import { useState, useEffect, useCallback } from "react";
import { loadTree, NoPmDirectoryError } from "../loadTree.js";
import type { EpicNode } from "../types.js";

export interface UseProjectTreeResult {
  epics: EpicNode[];
  projectName: string;
  error: string | null;
  setEpics: React.Dispatch<React.SetStateAction<EpicNode[]>>;
  reload: () => { epics: EpicNode[]; projectName: string } | null;
}

export function useProjectTree(): UseProjectTreeResult {
  const [epics, setEpics] = useState<EpicNode[]>([]);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const data = loadTree();
      setEpics(data.epics);
      setProjectName(data.projectName);
      setError(null);
    } catch (e) {
      if (e instanceof NoPmDirectoryError) {
        setError(e.message);
      } else {
        setError("Failed to load project data");
      }
    }
  }, []);

  const reload = useCallback((): {
    epics: EpicNode[];
    projectName: string;
  } | null => {
    try {
      const data = loadTree();
      setEpics(data.epics);
      setProjectName(data.projectName);
      setError(null);
      return { epics: data.epics, projectName: data.projectName };
    } catch (e) {
      if (e instanceof NoPmDirectoryError) {
        setError(e.message);
      } else {
        setError("Failed to load project data");
      }
      return null;
    }
  }, []);

  return { epics, projectName, error, setEpics, reload };
}
