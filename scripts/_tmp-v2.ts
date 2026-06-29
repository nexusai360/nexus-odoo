import { chromium } from "playwright";
const BASE="http://localhost:3000", EMAIL="render-check@local.test", SENHA="Teste@12345", OUT="/tmp/diretoria-shots";
async function go(){
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:2,colorScheme:"light"});
  await ctx.addInitScript(()=>{try{localStorage.setItem("theme","light");}catch{}});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/login`,{waitUntil:"networkidle"});
  await p.fill('input[name="email"]',EMAIL); await p.fill('input[name="password"]',SENHA);
  await Promise.all([p.waitForURL((u:URL)=>!u.pathname.includes("/login"),{timeout:20000}).catch(()=>{}),p.click('button[type="submit"]')]);
  await p.waitForTimeout(1500);
  await p.goto(`${BASE}/diretoria/vendas`,{waitUntil:"networkidle"}); await p.waitForTimeout(2000);
  await p.getByRole("tab",{name:/marca/i}).click(); await p.waitForTimeout(1500);
  await p.screenshot({path:`${OUT}/v2_distrib_light.png`, fullPage:true});
  await p.goto(`${BASE}/diretoria/estoque`,{waitUntil:"networkidle"}); await p.waitForTimeout(2000);
  await p.getByRole("tab",{name:/Fornecedores/i}).click(); await p.waitForTimeout(1500);
  await p.screenshot({path:`${OUT}/v2_ranking_light.png`, fullPage:true});
  console.info("OK");
  await b.close();
}
go().catch(e=>{console.error("ERRO",String(e));process.exit(1);});
