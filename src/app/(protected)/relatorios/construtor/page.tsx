import { redirect } from "next/navigation";

// O construtor agora vive em Relatórios 2.0. Mantém o link antigo funcionando.
export default function ConstrutorLegadoRedirect() {
  redirect("/relatorios-2/construtor");
}
