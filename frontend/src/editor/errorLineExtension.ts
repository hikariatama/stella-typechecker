import type { Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export function createErrorLineExtension(errorLine: number | null): Extension {
  if (errorLine === null || !Number.isInteger(errorLine) || errorLine < 1) {
    return [];
  }

  return EditorView.decorations.compute([], (state) => {
    if (errorLine > state.doc.lines) {
      return Decoration.none;
    }
    const lineFrom = state.doc.line(errorLine).from;
    return Decoration.set([
      Decoration.line({
        class: "stella-error-line",
      }).range(lineFrom),
    ]);
  });
}
