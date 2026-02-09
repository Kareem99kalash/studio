import { NextResponse, NextRequest } from 'next/server';

// 1. Map friendly names to your Environment Variables
const SPACES: Record<string, string | undefined> = {
  'erbil': process.env.HF_SPACE_ID_ROUTING,
  'beirut': process.env.HF_SPACE_ID_AI,
};

const TOKEN = process.env.HF_TOKEN;

export async function GET(request: NextRequest) {
  // 2. Read which server we want to check (e.g., ?target=erbil)
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target') || 'erbil';
  const SPACE_ID = SPACES[target];

  if (!SPACE_ID || !TOKEN) {
    return NextResponse.json({ status: 'CONFIG_ERROR' }, { status: 500 });
  }

  try {
    const response = await fetch(`https://huggingface.co/api/spaces/${SPACE_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store'
    });

    if (!response.ok) throw new Error('HF API Error');
    const data = await response.json();
    return NextResponse.json({ status: data.runtime?.stage || 'UNKNOWN' });

  } catch (error) {
    return NextResponse.json({ status: 'ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json(); // Read body for POST requests
  const target = body.target || 'erbil';
  const SPACE_ID = SPACES[target];

  if (!SPACE_ID) return NextResponse.json({ message: 'Invalid Target' }, { status: 400 });

  try {
    // Construct URL: https://username-space-name.hf.space
    const subdomain = SPACE_ID.replace('/', '-').toLowerCase();
    const url = `https://${subdomain}.hf.space`;

    // Fire "Wake Up" Ping
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    try { await fetch(url, { signal: controller.signal }); } catch (e) { /* Ignore Timeout */ }

    return NextResponse.json({ message: 'Signal Sent' });
  } catch (error) {
    return NextResponse.json({ message: 'Failed' }, { status: 500 });
  }
}
