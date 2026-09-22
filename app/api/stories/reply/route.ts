import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Any logged-in account type can reply to a live story. */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = adminClient();
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const storyId = String(body.story_id || '');
    const text = String(body.text || '').trim().slice(0, 200);
    if (!storyId || !text) {
      return NextResponse.json({ error: 'story_id and text required' }, { status: 400 });
    }

    const { data: story } = await admin
      .from('stories')
      .select('id, creator_id, expires_at')
      .eq('id', storyId)
      .maybeSingle();
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    if (new Date(story.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Story expired' }, { status: 410 });
    }
    if (story.creator_id === user.id) {
      return NextResponse.json({ error: 'Cannot reply to your own story' }, { status: 400 });
    }

    const { data: blocked } = await admin
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${story.creator_id}),and(blocker_id.eq.${story.creator_id},blocked_id.eq.${user.id})`
      )
      .limit(1);
    if (blocked && blocked.length) {
      return NextResponse.json({ error: 'Cannot reply' }, { status: 403 });
    }

    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${user.id},participant_2.eq.${story.creator_id}),and(participant_1.eq.${story.creator_id},participant_2.eq.${user.id})`
      )
      .maybeSingle();

    let convoId = existing?.id as string | undefined;
    if (!convoId) {
      const { data: created, error: cErr } = await admin
        .from('conversations')
        .insert({
          participant_1: user.id,
          participant_2: story.creator_id,
        })
        .select('id')
        .single();
      if (cErr || !created) {
        return NextResponse.json(
          { error: cErr?.message || 'Could not start chat' },
          { status: 500 }
        );
      }
      convoId = created.id;
    }

    const content = `Replied to your story: ${text}`.slice(0, 300);
    const { error: mErr } = await admin.from('messages').insert({
      conversation_id: convoId,
      sender_id: user.id,
      content,
    });
    if (mErr) {
      return NextResponse.json({ error: mErr.message || 'Could not send' }, { status: 500 });
    }

    await admin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', convoId);

    await admin.from('notifications').insert({
      user_id: story.creator_id,
      actor_id: user.id,
      type: 'message',
      title: 'Replied to your story',
      body: text.slice(0, 80),
      link: `/messages/${convoId}`,
    });

    return NextResponse.json({ ok: true, conversation_id: convoId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Reply failed' }, { status: 500 });
  }
}
