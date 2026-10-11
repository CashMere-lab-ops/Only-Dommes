import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type, username')
      .eq('id', user.id)
      .maybeSingle();

    const meta = user.user_metadata || {};
    const metaType = meta.account_type === 'creator' || meta.account_type === 'sub'
      ? meta.account_type
      : null;
    const metaName = typeof meta.username === 'string' ? meta.username : null;

    if (!profile?.account_type && metaType && metaName) {
      await supabase.from('profiles').upsert({
        id: user.id,
        username: metaName,
        display_name: metaName,
        account_type: metaType,
      });
    } else if (!profile?.account_type) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(`${origin}${safeNext}`);
}
