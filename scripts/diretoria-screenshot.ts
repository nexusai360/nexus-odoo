// Screenshot de validação da UI da Diretoria. Faz login com o usuário de render
// e captura cada aba da tela passada. Uso:
//   npx tsx scripts/diretoria-screenshot.ts <rota> <aba1,aba2,...>
// Ex.: npx tsx scripts/diretoria-screenshot.ts /diretoria/estoque visao,estoque,distribuicao,seriais,compras,fornecedores
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EMAIL = "render-check@local.test";
const SENHA = "Teste@12345";
const OUT = "/tmp/diretoria-shots";

async function main() {
  const rota = process.argv[2] ?? "/diretoria/estoque";
  const abas = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const nomeBase = rota.replace(/\//g, "_").replace(/^_/, "");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("theme", "dark"); } catch {}
  });
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', SENHA);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);

  // Navega para a rota
  await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const fs = await import("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const tabs = page.getByRole("tab");
  const n = await tabs.count();
  if (n === 0 || abas.length === 0) {
    const p = `${OUT}/${nomeBase}.png`;
    await page.screenshot({ path: p, fullPage: true });
    console.info(`shot: ${p}`);
  } else {
    for (let i = 0; i < n; i++) {
      const rotulo = abas[i] ?? `aba${i}`;
      try {
        await tabs.nth(i).click({ timeout: 4000 });
        await page.waitForTimeout(1300);
      } catch {
        console.warn(`aba não clicável: ${i}`);
      }
      const p = `${OUT}/${nomeBase}__${i}_${rotulo}.png`;
      await page.screenshot({ path: p, fullPage: true });
      console.info(`shot: ${p}`);
    }
  }

  await browser.close();
}

main();
