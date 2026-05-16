import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/user/theme
 * Persiste preferência de tema no banco e sincroniza cookies server-side.
 * Os cookies são a fonte de verdade para o SSR — o layout os lê para
 * renderizar o html já com a classe correta, sem flicker.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const theme = body.theme;

  if (theme !== "dark" && theme !== "light" && theme !== "system") {
    return NextResponse.json({ error: "Tema inválido" }, { status: 400 });
  }

  const userId = (session.user as any).id;
  await prisma.user.update({
    where: { id: userId },
    data: { theme },
  });

  // Client já gravou cookies via document.cookie; o server só confirma o POST.
  // Não sobrescrevemos via Set-Cookie para não causar nenhuma corrida
  // entre Set-Cookie tardio e o que o cliente já aplicou na UI.
  return NextResponse.json({ success: true });
}
