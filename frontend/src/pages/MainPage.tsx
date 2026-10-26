"use client";

import type { Extension } from "@codemirror/state";
import { IconAlertTriangle, IconBug, IconCheck, IconLoader2 } from "@tabler/icons-react";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultCode } from "../data/defaultCode";
import { stellaTests } from "../data/stellaTests";
import { createErrorLineExtension } from "../editor/errorLineExtension";
import { createHoverTypesExtension } from "../editor/hoverTypesExtension";
import { stellaLanguage } from "../editor/stellaLanguage";
import { stellaEditorTheme, stellaSyntaxHighlighting } from "../editor/theme";
import { cn } from "../lib/cn";
import type { AnalyzeResponse } from "../workers/types";
import { AnimatePresence, motion } from "framer-motion";

let workerRef: Worker | null = null;

function getTypecheckWorker(): Worker {
  if (workerRef) {
    return workerRef;
  }
  workerRef = new Worker(new URL("../workers/typecheck.worker.ts", import.meta.url), {
    type: "module",
  });
  return workerRef;
}

export function MainPage() {
  const [code, setCode] = useState(defaultCode);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTestPickerOpen, setIsTestPickerOpen] = useState(false);

  const activeRequestIdRef = useRef<string | null>(null);
  const testPickerRef = useRef<HTMLDivElement | null>(null);

  const worker = useMemo(() => getTypecheckWorker(), []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<AnalyzeResponse>) => {
      const payload = event.data;
      if (payload.requestId !== activeRequestIdRef.current) {
        return;
      }
      setAnalysis(payload);
      setIsAnalyzing(false);
    };

    worker.addEventListener("message", handleMessage);
    return () => {
      worker.removeEventListener("message", handleMessage);
    };
  }, [worker]);

  useEffect(() => {
    const requestId = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAnalyzing(true);
    activeRequestIdRef.current = requestId;

    const timeoutId = window.setTimeout(() => {
      worker.postMessage({
        code,
        requestId,
      });
    }, 240);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [code, worker]);

  useEffect(() => {
    if (!isTestPickerOpen) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (testPickerRef.current?.contains(target)) {
        return;
      }
      setIsTestPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTestPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isTestPickerOpen]);

  const status = analysis?.status ?? "idle";
  const hoverItems = useMemo(() => analysis?.hoverItems ?? [], [analysis]);
  const error = analysis?.error;

  const hasErrorDetails = (status === "ill-typed" || status === "parse-error") && Boolean(error);
  const errorLine = hasErrorDetails ? (error?.line ?? null) : null;

  // FIXME: I suspect the race cond on extensions, which sometimes causes the ui to go blank on rapid editing (especially removing parts of the code).
  // Probably something with hover types offset cuts desyncing with the code source (view.state.doc).
  const extensions: Extension[] = useMemo(
    () => [
      stellaLanguage,
      stellaEditorTheme,
      stellaSyntaxHighlighting,
      createErrorLineExtension(errorLine),
      createHoverTypesExtension(hoverItems),
    ],
    [errorLine, hoverItems]
  );

  const handleSelectTest = (testId: string) => {
    const selected = stellaTests.find((test) => test.id === testId);
    if (!selected) {
      return;
    }
    setCode(selected.source);
    setIsTestPickerOpen(false);
  };

  return (
    <main className="h-dvh bg-background flex flex-col gap-4 pt-4 p-6 text-black">
      <div className="flex justify-between items-end w-full">
        <h1 className="font-montagu text-6xl uppercase font-bold relative">
          Stella
        </h1>
        <div className="relative">
          <button
            type="button"
            className={cn(
              "inline-flex items-center font-dm-mono text-sm",
              hasErrorDetails && "cursor-pointer",
              {
                "text-black": status === "idle",
                "text-japandi-green": status === "well-typed",
                "text-japandi-red": status === "ill-typed" || status === "parse-error",
                "text-black/30": isAnalyzing,
              }
            )}
          >
            {isAnalyzing ? (
              <IconLoader2 className="size-6 animate-spin" />
            ) : status === "well-typed" ? (
              <IconCheck className="size-6" />
            ) : status === "idle" ? (
              <div className="size-6" />
            ) : (
              <IconAlertTriangle className="size-6" />
            )}
          </button>
        </div>
      </div>

      <div className="border border-black flex-1 min-h-0 flex flex-col relative">
        <CodeMirror
          value={code}
          onChange={(value) => setCode(value)}
          basicSetup={{
            foldGutter: false,
            highlightActiveLine: true,
            lineNumbers: true,
            bracketMatching: true,
            autocompletion: false,
          }}
          extensions={extensions}
          className="flex-1 min-h-0"
        />
        <AnimatePresence>
          {hasErrorDetails && error && (
            <motion.div
              className="absolute top-0 right-0 max-w-96 border border-t-0 border-r-0 border-black bg-card p-3 font-dm-mono text-xs text-black z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              key="wrapper"
            >
              {error.code && (
                <motion.div
                  className="mb-1 font-semibold uppercase tracking-[0.08em]"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.15, delay: 0.1 }}
                  key="code"
                >
                  {error.code}
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                transition={{ duration: 0.15, delay: 0.15 }}
                key="description"
              >
                {error.description}
              </motion.div>
              {(error.line || error.col) && (
                <motion.div
                  className="mt-2 border-t border-black/25 pt-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15, delay: 0.2 }}
                  key="location"
                >
                  line {error.line ?? "?"}, col {error.col ?? "?"}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={testPickerRef} className="absolute right-3 bottom-3 z-30">
          <button
            type="button"
            onClick={() => setIsTestPickerOpen((open) => !open)}
            className="border border-black bg-card text-black px-3 py-1.5 text-xs font-dm-mono hover:bg-card-hover cursor-pointer"
          >
            Tests
          </button>
          <AnimatePresence>
            {isTestPickerOpen && (
              <motion.div
                className="absolute right-0 bottom-11 max-w-[calc(100vw-5rem)] border border-black bg-card"
                initial={{ opacity: 0, y: 8, x: 8 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, y: 8, x: 8 }}
                transition={{ duration: 0.15 }}
                key="test-picker"
              >
                <div className="max-h-72 overflow-auto p-1">
                  {stellaTests.map((test) => {
                    return (
                      <button
                        type="button"
                        key={test.id}
                        onClick={() => handleSelectTest(test.id)}
                        className="w-full text-left px-2 py-1.5 font-dm-mono text-xs hover:bg-black/10 flex items-center gap-2 cursor-pointer"
                      >
                        {test.expectation === "success" ? (
                          <IconCheck className="size-4 shrink-0 text-japandi-green" />
                        ) : test.expectation === "error" ? (
                          <IconBug className="size-4 shrink-0 text-japandi-red" />
                        ) : (
                          <span className="size-4 shrink-0 inline-block" />
                        )}
                        <span className="truncate">{test.name}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
