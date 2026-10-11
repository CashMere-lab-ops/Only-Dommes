'use client';

import Link from 'next/link';

export default function AgeTermsTicks({
  age,
  setAge,
  terms,
  setTerms,
}: {
  age: boolean;
  setAge: (value: boolean) => void;
  terms: boolean;
  setTerms: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3 text-sm text-zinc-300 text-left">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={age}
          onChange={(e) => setAge(e.target.checked)}
          className="mt-1 h-4 w-4 accent-pink-500"
        />
        <span>I confirm I am at least 18 years old.</span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          className="mt-1 h-4 w-4 accent-pink-500"
        />
        <span>
          I agree to the{' '}
          <Link href="/terms" className="text-white font-semibold hover:text-pink-400">
            Terms & Conditions
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-white font-semibold hover:text-pink-400">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
    </div>
  );
}
