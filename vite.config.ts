/**
 * Proa · TugLife Systems — Configuração do Vite
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.3.0
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * MODIFICAÇÕES DESTA VERSÃO (1.3.0)
 *  1. Removido `pgliteBootstrapPlugin`. Subia um PGLite no arranque do dev
 *     server quando havia arquivo em `migrations/` — e não há mais banco,
 *     nem migrations, nem `src/lib/db.ts`.
 *  2. Removido `authPopupPlugin` (~80 linhas). Servia `/auth/popup` para o
 *     fluxo OAuth do preview, que saiu junto com `src/lib/auth/`.
 * ---------------------------------------------------------------------------
 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            // Netlify CI sets NETLIFY=true; Grok/Vercel keep the vercel preset.
            preset: process.env.NETLIFY ? "netlify" : "vercel",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
