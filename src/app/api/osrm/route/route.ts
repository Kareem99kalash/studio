import { NextRequest, NextResponse } from 'next/server';

const HF_ERBIL = 'https://kareem99k-erbil-osrm-engine.hf.space';
const HF_BEIRUT = 'https://kareem99k-beirut-osrm-engine.hf.space';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region, start, end } = body;

    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start or end coordinates' }, { status: 400 });
    }

    const endpoint = region === 'Lebanon' ? HF_BEIRUT : HF_ERBIL;
    const token = process.env.NEXT_PUBLIC_HF_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Missing HF token' }, { status: 500 });
    }

    const url = `${endpoint}/route/v1/driving`;

    const osrmBody = {
      coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
      overview: 'full',
      geometries: 'geojson'
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(osrmBody)
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('OSRM Route Error:', res.status, error);
      return NextResponse.json(
        { error: `OSRM error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
