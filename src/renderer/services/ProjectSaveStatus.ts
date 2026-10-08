export interface ProjectSaveSnapshot {
  savedAt: string;
  filePath?: string;
}

type Listener = (snapshot: ProjectSaveSnapshot | null) => void;

let currentSnapshot: ProjectSaveSnapshot | null = null;
const listeners = new Set<Listener>();

export function getProjectSaveSnapshot(): ProjectSaveSnapshot | null {
  return currentSnapshot;
}

export function setProjectSaveSnapshot(snapshot: ProjectSaveSnapshot): void {
  currentSnapshot = snapshot;
  listeners.forEach(listener => listener(currentSnapshot));
}

export function subscribeProjectSaveStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
