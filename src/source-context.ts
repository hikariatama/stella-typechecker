interface SourceStartToken {
  line: number;
  column: number;
  start?: number;
  stop?: number;
}

interface SourceContextCarrier {
  start?: SourceStartToken | null;
  stop?: SourceStartToken | null;
}

export interface SourceContext {
  line: number;
  col: number;
  startOffset?: number;
  endOffset?: number;
  endLine?: number;
  endCol?: number;
}

const nodeSourceContexts = new WeakMap<object, SourceContext>();

export function withSourceContext<T extends object>(node: T, carrier: SourceContextCarrier): T {
  const start = carrier.start;
  if (start !== undefined && start !== null) {
    const stop = carrier.stop;
    const startOffset = typeof start.start === "number" ? start.start : undefined;
    const endOffset = typeof stop?.stop === "number" ? stop.stop + 1 : undefined;
    nodeSourceContexts.set(node, {
      line: start.line,
      col: start.column + 1,
      startOffset,
      endOffset,
      endLine: stop?.line,
      endCol: stop ? stop.column + 1 : undefined,
    });
  }
  return node;
}

export function getSourceContext(node: object | undefined): SourceContext | undefined {
  if (node === undefined) {
    return undefined;
  }
  return nodeSourceContexts.get(node);
}
