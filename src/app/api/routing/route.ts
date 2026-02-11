import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

// Initialize Rate Limiter
// Limit: 20 requests per minute per IP to prevent abuse
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500, // Max 500 unique IPs per second
});

export async function POST(req: NextRequest) {
  // 1. Rate Limiting Logic (IP Based)
  // In production (Vercel), 'x-forwarded-for' gives the real user IP
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const { isRateLimited, headers } = limiter.check(new Response(), 20, ip);

  if (isRateLimited) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment.' },
      { status: 429, headers }
    );
  }

  try {
    const body = await req.json();
    const { coordinates, engineUrl } = body;

    if (!coordinates || !engineUrl) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 2. Security Check: Validate Engine URL (SSRF Protection)
    // Only allow connections to known, safe domains
    const ALLOWED_DOMAINS = [
      'router.project-osrm.org',
      'kareem99k-erbil-osrm-engine.hf.space',
      'kareem99k-beirut-osrm-engine.hf.space'
    ];
    
    let urlObj;
    try {
        urlObj = new URL(engineUrl);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    if (!ALLOWED_DOMAINS.includes(urlObj.hostname)) {
       return NextResponse.json({ error: 'Unauthorized routing engine' }, { status: 403 });
    }

    // 3. Construct the Request to the Real Engine
    // "sources=0" means the first coordinate is the start, others are destinations
    const targetUrl = `${engineUrl}/table/v1/driving/${coordinates}?sources=0&annotations=distance`;

    const fetchOptions: RequestInit = {
       method: 'GET',
       headers: {
           'Content-Type': 'application/json',
       }
    };

    // 4. Securely Inject the Token (Server-Side Only)
    // We ONLY send the token if the target is your private Hugging Face space
    if (engineUrl.includes('hf.space')) {
        const token = process.env.HF_TOKEN; // Read from server env
        
        if (!token) {
            console.error("Server Configuration Error: HF_TOKEN is missing in .env.local");
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
        
        // Add the Bearer token header
        fetchOptions.headers = {
            ...fetchOptions.headers,
            'Authorization': `Bearer ${token}`
        };
    }

    // 5. Execute Request
    const response = await fetch(targetUrl, fetchOptions);
    
    if (!response.ok) {
        // Log the actual error from the engine for debugging
        const errorText = await response.text();
        console.error(`OSRM Engine Error (${response.status}):`, errorText);
        throw new Error(`Engine responded with ${response.status}`);
    }

    const data = await response.json();
    
    // Return the clean data to the frontend
    return NextResponse.json(data, { status: 200, headers });

  } catch (error: any) {
    console.error("Routing Proxy Error:", error.message);
    return NextResponse.json(
        { error: 'Failed to calculate routes', details: error.message }, 
        { status: 500 }
    );
  }
}
