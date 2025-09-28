import "./globals.css";
import type { Metadata } from "next";
import { Inter, Poppins, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WalleFantasy - Build Your Dream Team",
  description:
    "The ultimate fantasy cricket platform with modern UI and real-time updates",
  keywords: "fantasy cricket, sports, gaming, team building",
  authors: [{ name: "WalleFantasy Team" }],
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <body className={`${inter.className} bg-gray-50 antialiased`}>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
