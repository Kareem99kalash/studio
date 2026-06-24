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

    // Batch stores to keep URL manageable (max ~200 stores per request)
    const maxStoresPerBatch = 150;
    const storeBatches = [];
    for (let i = 0; i < stores.length; i += maxStoresPerBatch) {
      storeBatches.push(stores.slice(i, i + maxStoresPerBatch));
    }

    // Collect all distance matrices
    const allDistances: number[][] = [];

    for (const storeBatch of storeBatches) {
      const coords = [
        ...storeBatch.map((s: any) => [s.lng, s.lat]),
        ...polygons.map((p: any) => [p.lng, p.lat])
      ];

      const srcIndices = storeBatch.map((_: any, i: number) => i).join(';');
      const dstIndices = polygons.map((_: any, i: number) => storeBatch.length + i).join(';');

      const coordString = coords
        .map((c: number[]) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
        .join(';');

      const url = `${endpoint}/table/v1/driving/${coordString}?sources=${srcIndices}&destinations=${dstIndices}&annotations=distance`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`OSRM ${response.status}:`, error.substring(0, 200));
        return NextResponse.json(
          { error: `OSRM batch failed: ${response.status}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      if (data.distances) {
        allDistances.push(...data.distances);
      }
    }

    // Recombine: distances should now be [storeIndex][polygonIndex]
    return NextResponse.json({
      code: 'Ok',
      distances: allDistances
    });
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Server error', details: error.message },
      { status: 500 }
    );
  }
}

