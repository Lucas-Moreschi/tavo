import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/controls.css";
import { PwaProvider } from "@/shared/providers/pwa-provider";

export const metadata: Metadata = {
  title: "TAVO · Gestão inteligente",
  description: "Salão, cozinha, caixa e estoque em sintonia.",
  applicationName: "TAVO",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TAVO" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
