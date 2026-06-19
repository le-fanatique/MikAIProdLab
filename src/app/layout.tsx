import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { asc } from "drizzle-orm";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "MikAI Production Lab",
  description: "Local AI production preparation tool",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .orderBy(asc(projects.name));

  const sequenceRows = await db
    .select({
      id: sequences.id,
      projectId: sequences.projectId,
      title: sequences.title,
      orderIndex: sequences.orderIndex,
    })
    .from(sequences)
    .orderBy(asc(sequences.orderIndex));

  const shotRows = await db
    .select({
      id: shots.id,
      sequenceId: shots.sequenceId,
      shotCode: shots.shotCode,
      title: shots.title,
      orderIndex: shots.orderIndex,
    })
    .from(shots)
    .orderBy(asc(shots.orderIndex));

  const tree = projectRows.map((p) => ({
    ...p,
    sequences: sequenceRows
      .filter((s) => s.projectId === p.id)
      .map((s) => ({
        ...s,
        shots: shotRows.filter((sh) => sh.sequenceId === s.id),
      })),
  }));

  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full`}
    >
      <body className="h-full bg-[#0d0e10] text-[#a4abb2] antialiased flex overflow-hidden">
        <Sidebar tree={tree} />
        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-8 max-w-4xl">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
