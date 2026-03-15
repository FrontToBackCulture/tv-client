// Feed module query keys

export const feedKeys = {
  all: ["feed"] as const,
  cards: () => [...feedKeys.all, "cards"] as const,
  cardsByFilter: (filter: string) => [...feedKeys.cards(), filter] as const,
  card: (id: string) => [...feedKeys.cards(), id] as const,
  series: (seriesId: string) => [...feedKeys.all, "series", seriesId] as const,
  interactions: () => [...feedKeys.all, "interactions"] as const,
  saved: (userId: string) => [...feedKeys.all, "saved", userId] as const,
  trending: () => [...feedKeys.all, "trending"] as const,
};
