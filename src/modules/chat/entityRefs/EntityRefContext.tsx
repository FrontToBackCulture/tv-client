// Context for passing resolved entity data + action-sheet open handler
// down through ReactMarkdown's rendering tree.

import { createContext, useContext, type ReactNode } from "react";
import type { EntityRef } from "./parseEntityRefs";
import type { ResolvedEntities } from "./useEntityRefs";

interface EntityRefContextValue {
  entities: ResolvedEntities | undefined;
  onOpen: (ref: EntityRef) => void;
}

const EntityRefContext = createContext<EntityRefContextValue | null>(null);

export function EntityRefProvider({
  entities,
  onOpen,
  children,
}: {
  entities: ResolvedEntities | undefined;
  onOpen: (ref: EntityRef) => void;
  children: ReactNode;
}) {
  return (
    <EntityRefContext.Provider value={{ entities, onOpen }}>
      {children}
    </EntityRefContext.Provider>
  );
}

export function useEntityRefContext(): EntityRefContextValue | null {
  return useContext(EntityRefContext);
}
