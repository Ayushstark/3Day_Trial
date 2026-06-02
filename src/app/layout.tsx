import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OneAtlas Trial Pipeline",
  description: "AI generation pipeline for validated AppSpec output"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
