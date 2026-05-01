"use client";

import { loader } from "@monaco-editor/react";

/** Same-origin path after `node scripts/copy-monaco.cjs` (or postinstall). */
export const MONACO_VS_PUBLIC_PATH = "/monaco/vs";

let configured = false;
let initPromise: Promise<void> | null = null;

export function configureMonacoLoader(): void {
  if (typeof window === "undefined" || configured) return;
  configured = true;
  loader.config({ paths: { vs: MONACO_VS_PUBLIC_PATH } });
}

/**
 * Must run in the browser before mounting any Monaco editor.
 * Uses local `/public/monaco/vs` workers (avoids CDN worker / CORS issues).
 */
export function ensureMonacoInitialized(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  configureMonacoLoader();
  if (!initPromise) {
    initPromise = loader
      .init()
      .then(() => undefined)
      .catch((e) => {
        initPromise = null;
        configured = false;
        throw e;
      });
  }
  return initPromise;
}

export function resetMonacoLoaderForRetry(): void {
  initPromise = null;
  configured = false;
}
