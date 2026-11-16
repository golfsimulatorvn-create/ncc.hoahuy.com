/**
 * Chay toan bo kiem thu cua cong (npm test): typecheck, i18n, kiem thu loi (khong can server), roi E2E neu server dev dang chay.
 * E2E can: cong dev :3200 + CRM dev (xem e2e-orders.ts). WEBKIT_PATH=<Playwright.exe> de chay iPhone neu Playwright can duong dan.
 * Dung --no-e2e de bo E2E (CI khong co CRM).
 */
import { spawnSync } from "node:child_process";

const steps: { name: string; cmd: string; args: string[] }[] = [
  { name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "i18n", cmd: "npx", args: ["tsx", "scripts/i18n-check.ts"] },
  { name: "loi (test-core)", cmd: "npx", args: ["tsx", "scripts/test-core.ts"] },
];

async function serverUp(): Promise<boolean> {
  try { return (await fetch("http://localhost:3200/dang-nhap", { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
}

async function main() {
  if (!process.argv.includes("--no-e2e")) {
    if (await serverUp()) {
      for (const s of ["auth", "orders", "rfq", "costs", "payables", "claims", "roles"]) {
        for (const e of ["desktop", "iphone"]) steps.push({ name: `e2e ${s}/${e}`, cmd: "npx", args: ["tsx", `scripts/e2e-${s}.ts`, `--engine=${e}`] });
      }
    } else console.log("BO QUA E2E: khong thay cong dev o :3200 (chay `npm run dev` + CRM dev, hoac dung --no-e2e).");
  }
  let bad = 0;
  for (const s of steps) {
    const r = spawnSync(s.cmd, s.args, { stdio: "pipe", encoding: "utf8", shell: true, env: process.env });
    const ok = r.status === 0;
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "LOI "} ${s.name}`);
    if (!ok) console.log((r.stdout ?? "").split("\n").filter((l) => /FAIL|LOI|error/i.test(l)).slice(0, 8).join("\n"));
  }
  console.log(bad ? `\n${bad} buoc loi.` : "\nTat ca dat.");
  process.exit(bad ? 1 : 0);
}
main();
