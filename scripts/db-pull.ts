// `db:pull` debe correr siempre en el host, nunca dentro del contenedor
// `rebusque-backend`. `DATABASE_URL` en `.env` usa el hostname `rebusque-db`
// (solo resuelve en la red Podman `rebusque-net`, no desde el host).
//
// Gotcha comprobado (17-sep-2026): el auto-load nativo de `.env`/`.env.local`
// de Bun SI funciona en invocaciones directas (`bun -e`, `bun run --watch
// src/server.ts`), pero NO se propaga de forma confiable a subprocesos
// spawneados via `bunx <paquete>` (drizzle-kit se resuelve asi) -- probado:
// `bunx drizzle-kit pull` fallaba en silencio con `.env.local` presente,
// funcionaba solo con `export DATABASE_URL=...` explicito en el shell antes
// de invocarlo. Por eso este script fuerza el host explicitamente en el env
// que le pasa al subproceso, en vez de confiar en el auto-load de archivos.
import "dotenv/config";

const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
  url.hostname = "127.0.0.1";
}

function run(cmd: string[]): void {
  const proc = Bun.spawnSync(cmd, {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode ?? 1);
  }
}

run(["bunx", "drizzle-kit", "pull"]);
run(["bun", "run", "scripts/fix-bytea.ts"]);
