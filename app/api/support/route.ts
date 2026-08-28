import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TOPICS = new Set([
  'Account',
  'Wallet & payouts',
  'Live',
  'Clips',
  'Shop & shipping',
  'Messages & calls',
  'Report a user',
  'Other',
]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = String(body.topic || '').trim();
    const message = String(body.message || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!TOPICS.has(topic)) {
      return NextResponse.json({ error: 'Choose a topic' }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json(
        { error: 'Please tell us a bit more (10+ characters)' },
        { status: 400 }
      );
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(url, service);

    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const {
      data: { user },
    } = await admin.auth.getUser(token);
    if (!user?.email) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const userId = user.id;
    const email = user.email;
    const { data: profile } = await admin
      .from('profiles')
      .select('username, display_name, account_type')
      .eq('id', user.id)
      .maybeSingle();
    const username = profile?.username || null;
    const name = profile?.display_name || null;
    const accountType = profile?.account_type || null;

    const { data: ticket, error: insErr } = await admin
      .from('support_tickets')
      .insert({
        user_id: userId,
        email,
        name,
        username,
        account_type: accountType,
        topic,
        message,
        status: 'open',
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('support insert', insErr);
      return NextResponse.json(
        { error: 'Could not save your message. Try again.' },
        { status: 500 }
      );
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const from =
        process.env.SUPPORT_FROM_EMAIL ||
        'World of Dommes <noreply@worldofdommes.com>';
      const to = process.env.SUPPORT_INBOX || 'support@worldofdommes.com';
      const html = `
        <p><strong>New support ticket</strong></p>
        <p>ID: ${ticket.id}</p>
        <p>Topic: ${topic}</p>
        <p>From: ${name || '—'} ${username ? `(@${username})` : ''}</p>
        <p>Email: ${email}</p>
        <p>Account: ${accountType || 'guest'}</p>
        <p>${message.replace(/</g, '&lt;')}</p>
      `;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: email,
          subject: `[${topic}] ${username ? '@' + username : email}`,
          html,
        }),
      }).catch((e) => console.error('support resend', e));
    }

    return NextResponse.json({ ok: true, id: ticket.id });
  } catch (e: any) {
    console.error('support', e);
    return NextResponse.json(
      { error: e?.message || 'Could not send' },
      { status: 500 }
    );
  }
}
