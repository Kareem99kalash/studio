import { NextRequest, NextResponse } from 'next/server';

const HF_ERBIL = 'https://kareem99k-erbil-osrm-engine.hf.space';
const HF_BEIRUT = 'https://kareem99k-beirut-osrm-engine.hf.space';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region, coordinates, sources, destinations } = body;

    if (!coordinates || !Array.isArray(coordinates)) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const endpoint = region === 'Lebanon' ? HF_BEIRUT : HF_ERBIL;
    const token = process.env.NEXT_PUBLIC_HF_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Missing HF token' }, { status: 500 });
    }

    // OSRM POST format: send everything in body, empty path
    const url = `${endpoint}/table/v1/driving`;

    const osrmBody = {
      coordinates: coordinates,
      sources: sources,
      destinations: destinations,
      annotations: ['distance']
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
      console.error('OSRM Error:', res.status, error);
      return NextResponse.json(
        { error: `OSRM error: ${res.status}`, details: error },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

