export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">
          Only <span className="gradient-text">Dommes</span>
        </h1>
        <p className="text-zinc-400 mb-8">Platform for Dominant Creators</p>
        <div className="flex gap-4 justify-center">
          <a href="/login" className="bg-pink-500 hover:bg-pink-600 px-8 py-3 rounded-full font-semibold">
            Log in
          </a>
          <a href="/signup" className="border border-zinc-600 hover:border-pink-500 px-8 py-3 rounded-full">
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
}