'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, RefreshCw, Upload, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function CoordinateFlipperPage() {
  const [data, setData] = useState<any[]>([]);
  const [wktCol, setWktCol] = useState('');
  const [cols, setCols] = useState<string[]>([]);
  const [nameCol, setNameCol] = useState('name');

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setData(res.data);
        const fields = res.meta.fields || [];
        setCols(fields);
        
        // Auto-detect columns
        const guessWkt = fields.find(f => f.toLowerCase().includes('wkt') || f.toLowerCase().includes('geom'));
        if (guessWkt) setWktCol(guessWkt);

        const guessName = fields.find(f => f.toLowerCase().includes('name') || f.toLowerCase().includes('zone') || f.toLowerCase().includes('title'));
        if (guessName) setNameCol(guessName);
      }
    });
  };

  const flipAndCleanWKT = (wktString: string) => {
    if (!wktString || typeof wktString !== 'string') return '';
    
    // 1. Remove POLYGON ((, MULTIPOLYGON (((, and trailing parens
    let clean = wktString
      .replace(/^[A-Z]+\s*\(+/i, '')
      .replace(/\)+$/, '')
      .trim();

    // 2. Split into coordinate pairs by comma
    const pairs = clean.split(',').map(item => item.trim());

    // 3. Swap X Y (Lng Lat) -> Y X (Lat Lng)
    const flippedPairs = pairs.map(pair => {
      const parts = pair.split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[1]} ${parts[0]}`;
      }
      return pair;
    });

    // 4. Return space/comma separated raw coordinates
    return flippedPairs.join(', ');
  };

  const flipCoords = () => {
    if (!wktCol) return;

    // Build fresh array containing ONLY 'name' and flipped 'coordinates'
    const cleanedData = data.map(row => {
      const rawWkt = row[wktCol] || '';
      const zoneName = row[nameCol] || row['name'] || '';

      return {
        name: zoneName,
        coordinates: flipAndCleanWKT(rawWkt)
      };
    });

    setData(cleanedData);
  };

  const download = () => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "flipped_coords_clean.csv";
    link.click();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-orange-600"/> Coordinate Flipper
            <Link href="/dashboard/documentation#coord-flipper">
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-orange-600 transition-colors cursor-help" />
            </Link>
        </h1>
        <p className="text-muted-foreground">Converts WKT to flipped raw coordinates (Lat Lng, Lat Lng...)</p>
      </div>
      
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center bg-muted relative">
            <input type="file" accept=".csv" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="flex flex-col items-center">
                <Upload className="h-8 w-8 text-orange-500 mb-2" />
                <span className="font-bold text-foreground">Click to Upload CSV</span>
            </div>
          </div>

          {cols.length > 0 && (
            <div className="flex gap-4 items-end bg-card p-4 rounded border">
                <div className="flex-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase">WKT Column</label>
                    <select className="w-full p-2 border rounded" value={wktCol} onChange={e => setWktCol(e.target.value)}>
                        {cols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <Button onClick={flipCoords} className="bg-orange-600 hover:bg-orange-700">Run Flip</Button>
            </div>
          )}

          {data.length > 0 && (
             <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-sm font-medium">{data.length} rows ready</span>
                <Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4"/> Download Fixed CSV</Button>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
