import { createClient } from './supabase';

const DEFAULT_PREFS: any = {
  sounds_enabled: true,
  message: { enabled: true, sound: 'default' },
  tip: { enabled: true, sound: 'money' },
  follow: { enabled: true, sound: 'soft' },
  subscribe: { enabled: true, sound: 'money' },
  like: { enabled: true, sound: 'soft' },
  comment: { enabled: true, sound: 'soft' },
  unlock: { enabled: true, sound: 'money' },
  live: { enabled: true, sound: 'alert' },
};

export function playNotificationSound(sound: string) {
  if (!sound || sound === 'off' || typeof window === 'undefined') return;

  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    const beep = (freq: number, start: number, duration: number, volume = 0.15) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(volume, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.start(now + start);
      osc.stop(now + start + duration);
    };

    if (sound === 'soft') {
      beep(520, 0, 0.18, 0.08);
    } else if (sound === 'alert') {
      beep(880, 0, 0.12, 0.18);
      beep(1100, 0.14, 0.12, 0.16);
    } else if (sound === 'money') {
      beep(660, 0, 0.1, 0.14);
      beep(880, 0.12, 0.15, 0.16);
    } else {
      beep(740, 0, 0.15, 0.14);
    }
  } catch (e) {
    console.error('Sound error', e);
  }
}

export async function createNotification(opts: {
  userId: string;
  actorId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string;
}) {
  const { userId, actorId, type, title, body = null, link = '/notifications' } = opts;

  if (!userId || !actorId || userId === actorId) return;

  const supabase = createClient();

  // Check recipient preferences
  const { data: profile } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .single();

  const prefs = { ...DEFAULT_PREFS, ...(profile?.notification_prefs || {}) };
  const typePref = prefs[type] || { enabled: true, sound: 'default' };

  // User turned this type off
  if (typePref.enabled === false) return;

  await supabase.from('notifications').insert({
    user_id: userId,
    actor_id: actorId,
    type,
    title,
    body,
    link,
  });
}

export function getSoundForType(prefs: any, type: string): string {
  if (!prefs || prefs.sounds_enabled === false) return 'off';
  return prefs[type]?.sound || 'default';
}