import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // KB aceita arquivos até 10 MB. Margem de 2 MB para overhead do
      // multipart FormData (campos + headers internos).
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // microphone=(self): libera o microfone APENAS na nossa origem
            // (gravacao de audio do agente Nex via getUserMedia). camera e
            // geolocation seguem desligadas. `microphone=()` (lista vazia)
            // bloqueava o mic em todo o site, em dev e prod, fazendo o
            // getUserMedia falhar com NotAllowedError mesmo liberando no navegador.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
