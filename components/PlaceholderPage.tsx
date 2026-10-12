import BackHome from '../../components/BackHome';
import SiteFooter from '../../components/SiteFooter';

export default function Placeholder({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <BackHome />
      <div style={{ height: 96 }} />
      <main className="max-w-3xl mx-auto px-5 pb-16 flex-1">
        <h1 className="text-4xl font-bold">{title}</h1>
        <p className="mt-4 text-zinc-300 leading-relaxed">{body}</p>
        <p className="mt-4 text-sm text-zinc-500">This page is being prepared.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
