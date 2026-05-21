import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * GET /api/integracoes/servidor-mcp/logs/export
 * Streama CSV com logs filtrados. Gate: super_admin.
 *
 * Query params: apiKeyId, tool, module, action, status, dateFrom, dateTo, search
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string; platformRole?: string } | undefined;

  if (!user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (user.platformRole !== "super_admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const apiKeyId = searchParams.get("apiKeyId") ?? undefined;
  const tool = searchParams.get("tool") ?? undefined;
  const module_ = searchParams.get("module") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  const where: Prisma.McpAuditLogWhereInput = {};
  if (apiKeyId) where.apiKeyId = apiKeyId;
  if (tool) where.tool = { contains: tool, mode: "insensitive" };
  if (module_) where.module = { contains: module_, mode: "insensitive" };
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.criadoEm = {};
    if (dateFrom) where.criadoEm.gte = new Date(dateFrom);
    if (dateTo) where.criadoEm.lte = new Date(dateTo);
  }
  if (search) {
    where.OR = [
      { idempotencyKey: { contains: search, mode: "insensitive" } },
      { requestId: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.mcpAuditLog.findMany({
    where,
    orderBy: [{ criadoEm: "desc" }],
    take: 10_000, // cap de segurança
    include: { apiKey: { select: { last4: true } } },
  });

  const csvHeaders = [
    "id",
    "criadoEm",
    "userId",
    "apiKeyLast4",
    "tool",
    "module",
    "action",
    "capability",
    "status",
    "outcome",
    "durationMs",
    "rowCount",
    "httpStatus",
    "errorCode",
    "errorMessage",
    "requestId",
    "idempotencyKey",
    "ipAddress",
  ];

  function escCsv(v: unknown): string {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const lines: string[] = [csvHeaders.join(",")];
  for (const row of rows) {
    const apiKey = (row as unknown as { apiKey?: { last4: string } | null }).apiKey;
    lines.push(
      [
        row.id,
        row.criadoEm.toISOString(),
        row.userId,
        apiKey?.last4 ?? "",
        row.tool,
        row.module ?? "",
        row.action ?? "",
        row.capability ?? "",
        row.status ?? "",
        row.outcome,
        row.durationMs ?? "",
        row.rowCount ?? "",
        row.httpStatus ?? "",
        row.errorCode ?? "",
        row.errorMessage ?? "",
        row.requestId ?? "",
        row.idempotencyKey ?? "",
        row.ipAddress ?? "",
      ]
        .map(escCsv)
        .join(","),
    );
  }

  const csv = lines.join("\n");
  const filename = `mcp-audit-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
