import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950 px-6 py-3 flex items-center gap-6">
      <Link
        href="/projects"
        className="text-sm font-semibold tracking-widest uppercase text-neutral-100 hover:text-white transition-colors"
      >
        MikAI Production Lab
      </Link>
      <nav className="flex items-center gap-4 text-sm text-neutral-400">
        <Link href="/projects" className="hover:text-neutral-100 transition-colors">
          Projects
        </Link>
        <Link href="/settings" className="hover:text-neutral-100 transition-colors">
          Settings
        </Link>
      </nav>
    </header>
  );
}
