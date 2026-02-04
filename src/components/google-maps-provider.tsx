'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import type { ReactNode } from 'react';

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <div className="text-center">
          <p className="mb-2 font-semibold">Google Maps API Key is missing.</p>
          <p className="text-sm text-muted-foreground">
            Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.
          </p>
        </div>
      </div>
    );
  }

  return <APIProvider apiKey={apiKey}>{children}</APIProvider>;
}
