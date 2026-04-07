import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arnav Dhiman",
  description:
    "Saddle Escape Efficiency: A Novel Metric to Benchmark Learning Rates in Non-Convex Optimization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
