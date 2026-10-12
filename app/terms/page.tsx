import BackHome from '../../components/BackHome';
import SiteFooter from '../../components/SiteFooter';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <BackHome />
      <div style={{ height: 96 }} />
      <main className="max-w-3xl mx-auto px-5 pb-16 flex-1">
        <h1 className="text-4xl font-bold">Terms & Conditions</h1>
        <p className="mt-4 text-zinc-300 leading-relaxed">
          These terms are being prepared for World of Dommes. The full terms page will be added
          before public launch.
        </p>
        <p className="mt-4 text-sm text-zinc-500">Last updated: 11 October 2026</p>
      </main>
      <SiteFooter />
    </div>
  );
}
