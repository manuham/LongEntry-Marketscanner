import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LongEntry Market Scanner",
  description:
    "Live trading intelligence platform. Analyzes 14 commodity/index markets, finds optimal trading parameters, and scores them with technical, backtest, and AI fundamental analysis.",
  authors: [{ name: "LongEntry" }],
  creator: "LongEntry",
  openGraph: {
    title: "LongEntry Market Scanner",
    description:
      "Live trading intelligence platform analyzing 14 commodity/index markets.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={`${inter.variable} font-sans`}
        style={{
          backgroundColor: "var(--bg-base)",
          color: "var(--text-body)",
        }}
      >
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          <main className="flex-1">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
