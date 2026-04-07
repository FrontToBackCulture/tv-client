// Parse bot message bodies for entity reference tags like `[[task:uuid|LABEL]]`
// and return a segment list suitable for rendering (text | entity alternating).

export type EntityType = "task" | "project" | "deal" | "contact" | "company";

export interface EntityRef {
  type: EntityType;
  id: string;
  /** Optional inline label from the tag (e.g. "BLOCKING") */
  label: string | null;
}

export interface TextSegment {
  kind: "text";
  text: string;
}

export interface EntitySegment {
  kind: "entity";
  ref: EntityRef;
}

export type MessageSegment = TextSegment | EntitySegment;

// Matches [[task:uuid|LABEL]] or [[task:uuid]]
const ENTITY_RE = /\[\[(task|project|deal|contact|company):([a-f0-9-]+)(?:\|([^\]]+))?\]\]/gi;

/**
 * Split a message body into text + entity segments.
 * Entity tags look like: [[task:uuid|BLOCKING]] or [[project:uuid]]
 */
export function parseEntityRefs(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  ENTITY_RE.lastIndex = 0;

  while ((match = ENTITY_RE.exec(body)) !== null) {
    const [full, type, id, label] = match;
    const start = match.index;

    if (start > lastIndex) {
      segments.push({ kind: "text", text: body.slice(lastIndex, start) });
    }

    segments.push({
      kind: "entity",
      ref: {
        type: type.toLowerCase() as EntityType,
        id,
        label: label ?? null,
      },
    });

    lastIndex = start + full.length;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: "text", text: body.slice(lastIndex) });
  }

  return segments;
}

/**
 * Extract just the entity references from a body (no text segments).
 * Useful for batch-fetching entity data before rendering.
 */
export function extractEntityRefs(body: string): EntityRef[] {
  const refs: EntityRef[] = [];
  ENTITY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTITY_RE.exec(body)) !== null) {
    refs.push({
      type: match[1].toLowerCase() as EntityType,
      id: match[2],
      label: match[3] ?? null,
    });
  }
  return refs;
}
