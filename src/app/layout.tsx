import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "체스 트리",
  description: "체스 기보를 수 트리로 분석하고 관리합니다.",
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
