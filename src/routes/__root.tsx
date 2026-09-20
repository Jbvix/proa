import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ThemeBoot } from "@/components/theme-boot";
import appCss from "../styles.css?url";

const APP_NAME = "Proa";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Painel de bordo para rebocador: sensores, ondas, Open-Meteo e faixa de RPM.",
      },
      { name: "theme-color", content: "#08141c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="pt-BR" className="antialiased" data-theme="night" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <ThemeBoot />
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
