import Link from 'next/link';

const linkClass =
  'block py-2 text-sm text-zinc-400 hover:text-pink-500 focus:text-pink-500 focus:outline-none';

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 text-zinc-400">
      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <nav aria-label="Explore">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Explore</p>
            <Link href="/discover" className={linkClass}>Explore Creators</Link>
            <Link href="/onboarding" className={linkClass}>Become a Creator</Link>
            <Link href="/live" className={linkClass}>Live</Link>
            <Link href="/community" className={linkClass}>Community</Link>
          </nav>
          <nav aria-label="Support and safety">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Support & Safety</p>
            <Link href="/support" className={linkClass}>Help Centre</Link>
            <Link href="/contact" className={linkClass}>Contact Us</Link>
            <Link href="/report" className={linkClass}>Report Content</Link>
            <Link href="/complaints" className={linkClass}>Complaints</Link>
          </nav>
          <nav aria-label="Legal">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Legal</p>
            <Link href="/terms" className={linkClass}>Terms of Service</Link>
            <Link href="/privacy" className={linkClass}>Privacy Policy</Link>
            <Link href="/cookies" className={linkClass}>Cookie Policy</Link>
            <Link href="/copyright" className={linkClass}>Copyright / DMCA</Link>
          </nav>
          <nav aria-label="More legal">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 sm:invisible">More</p>
            <Link href="/guidelines" className={linkClass}>Community Guidelines</Link>
            <Link href="/content-removal" className={linkClass}>Content Removal Requests</Link>
          </nav>
        </div>

        <div className="mt-8 pt-5 border-t border-zinc-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-500">
          <p>© {year} Quinn Digital Platforms Ltd</p>
          <p>Trading as World of Dommes</p>
        </div>
      </div>
    </footer>
  );
}
