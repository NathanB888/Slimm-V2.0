import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function readBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let userId: string;
  let userEmail: string | undefined;

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString());
    userId = body.userId;
    userEmail = body.userEmail;
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const origin = (req.headers.origin as string) || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${origin}/?payment=success`,
      cancel_url: `${origin}/`,
      customer_email: userEmail,
      metadata: { supabase_user_id: userId },
      client_reference_id: userId,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe error:', message);
    return res.status(500).json({ error: message });
  }
}
