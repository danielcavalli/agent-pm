import { useState, useEffect, useCallback } from "react";
import { loadTree, NoPmDirectoryError } from "../loadTree.js";
import type { EpicNode } from "../types.js";

export interface UseProjectTreeResult {
  epics: EpicNode[];
  projectName: string;
  storyLinkTemplate?: string;
  error: string | null;
  setEpics: React.Dispatch<React.SetStateAction<EpicNode[]>>;
  reload: () => {
    epics: EpicNode[];
    projectName: string;
    storyLinkTemplate?: string;
  } | null;
}

export function useProjectTree(): UseProjectTreeResult {
  const [epics, setEpics] = useState<EpicNode[]>([]);
  const [projectName, setProjectName] = useState("");
  const [storyLinkTemplate, setStoryLinkTemplate] = useState<
    string | undefined
  >();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const data = loadTree();
      setEpics(data.epics);
      setProjectName(data.projectName);
      setStoryLinkTemplate(data.storyLinkTemplate);
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
    storyLinkTemplate?: string;
  } | null => {
    try {
      const data = loadTree();
      setEpics(data.epics);
      setProjectName(data.projectName);
      setStoryLinkTemplate(data.storyLinkTemplate);
      setError(null);
      return {
        epics: data.epics,
        projectName: data.projectName,
        storyLinkTemplate: data.storyLinkTemplate,
      };
    } catch (e) {
      if (e instanceof NoPmDirectoryError) {
        setError(e.message);
      } else {
        setError("Failed to load project data");
      }
      return null;
    }
  }, []);

  return { epics, projectName, storyLinkTemplate, error, setEpics, reload };
}
