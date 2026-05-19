/**
 * Layout da página /agente — suprime o padding do layout protegido pai
 * para que o painel de chat ocupe toda a altura disponível sem scroll.
 */
export default function AgenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="-mt-16 -mb-8 sm:-mt-8 h-screen overflow-hidden">{children}</div>;
}
