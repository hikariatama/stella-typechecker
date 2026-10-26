import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const stellaHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#8E4D3A" },
  { tag: [tags.number, tags.bool], color: "#A07E65" },
  { tag: tags.atom, color: "#6D5242" },
  { tag: tags.operator, color: "#36312A" },
  { tag: tags.typeName, color: "#284E64" },
  { tag: tags.variableName, color: "#461F1F" },
  { tag: tags.comment, color: "#8F8577", fontStyle: "italic" },
]);

export const stellaEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100% !important",
      backgroundColor: "transparent !important",
      color: "#1a1611",
      fontSize: "16px",
      fontFamily: '"DM Mono", monospace',
    },
    ".cm-scroller": {
      padding: "0",
      lineHeight: "1.3",
    },
    ".cm-content": {
      caretColor: "#17120b",
      marginTop: "8px",
    },
    ".cm-line": {
      paddingLeft: "8px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#17120b",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(0,0,0,0.045)",
    },
    ".cm-selectionBackground": {
      background: "rgba(0,0,0,0.16) !important",
    },
    ".cm-gutters": {
      border: "none",
      backgroundColor: "transparent",
      color: "#0000008d",
      paddingTop: "8px",
      borderRight: "1px solid #000",
    },
    ".cm-gutterElement": {
      padding: "0 8px 0 16px !important",
    },
    ".cm-activeLineGutter": {
      background: "rgba(0,0,0,0.045)",
      color: "#000",
    },
    ".cm-tooltip-above": {
      border: "none",
      backgroundColor: "transparent",
    },
    ".stella-hover-tooltip": {
      backgroundColor: "#e9e2d5",
      border: "1px solid #000",
      color: "#14110d",
      padding: "6px 10px",
      fontFamily: '"DM Mono", monospace',
      fontSize: "12px",
      lineHeight: "1.35",
      opacity: 0,
      animation: "fade-in 0.15s ease-out forwards",
    },
    ".stella-hover-tooltip-method": {
      marginTop: "2px",
      fontSize: "11px",
      color: "#4a433a",
      letterSpacing: "0.06em",
      display: "flex",
      alignItems: "center",
      gap: "4px",
    },
    ".stella-hover-target": {
      backgroundColor: "rgba(0,0,0,0.08)",
      borderRadius: "3px",
    },
    ".cm-line.stella-error-line": {
      backgroundColor: "rgba(185, 28, 28, 0.22)",
    },
    ".cm-activeLine.stella-error-line": {
      backgroundColor: "rgba(185, 28, 28, 0.3)",
    },
  },
  { dark: false }
);

export const stellaSyntaxHighlighting = syntaxHighlighting(stellaHighlight);
