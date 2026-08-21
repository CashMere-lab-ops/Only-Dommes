import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Always block links / domains in live chat (platform rule). */
const LINK_RE =
  /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|co|uk|gg|me|tv|xyz|app|dev|info|biz)\b)/i;

/**
 * Send live chat — mute/ban + always block links + optional follow/sub gate.
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const streamId = String(body?.stream_id || '');
    let content = String(body?.content || '').trim();

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }
    if (content.length > 300) content = content.slice(0, 300);

    // Base stream only (works even if filter columns not migrated yet)
    const { data: stream, error: stErr } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (stErr || !stream) {
      return NextResponse.json(
        { error: stErr?.message || 'Stream not found' },
        { status: 404 }
      );
    }
    if (stream.status === 'ended') {
      return NextResponse.json({ error: 'Live has ended' }, { status: 400 });
    }

    const isHost = stream.creator_id === user.id;

    // Platform rule: no links for anyone (including host keeps chat clean)
    if (LINK_RE.test(content)) {
      return NextResponse.json(
        {
          error: 'Links are not allowed in live chat',
          code: 'LINKS_BLOCKED',
        },
        { status: 400 }
      );
    }

    if (!isHost) {
      const { data: mod } = await admin
        .from('live_stream_moderation')
        .select('action')
        .eq('stream_id', streamId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (mod?.action === 'ban') {
        return NextResponse.json(
          { error: 'You are banned from this live', code: 'BANNED' },
          { status: 403 }
        );
      }
      if (mod?.action === 'mute') {
        return NextResponse.json(
          { error: 'You are muted and cannot chat', code: 'MUTED' },
          { status: 403 }
        );
      }

      const requireRaw = stream.chat_require;
      const require =
        requireRaw === 'followers' || requireRaw === 'subscribers'
          ? requireRaw
          : 'anyone';

      if (require === 'followers') {
        const { data: follow, error: fErr } = await admin
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', stream.creator_id)
          .maybeSingle();

        if (fErr) {
          return NextResponse.json(
            { error: 'Could not verify follow status', code: 'FOLLOW_CHECK' },
            { status: 500 }
          );
        }
        if (!follow) {
          return NextResponse.json(
            {
              error: 'Follow this creator to chat',
              code: 'FOLLOW_REQUIRED',
            },
            { status: 403 }
          );
        }
      }

      if (require === 'subscribers') {
        // Match platform: active sub, or row without status set
        const { data: subs, error: sErr } = await admin
          .from('subscriptions')
          .select('id, status')
          .eq('subscriber_id', user.id)
          .eq('creator_id', stream.creator_id)
          .limit(5);

        if (sErr) {
          return NextResponse.json(
            {
              error: 'Could not verify subscription',
              code: 'SUB_CHECK',
            },
            { status: 500 }
          );
        }

        const ok = (subs || []).some(
          (s: any) =>
            !s.status ||
            s.status === 'active' ||
            s.status === 'trialing'
        );

        if (!ok) {
          return NextResponse.json(
            {
              error: 'Subscribe to chat in this live',
              code: 'SUB_REQUIRED',
            },
            { status: 403 }
          );
        }
      }
    }

    const { data: row, error } = await admin
      .from('live_chat_messages')
      .insert({
        stream_id: streamId,
        user_id: user.id,
        content,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: row });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Chat failed' },
      { status: 500 }
    );
  }
}
