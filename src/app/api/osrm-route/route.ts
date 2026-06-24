import { NextRequest, NextResponse } from 'next/server';

const ENDPOINTS = {
  'Iraq': 'https://kareem99k-erbil-osrm-engine.hf.space',
  'Lebanon': 'https://kareem99k-beirut-osrm-engine.hf.space'
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region, start, end } = body;

    if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const endpoint = ENDPOINTS[region as keyof typeof ENDPOINTS];
    const token = process.env.NEXT_PUBLIC_HF_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Missing HF token' }, { status: 500 });
    }

    const coordString = `${start.lng.toFixed(5)},${start.lat.toFixed(5)};${end.lng.toFixed(5)},${end.lat.toFixed(5)}`;
    const url = `${endpoint}/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`OSRM ${response.status}:`, error);
      return NextResponse.json(
        { error: `OSRM returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
