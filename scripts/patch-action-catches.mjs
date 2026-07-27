import fs from "fs";
import path from "path";

const dir = "src/lib/actions";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "result.ts");
let patched = 0;

for (const file of files) {
  const p = path.join(dir, file);
  let src = fs.readFileSync(p, "utf8");
  const orig = src;

  const hasSilent =
    /catch\s*\{\s*\r?\n\s*return\s*\{\s*ok:\s*false,\s*error:\s*["']database_error["']\s*\};/.test(
      src,
    );
  if (!hasSilent) continue;

  if (!src.includes("actionDatabaseError")) {
    if (src.includes('from "@/lib/prisma"')) {
      src = src.replace(
        'from "@/lib/prisma";',
        'from "@/lib/prisma";\nimport { actionDatabaseError } from "@/lib/actions/result";',
      );
    } else {
      src = src.replace(
        /("use server";\r?\n)/,
        `$1\nimport { actionDatabaseError } from "@/lib/actions/result";\n`,
      );
    }
  }

  const scope = file.replace(/\.ts$/, "");
  src = src.replace(
    /\} catch \{\r?\n(\s*)return \{ ok: false, error: ["']database_error["'] \};\r?\n(\s*)\}/g,
    `} catch (error) {\n$1return actionDatabaseError("${scope}", error);\n$2}`,
  );

  if (src !== orig) {
    fs.writeFileSync(p, src);
    patched += 1;
    console.log("patched", file);
  }
}

console.log("total", patched);
