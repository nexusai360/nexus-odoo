import { redirect } from "next/navigation";

// /relatorios-2 , o item de grupo nao tem tela propria; cai nos Paineis.
export default function Relatorios2Index() {
  redirect("/relatorios-2/paineis");
}
