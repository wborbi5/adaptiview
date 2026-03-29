import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdaptiView — Adaptive Clinical Trial Review",
  description: "Clinical trial review powered by real-time gaze tracking and cognitive style classification",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head />
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
