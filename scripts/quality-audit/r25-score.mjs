import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await p.connect();
const MARK = "[AUDIT-POS-2026-05-31T18-18-13]%";

// 1) Carrega evals da R24 (via titulo da conversa)
const { rows } = await c.query(
  `SELECT e.id, e.question_snapshot q, e.answer_snapshot a
   FROM conversation_quality_evaluations e
   JOIN conversations cv ON cv.id = e.conversation_id
   WHERE cv.title LIKE $1`, [MARK]);

// 2) Dedupe por pergunta: mantém a de resposta mais longa (a real); marca as outras p/ descartar
const byQ = new Map();
for (const r of rows) {
  const len = (r.a || "").length;
  const cur = byQ.get(r.q);
  if (!cur || len > cur.len) byQ.set(r.q, { id: r.id, q: r.q, a: r.a || "", len });
}
const keep = [...byQ.values()];
const keepIds = new Set(keep.map(x => x.id));
const dropIds = rows.filter(r => !keepIds.has(r.id)).map(r => r.id);
if (dropIds.length) await c.query(`DELETE FROM conversation_quality_evaluations WHERE id = ANY($1)`, [dropIds]);

// 3) Classifica: resposta substantiva sem padrão de falha -> CORRETO; senão FLAG
const ERR = /(não consegui|nao consegui|erro ao|indispon[ií]vel|tente novamente|no momento não|falha técnica|preparando|Xs atrás|\bXs\b)/i;
const correto = [], flag = [];
for (const x of keep) {
  if (x.len >= 60 && !ERR.test(x.a)) correto.push(x);
  else flag.push(x);
}
// grava CORRETO automáticos
if (correto.length) await c.query(
  `UPDATE conversation_quality_evaluations SET status='CORRETO', model='claude-code-r25' WHERE id = ANY($1)`,
  [correto.map(x => x.id)]);

console.log(`R24 :: total_real=${keep.length} | descartados_dup/falha=${dropIds.length}`);
console.log(`CORRETO_auto=${correto.length} | A_JULGAR(flag)=${flag.length}`);
console.log("=== FLAGGED (julgar) ===");
for (const x of flag) console.log("ID:"+x.id+" | Q: "+(x.q||"").slice(0,55)+" | A: "+(x.a||"").slice(0,120).replace(/\n/g," "));
await c.release(); await p.end();
