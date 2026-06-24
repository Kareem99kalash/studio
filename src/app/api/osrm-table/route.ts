import { NextRequest, NextResponse } from 'next/server';

const ENDPOINTS = {
  'Iraq': 'https://kareem99k-erbil-osrm-engine.hf.space',
  'Lebanon': 'https://kareem99k-beirut-osrm-engine.hf.space'
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region, stores, polygons } = body;

    if (!stores?.length || !polygons?.length) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const endpoint = ENDPOINTS[region as keyof typeof ENDPOINTS];
    const token = process.env.NEXT_PUBLIC_HF_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Missing HF token' }, { status: 500 });
    }

    // Batch stores more aggressively for large datasets
    const maxStoresPerBatch = 100;
    const allDistances: number[][] = [];

    for (let storeOffset = 0; storeOffset < stores.length; storeOffset += maxStoresPerBatch) {
      const storeBatch = stores.slice(storeOffset, storeOffset + maxStoresPerBatch);

      const coords = [
        ...storeBatch.map((s: any) => [s.lng, s.lat]),
        ...polygons.map((p: any) => [p.lng, p.lat])
      ];

      const srcIndices = Array.from({ length: storeBatch.length }, (_, i) => i).join(';');
      const dstIndices = Array.from({ length: polygons.length }, (_, i) => storeBatch.length + i).join(';');

      const coordString = coords
        .map((c: number[]) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
        .join(';');

      const url = `${endpoint}/table/v1/driving/${coordString}?sources=${srcIndices}&destinations=${dstIndices}&annotations=distance`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Batch at offset ${storeOffset}: ${response.status}`);
        return NextResponse.json(
          { error: `OSRM: ${response.status}`, offset: storeOffset },
          { status: response.status }
        );
      }

      const data = await response.json();
      if (data.distances?.length) {
        allDistances.push(...data.distances);
      }
    }

    return NextResponse.json({
      code: 'Ok',
      distances: allDistances
    });
  } catch (error: any) {
    console.error('API error:', error.message);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

