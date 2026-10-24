import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";
import { SITE, allSkills, links, profile } from "@/data/resume";
import { PRE_PAINT_SCRIPT, THEME_COLORS } from "@/lib/theme";
import { Providers } from "@/components/providers/Providers";
import { SkipLink } from "@/components/nav/SkipLink";
import { Readout } from "@/components/nav/Readout";
import { Controls } from "@/components/nav/Controls";
import { BoardMenu } from "@/components/nav/BoardMenu";
import { Board } from "@/components/board/Board";
import { Cursor } from "@/components/ui/Cursor";

const archivo = Archivo({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
  preload: true,
});

const martian = Martian_Mono({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  display: "swap",
  variable: "--font-martian",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s — ${profile.name}` },
  description: SITE.description,
  keywords: [profile.name, profile.role, profile.city, ...allSkills],
  authors: [{ name: profile.name, url: SITE.url }],
  creator: profile.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: SITE.title,
    description: SITE.description,
    siteName: profile.name,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLORS.day,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  jobTitle: profile.role,
  email: `mailto:${profile.email}`,
  telephone: profile.phoneHref.replace("tel:", ""),
  url: SITE.url,
  address: { "@type": "PostalAddress", addressLocality: profile.city, addressCountry: "IN" },
  worksFor: { "@type": "Organization", name: profile.now.company, url: profile.now.href },
  sameAs: [links.github.href, links.linkedin.href, links.site.href],
  knowsAbout: allSkills,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${martian.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        <Providers>
          <SkipLink />
          <header className="site-header">
            <Readout />
            <Controls />
          </header>
          {children}
          <BoardMenu />
          <Board />
          <Cursor />
        </Providers>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
