import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/user/theme
 * Persiste preferência de tema no banco e sincroniza cookies server-side.
 * Os cookies são a fonte de verdade para o SSR , o layout os lê para
 * renderizar o html já com a classe correta, sem flicker.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let theme: unknown;
  try {
    const body = await request.json();
    theme = body?.theme;
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  if (theme !== "dark" && theme !== "light" && theme !== "system") {
    return NextResponse.json({ error: "Tema inválido" }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { theme },
    });
  } catch (err) {
    console.error("[api/user/theme]", err);
    return NextResponse.json(
      { error: "Erro ao salvar tema" },
      { status: 500 },
    );
  }

  // Client já gravou cookies via document.cookie; o server só confirma o POST.
  // Não sobrescrevemos via Set-Cookie para não causar nenhuma corrida
  // entre Set-Cookie tardio e o que o cliente já aplicou na UI.
  return NextResponse.json({ success: true });
}
