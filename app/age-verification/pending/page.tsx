import Link from 'next/link';

export default function AgeVerificationPendingPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl bg-zinc-900 p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold">Age verification required</h1>
        <p className="text-zinc-400">Please complete AgeGO verification before accessing World of Dommes.</p>
        <Link href="/setup" className="inline-block rounded-2xl bg-pink-500 px-5 py-4 font-semibold">Continue verification</Link>
        <Link href="/login" className="block text-pink-400">Log in to another account</Link>
      </section>
    </main>
  );
}
