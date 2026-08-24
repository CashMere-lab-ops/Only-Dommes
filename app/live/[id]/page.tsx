import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import LiveRoom from './LiveRoom';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }> | { id: string };
};

async function getPreview(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const sb = createClient(url, key);
  const { data: stream } = await sb
    .from('live_streams')
    .select('id, title, status, thumbnail_url, creator_id')
    .eq('id', id)
    .maybeSingle();
  if (!stream) return null;

  const { data: creator } = await sb
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', stream.creator_id)
    .maybeSingle();

  return { stream, creator };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await Promise.resolve(params);
  const preview = await getPreview(id);

  const name =
    preview?.creator?.display_name ||
    (preview?.creator?.username
      ? `@${preview.creator.username}`
      : 'Creator');

  const title = `${name} is live right now`;
  const description = `Come join me on World of Dommes · 18+`;

  const image =
    preview?.creator?.avatar_url ||
    preview?.stream?.thumbnail_url ||
    'https://www.worldofdommes.com/favicon.ico';

  const pageUrl = `https://www.worldofdommes.com/live/${id}`;

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'World Of Dommes',
      type: 'website',
      images: [{ url: image, width: 400, height: 400, alt: name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function LivePage({ params }: Props) {
  const { id } = await Promise.resolve(params);
  return <LiveRoom streamId={id} />;
}