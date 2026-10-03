import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  icons: {
    icon: [{ url: "/icon.jpg", type: "image/jpeg", sizes: "1536x1024" }],
    apple: [{ url: "/apple-icon.jpg", type: "image/jpeg", sizes: "1536x1024" }],
  },
  openGraph: {
    type: "website",
    siteName: "The Klinique",
    title: "The Klinique by Dr. Kharyl",
    description: "Doctor-led medical aesthetic care in Cagayan de Oro City.",
    url: "/",
    images: [{ url: "/opengraph-image.jpg", width: 1536, height: 1024, alt: "The Klinique Medical and Aesthetic Clinic logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Klinique by Dr. Kharyl",
    description: "Doctor-led medical aesthetic care in Cagayan de Oro City.",
    images: ["/opengraph-image.jpg"],
  },
  title: "The Klinique | Medical Aesthetic Clinic — Cagayan de Oro City",
  description:
    "The Klinique by Dr. Kharyl — Expert medical aesthetic care in Cagayan de Oro City. Botox, fillers, skin boosters, lasers, and more. Book your consultation today.",
};

// Keep CSS media queries tied to the actual phone width instead of a desktop-sized layout viewport.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
