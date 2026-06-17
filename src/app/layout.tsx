import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Tree",
  description: "Analyze and manage chess notation as a move tree.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
