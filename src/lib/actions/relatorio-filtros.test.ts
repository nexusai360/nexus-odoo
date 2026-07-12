import { resolverRelatorioComFiltros } from "./relatorio-filtros";

const getCurrentUser = jest.fn();
const carregarRelatorioDinamico = jest.fn();

// prisma mockado sem `appSetting`: getCorteDados cai no padrao (2026-03-16).
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
jest.mock("@/lib/reports/builder/carregar-relatorio-dinamico", () => ({
  carregarRelatorioDinamico: (...a: unknown[]) => carregarRelatorioDinamico(...a),
}));

const ADMIN = { id: "u1", platformRole: "admin" };

beforeEach(() => {
  getCurrentUser.mockReset();
  carregarRelatorioDinamico.mockReset();
  getCurrentUser.mockResolvedValue(ADMIN);
  carregarRelatorioDinamico.mockResolvedValue({ tipo: "ok", entry: {}, dados: {}, meta: {} });
});

/** Os filtros efetivamente repassados ao carregamento. */
function filtrosRepassados(): Record<string, unknown> {
  return carregarRelatorioDinamico.mock.calls[0]![2] as Record<string, unknown>;
}

describe("resolverRelatorioComFiltros , data de inicio das analises", () => {
  it("grampeia um periodo (mes) anterior ao corte pedido pelo browser", async () => {
    await resolverRelatorioComFiltros("rel-1", { periodoDe: "2025-01", periodoAte: "2026-06" });
    expect(filtrosRepassados()).toMatchObject({ periodoDe: "2026-03", periodoAte: "2026-06" });
  });

  it("grampeia um periodo (dia) anterior ao corte pedido pelo browser", async () => {
    await resolverRelatorioComFiltros("rel-1", { periodoDe: "2023-12-31", periodoAte: "2026-04-30" });
    expect(filtrosRepassados()).toMatchObject({ periodoDe: "2026-03-16", periodoAte: "2026-04-30" });
  });

  it("periodo dentro da janela passa intacto, junto dos demais filtros", async () => {
    await resolverRelatorioComFiltros("rel-1", {
      periodoDe: "2026-05",
      periodoAte: "2026-07",
      marca: " Matrix ",
      armazemId: 3,
    });
    expect(filtrosRepassados()).toMatchObject({
      periodoDe: "2026-05",
      periodoAte: "2026-07",
      marca: "Matrix",
      armazemId: 3,
    });
  });

  it("sem periodo, nao inventa periodo aqui (o piso e aplicado no produtor da fonte)", async () => {
    await resolverRelatorioComFiltros("rel-1", { faixaDias: 90 });
    expect(filtrosRepassados()).toEqual({ faixaDias: 90 });
  });

  it("nega quem nao esta autenticado", async () => {
    getCurrentUser.mockResolvedValue(null);
    const r = await resolverRelatorioComFiltros("rel-1", { periodoDe: "2020-01" });
    expect(r).toEqual({ ok: false, error: "Nao autenticado" });
    expect(carregarRelatorioDinamico).not.toHaveBeenCalled();
  });
});
