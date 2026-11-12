import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const directory = new URL("../apps/extension/", import.meta.url);
let config = null;
try {
  const env = Object.fromEntries(
    (await readFile(new URL("../apps/web/.env.local", import.meta.url), "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l.slice(l.indexOf("=") + 1).trim(),
      ]),
  );
  if (
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
  )
    config = {
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };
} catch {
  /* A clean checkout can configure its project in the side panel. */
}
await mkdir(new URL("dist/", directory), { recursive: true });
await build({
  entryPoints: [
    "apps/extension/src/background.ts",
    "apps/extension/src/wordle-content.ts",
    "apps/extension/src/panel.tsx",
  ],
  outdir: "apps/extension/dist",
  bundle: true,
  jsx: "automatic",
  platform: "browser",
  target: "chrome114",
  format: "iife",
  define: {
    __RISKLE_CONFIG__: JSON.stringify(config),
    "process.env.NODE_ENV": '"production"',
  },
  minify: false,
  sourcemap: false,
});
let css = await readFile(
  new URL("../apps/web/app/globals.css", import.meta.url),
  "utf8",
);
css = css.replace(/^@tailwind.*;$/gm, "");
await writeFile(
  new URL("dist/panel.css", directory),
  css +
    "\n.extension-status{padding:12px;background:#24251a;border-bottom:1px solid #f4e65c;font-size:12px}.extension-app .brand{font-size:36px}",
);
console.log(
  "Built local Manifest V3 extension. Only public configuration is included.",
);
