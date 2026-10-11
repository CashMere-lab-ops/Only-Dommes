import { ArrowLeft } from 'lucide-react';

export default function BackHome() {
  return (
    <a
      href="/"
      className="fixed z-30 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-pink-500 focus:text-pink-500 active:text-pink-500 transition left-4 top-[max(1rem,env(safe-area-inset-top))]"
    >
      <ArrowLeft size={16} strokeWidth={1.75} />
      Back to home
    </a>
  );
}
