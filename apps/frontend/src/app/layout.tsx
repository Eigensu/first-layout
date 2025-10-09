import "./globals.css";
import type { Metadata } from "next";
import { Inter, Poppins, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGate from "@/components/auth/AuthGate";

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
  title: "Wall-E Arena - Build Your Dream Team",
  description:
    "The ultimate fantasy cricket platform with modern UI and real-time updates",
  keywords: "fantasy cricket, sports, gaming, team building",
  authors: [{ name: "Wall-E Arena Team" }],
  icons: {
    icon: "/logo.jpeg",
    shortcut: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
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
        <AuthProvider>
          <AuthGate>
            <div className="min-h-screen">{children}</div>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
