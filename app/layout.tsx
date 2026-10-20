import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reservas de clases",
  description: "Horario y reservas de clases de tu hípica.",
  appleWebApp: { capable: true, title: "Reservas", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1f4d3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
