// Push notifications through Expo's push service.

export async function sendPush(token: string | null | undefined, title: string, body: string, data: Record<string, unknown>) {
  if (!token) return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
    });
    if (!res.ok) console.error('push failed', res.status, await res.text());
  } catch (e) {
    // A missed notification must never fail the pipeline.
    console.error('push failed', e);
  }
}
