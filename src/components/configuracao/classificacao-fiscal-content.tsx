// Painel de acompanhamento do MODO SOMBRA da classificação de receita.
//
// Para que serve: a plataforma passou a calcular a receita pelas DUAS regras (a antiga, pelo
// nome da operação, e a nova, pela natureza), mas quem manda no número continua sendo a
// ANTIGA. Esta tela mostra o placar entre elas, para o dono decidir a virada com prova, e
// lista o que precisa de calibragem.
//
// ui-ux-pro-max: mesma linguagem do painel da Diretoria (dark, denso, SectionCard + números
// tabulares). Sem emoji como ícone; ícones do lucide, como no resto do produto.

import { ScaleIcon, TriangleAlert, ListChecks, CircleHelp } from "lucide-react";

import { SectionCard } from "@/components/diretoria/kit/section-card";
import { brl, num, pct1 } from "@/components/diretoria/kit/format";
import type {
  PlacarClassificacao,
  LinhaDivergencia,
  NaturezaDesconhecida,
} from "@/lib/fiscal/divergencias";

const dataBR = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Verde quando as duas regras concordam sempre; âmbar quando há o que calibrar. */
function corDoAcerto(pct: number): string {
  if (pct >= 99.9) return "text-emerald-400";
  if (pct >= 98) return "text-amber-400";
  return "text-rose-400";
}

function Numero({
  rotulo,
  valor,
  detalhe,
  className,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${className ?? "text-white/90"}`}>
        {valor}
      </p>
      {detalhe ? <p className="mt-0.5 text-xs text-white/40">{detalhe}</p> : null}
    </div>
  );
}

/** Diz, em uma linha, qual regra viu venda naquela nota. Cor nunca é o único sinal (a11y). */
function Veredito({ porNome, porNatureza }: { porNome: boolean; porNatureza: boolean }) {
  const texto = porNome
    ? "Só o nome diz que é venda"
    : "Só a natureza diz que é venda";
  const detalhe = porNome
    ? "entra no faturamento (o nome manda)"
    : "fica de fora do faturamento (o nome manda)";
  return (
    <div className="flex flex-col">
      <span className="text-white/80">{texto}</span>
      <span className="text-xs text-white/40">{detalhe}</span>
    </div>
  );
}

export function ClassificacaoFiscalContent({
  placar,
  divergencias,
  naturezasDesconhecidas,
}: {
  placar: PlacarClassificacao;
  divergencias: LinhaDivergencia[];
  naturezasDesconhecidas: NaturezaDesconhecida[];
}) {
  const diferenca = placar.totalPorNatureza - placar.totalPorNome;

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="Placar das duas regras"
        subtitle="A regra nova (natureza da operação) roda em paralelo e só observa. Quem decide o número da plataforma continua sendo a regra antiga (a palavra venda no nome da operação)."
        icon={ScaleIcon}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero
            rotulo="Acerto entre as regras"
            valor={pct1(placar.percentualAcerto)}
            detalhe={`${num.format(placar.concordancias)} de ${num.format(placar.notasAvaliadas)} notas`}
            className={corDoAcerto(placar.percentualAcerto)}
          />
          <Numero
            rotulo="Divergências"
            valor={num.format(placar.divergencias)}
            detalhe={placar.divergencias === 0 ? "as duas regras concordam em tudo" : "notas para conferir abaixo"}
            className={placar.divergencias === 0 ? "text-emerald-400" : "text-amber-400"}
          />
          <Numero
            rotulo="Faturamento de hoje (vale este)"
            valor={brl.format(placar.totalPorNome)}
            detalhe="regra antiga, pelo nome da operação"
          />
          <Numero
            rotulo="O que a regra nova daria"
            valor={brl.format(placar.totalPorNatureza)}
            detalhe={
              diferenca === 0
                ? "idêntico ao de hoje"
                : `${diferenca > 0 ? "+" : ""}${brl.format(diferenca)} em relação ao de hoje`
            }
          />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-white/40">
          Nenhum número desta tela altera o dashboard, os relatórios ou as respostas do Nex. A
          regra nova está em observação: quando o placar estiver limpo o bastante, a troca pode
          ser feita com prova, e não no escuro.
        </p>
      </SectionCard>

      <SectionCard
        title="Naturezas de operação que ninguém mapeou"
        subtitle="Operação nova cadastrada no Odoo aparece aqui, com o valor envolvido, em vez de sumir do faturamento em silêncio."
        icon={CircleHelp}
        bodyClassName="p-0"
      >
        {naturezasDesconhecidas.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm text-white/50">
            <ListChecks className="size-4 shrink-0 text-emerald-400" aria-hidden />
            <span>Nenhuma. Todas as naturezas de operação em uso estão no catálogo.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wide text-white/40">
                  <th scope="col" className="px-5 py-3 font-medium">Natureza</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Notas</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Já conta hoje</th>
                </tr>
              </thead>
              <tbody>
                {naturezasDesconhecidas.map((n) => (
                  <tr
                    key={n.naturezaOperacaoId ?? "sem"}
                    className="border-b border-white/[0.03] last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <TriangleAlert className="size-4 shrink-0 text-amber-400" aria-hidden />
                        <span className="text-white/80">
                          {n.naturezaOperacaoNome ?? "Nota sem natureza de operação"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-white/70">
                      {num.format(n.notas)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-white/90">
                      {brl.format(n.valor)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-white/50">
                      {brl.format(n.valorContadoHoje)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Notas em que as duas regras discordam"
        subtitle="É por aqui que o catálogo de naturezas se calibra. Enquanto a divergência existir, o valor exibido é sempre o da regra antiga."
        icon={TriangleAlert}
        bodyClassName="p-0"
      >
        {divergencias.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm text-white/50">
            <ListChecks className="size-4 shrink-0 text-emerald-400" aria-hidden />
            <span>Nenhuma divergência. As duas regras chegaram à mesma conclusão em todas as notas.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wide text-white/40">
                  <th scope="col" className="px-5 py-3 font-medium">Nota</th>
                  <th scope="col" className="px-5 py-3 font-medium">Cliente</th>
                  <th scope="col" className="px-5 py-3 font-medium">Operação e natureza</th>
                  <th scope="col" className="px-5 py-3 font-medium">Quem viu venda</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {divergencias.map((d) => (
                  <tr key={d.odooId} className="border-b border-white/[0.03] last:border-0 align-top">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="text-white/80">{d.numero ?? `#${d.odooId}`}</span>
                      <span className="block text-xs text-white/40">
                        {d.dataEmissao ? dataBR.format(d.dataEmissao) : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/70">{d.participanteNome ?? ""}</td>
                    <td className="px-5 py-3">
                      <span className="text-white/70">{d.operacaoNome ?? ""}</span>
                      <span className="block text-xs text-white/40">
                        {d.naturezaDesconhecida
                          ? "natureza fora do catálogo"
                          : d.naturezaOperacaoNome ?? "sem natureza"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Veredito porNome={d.porNome} porNatureza={d.porNatureza} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-white/90 whitespace-nowrap">
                      {brl.format(d.vrNf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
