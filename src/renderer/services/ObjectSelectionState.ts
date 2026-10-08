export type SelectedObjectType = 'phrase' | 'word' | 'char' | '';

export interface ObjectSelectionSnapshot {
  objectIds: string[];
  objectType: SelectedObjectType;
}

type ObjectSelectionListener = (snapshot: ObjectSelectionSnapshot) => void;

let currentSnapshot: ObjectSelectionSnapshot = {
  objectIds: [],
  objectType: ''
};

const listeners = new Set<ObjectSelectionListener>();

function cloneSnapshot(snapshot: ObjectSelectionSnapshot): ObjectSelectionSnapshot {
  return {
    objectIds: [...snapshot.objectIds],
    objectType: snapshot.objectType
  };
}

export function getObjectSelectionSnapshot(): ObjectSelectionSnapshot {
  return cloneSnapshot(currentSnapshot);
}

export function setObjectSelectionSnapshot(snapshot: ObjectSelectionSnapshot): void {
  const unchanged = currentSnapshot.objectType === snapshot.objectType
    && currentSnapshot.objectIds.length === snapshot.objectIds.length
    && currentSnapshot.objectIds.every((id, index) => id === snapshot.objectIds[index]);
  if (unchanged) return;
  currentSnapshot = cloneSnapshot(snapshot);
  listeners.forEach(listener => listener(cloneSnapshot(currentSnapshot)));
}

export function subscribeObjectSelection(listener: ObjectSelectionListener): () => void {
  listeners.add(listener);
  listener(cloneSnapshot(currentSnapshot));
  return () => listeners.delete(listener);
}
