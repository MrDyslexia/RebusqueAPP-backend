// Parche post `drizzle-kit pull`: reemplaza los placeholders `unknown(...)`
// generados para columnas `bytea` de Postgres (drizzle-kit 0.31 no las
// introspecta a un tipo nativo) por el customType definido en
// src/db/custom-types.ts. Ver README.md, seccion "Esquema de datos".
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const schemaPath = join(import.meta.dir, "..", "src", "db", "schema.ts");
let content = readFileSync(schemaPath, "utf-8");

const before = content;

// 1. Reemplazar cada columna `unknown("col_name")` por `bytea("col_name")`.
content = content.replace(/unknown\((["'])([\w]+)\1\)/g, "bytea($1$2$1)");

// 2. Asegurar el import del customType si hubo algun reemplazo.
const usedBytea = /\bbytea\(/.test(content);
const hasImport = /from ["']\.\/custom-types\.js["']/.test(content);

if (usedBytea && !hasImport) {
  const importLine = 'import { bytea } from "./custom-types.js"\n';
  const lines = content.split("\n");
  const lastImportIdx = lines.reduce(
    (acc, line, idx) => (line.startsWith("import ") ? idx : acc),
    -1
  );
  lines.splice(lastImportIdx + 1, 0, importLine.trimEnd());
  content = lines.join("\n");
}

if (content !== before) {
  writeFileSync(schemaPath, content, "utf-8");
  console.log("fix-bytea: schema.ts parcheado (unknown -> bytea).");
} else {
  console.log("fix-bytea: nada que parchear.");
}
