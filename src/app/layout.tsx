import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Londrina_Solid, Poppins } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ContextStrip from "@/components/ContextStrip";
import RightPanel from "@/components/RightPanel";
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

// Custom/Mikros theme typography (THEME.MIKROS.3) — self-hosted via
// next/font like the pair above, but only ever *consumed* under
// html.theme-mikros in globals.css. Default keeps IBM Plex Sans exactly
// as before: loading these variables on <html> has no visual effect
// without the theme's scoped font-family rules.
const londrinaSolid = Londrina_Solid({
  variable: "--font-londrina-solid",
  subsets: ["latin"],
  weight: "400",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${londrinaSolid.variable} ${poppins.variable} h-full`}
      // The anti-flash script below adds "theme-mikros" to this element
      // before hydration when Mikros is the saved mode (THEME.MIKROS.1) —
      // that class is intentionally absent from the SSR-rendered
      // className, so React's hydration diff on this one attribute must
      // be suppressed rather than "fixed" by rendering the class server-
      // side (the server has no access to localStorage). Scoped to this
      // element only — no other hydration checks are affected.
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash: applies the saved theme (Mikros or a custom
            variant) before first paint (THEME.MIKROS.1 / THEME.MIKROS.2).
            Static script, no interpolated user input — reads two fixed
            localStorage keys and only ever writes CSS custom properties,
            never innerHTML. The mix/derive math is a hand-kept-in-sync
            copy of mixHex()/deriveFullPalette() in src/lib/mikrosTheme.ts
            (a plain <script> tag can't import a module), so any change to
            those formulas must be mirrored here by hand. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var mode = localStorage.getItem('mikai.themeMode');
                if (!mode) return;
                var el = document.documentElement;
                var HEX_RE = /^#[0-9a-fA-F]{6}$/;
                function mix(a, b, w) {
                  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return a;
                  var an = parseInt(a.slice(1), 16), bn = parseInt(b.slice(1), 16);
                  var ar = (an >> 16) & 255, ag = (an >> 8) & 255, ab = an & 255;
                  var br = (bn >> 16) & 255, bg = (bn >> 8) & 255, bb = bn & 255;
                  var r = Math.round(ar * w + br * (1 - w));
                  var g = Math.round(ag * w + bg * (1 - w));
                  var bl = Math.round(ab * w + bb * (1 - w));
                  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
                }
                function applyPalette(base) {
                  el.classList.add('theme-mikros');
                  var full = {
                    '--mikros-canvas': base.canvas, '--mikros-surface': base.surface,
                    '--mikros-raised': base.raised, '--mikros-border': base.border,
                    '--mikros-text-primary': base.textPrimary, '--mikros-text-secondary': base.textSecondary,
                    '--mikros-accent': base.accent, '--mikros-accent-hover': base.accentHover,
                    '--mikros-elevated': mix(base.raised, base.border, 0.6),
                    '--mikros-border-subtle': mix(base.border, base.canvas, 0.55),
                    '--mikros-border-strong': mix(base.border, base.textPrimary, 0.55),
                    '--mikros-text-tertiary': mix(base.textSecondary, base.canvas, 0.7),
                    '--mikros-text-disabled': mix(base.textSecondary, base.canvas, 0.45),
                    '--background': base.canvas, '--foreground': base.textPrimary
                  };
                  for (var k in full) el.style.setProperty(k, full[k]);
                }
                if (mode === 'mikros') {
                  el.classList.add('theme-mikros');
                } else if (mode.indexOf('custom:') === 0) {
                  var id = mode.slice(7);
                  var raw = localStorage.getItem('mikai.customThemes');
                  if (!raw) return;
                  var list = JSON.parse(raw);
                  if (!Array.isArray(list)) return;
                  var keys = ['canvas','surface','raised','border','textPrimary','textSecondary','accent','accentHover'];
                  for (var i = 0; i < list.length; i++) {
                    var t = list[i];
                    if (!t || t.id !== id || !t.tokens) continue;
                    var ok = true;
                    for (var j = 0; j < keys.length; j++) {
                      if (!HEX_RE.test(t.tokens[keys[j]])) { ok = false; break; }
                    }
                    if (ok) { applyPalette(t.tokens); }
                    break;
                  }
                }
              } catch (e) {}
            })();`,
          }}
        />
      </head>
      <body className="h-full bg-[#0d0e10] text-[#a4abb2] antialiased flex flex-col overflow-hidden">
        {/* Top bar — persistent across all routes */}
        <TopBar tree={tree} />

        {/* Context strip — tabs derived from current route */}
        <ContextStrip tree={tree} />

        {/* 3-column body */}
        <div className="flex flex-1 min-h-0">
          {/* Left nav */}
          <Sidebar tree={tree} />

          {/* Center editor — primary scrollable area */}
          <main className="flex-1 overflow-y-auto">
            <div className="px-6 py-6">
              {children}
            </div>
          </main>

          {/* Right context panel */}
          <RightPanel tree={tree} />
        </div>
      </body>
    </html>
  );
}
