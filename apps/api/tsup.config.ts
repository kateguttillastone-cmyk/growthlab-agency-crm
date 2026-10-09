import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts", migrate: "src/db/migrate.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // le paquet partagé est publié sous forme de sources TypeScript : on l'embarque dans le bundle
  noExternal: ["@gac/shared"],
});
