import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, hoverTooltip } from "@codemirror/view";
import type { HoverItem } from "../workers/types";

function pickBestHover(
  items: HoverItem[],
  position: number,
  side: -1 | 1,
  docLength: number
): HoverItem | null {
  const matching = items.filter((item) => {
    const start = Math.max(0, Math.min(item.startOffset, docLength));
    const end = Math.max(start, Math.min(item.endOffset, docLength));
    if (end <= start) {
      return false;
    }
    return (
      position >= start &&
      position <= end &&
      !(position === start && side < 0) &&
      !(position === end && side > 0)
    );
  });
  if (matching.length === 0) {
    return null;
  }

  return matching.reduce((currentBest, item) => {
    const currentLength = currentBest.endOffset - currentBest.startOffset;
    const nextLength = item.endOffset - item.startOffset;
    return nextLength < currentLength ? item : currentBest;
  });
}

export function createHoverTypesExtension(items: HoverItem[]): Extension {
  const hover = hoverTooltip(
    (view, position, side) => {
      const docLength = view.state.doc.length;
      const safePosition = Math.max(0, Math.min(position, docLength));
      const item = pickBestHover(items, safePosition, side, docLength);
      if (!item) {
        return null;
      }
      return {
        pos: safePosition,
        end: safePosition,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "stella-hover-tooltip";
          const typeRow = document.createElement("div");
          typeRow.textContent = item.renderedType;
          dom.append(typeRow);
          if (item.typingMethod !== undefined) {
            const methodRow = document.createElement("div");
            methodRow.className = "stella-hover-tooltip-method";
            switch (item.typingMethod) {
              case "bottom-up":
                methodRow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-fold-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 13v-8l-3 3m6 0l-3 -3" /><path d="M9 17l1 0" /><path d="M14 17l1 0" /><path d="M19 17l1 0" /><path d="M4 17l1 0" /></svg> <span>synthesis</span>`;
                break;
              case "top-down":
                methodRow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-fold-down"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 11v8l3 -3m-6 0l3 3" /><path d="M9 7l1 0" /><path d="M14 7l1 0" /><path d="M19 7l1 0" /><path d="M4 7l1 0" /></svg> <span>propagation</span>`;
                break;
              case "bidirectional":
                methodRow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-fold"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3v6l3 -3m-6 0l3 3" /><path d="M12 21v-6l3 3m-6 0l3 -3" /><path d="M4 12l1 0" /><path d="M9 12l1 0" /><path d="M14 12l1 0" /><path d="M19 12l1 0" /></svg> <span>bidirectional</span>`;
                break;
              default:
                methodRow.textContent = item.typingMethod;
            }
            dom.append(methodRow);
          }
          return {
            dom,
          };
        },
      };
    },
    { hideOnChange: true }
  );

  const hoverHighlight = EditorView.decorations.compute([hover.active], (state) => {
    const activeTooltips = state.field(hover.active);
    const docLength = state.doc.length;
    const ranges = activeTooltips.flatMap((tooltip) => {
      const tooltipPos = Math.max(0, Math.min(tooltip.pos, docLength));
      const item = pickBestHover(items, tooltipPos, 1, docLength);
      if (!item) {
        return [];
      }
      const start = Math.max(0, item.startOffset);
      const end = Math.min(docLength, item.endOffset);
      if (end <= start || start > docLength) {
        return [];
      }
      return [
        Decoration.mark({
          class: "stella-hover-target",
        }).range(start, end),
      ];
    });
    return Decoration.set(ranges, true);
  });

  return [hover, hoverHighlight];
}
