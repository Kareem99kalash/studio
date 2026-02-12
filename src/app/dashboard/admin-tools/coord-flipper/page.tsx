'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, RefreshCw, Upload, FileSpreadsheet, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function CoordinateFlipperPage() {
  const [data, setData] = useState<any[]>([]);
  const [wktCol, setWktCol] = useState('');
  const [cols, setCols] = useState<string[]>([]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setData(res.data);
        setCols(res.meta.fields || []);
        // Auto-detect common names
        const guess = res.meta.fields?.find(f => f.toLowerCase().includes('wkt') || f.toLowerCase().includes('geom'));
        if (guess) setWktCol(guess);
      }
    });
  };

  const flipCoords = () => {
    if (!wktCol) return;
    const flippedData = data.map(row => {
      const wkt = row[wktCol];
      if (typeof wkt === 'string') {
        // 1. Clean the WKT to get just the numbers
        const cleanContent = wkt.replace(/^[A-Z]+\s*\(+/, '').replace(/\)+$/, '');
        
        // 2. Split into pairs
        const pairs = cleanContent.split(',').map((pair: string) => {
            const parts = pair.trim().split(/\s+/);
            // 3. FLIP: Lon Lat -> Lat Lon
            // Assuming input was Lon Lat (WKT standard), we want Lat Lon
            return `${parts[1]} ${parts[0]}`; 
        });
        
        // 4. Join with commas to match requested format: "35.58 45.44,35.58 45.44"
        const finalStr = pairs.join(',');
        
        return { ...row, [wktCol]: finalStr };
      }
      return row;
    });
    setData(flippedData);
  };

  const download = () => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "flipped_coords_clean.csv";
    link.click();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-orange-600"/> Coordinate Flipper
            <Link href="/dashboard/documentation#coord-flipper">
                <HelpCircle className="h-4 w-4 text-slate-300 hover:text-orange-600 transition-colors cursor-help" />
            </Link>
        </h1>
        <p className="text-slate-500">Converts WKT to flipped raw coordinates (Lat Lng,Lat Lng...)</p>
      </div>
      
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center bg-slate-50 relative">
            <input type="file" accept=".csv" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="flex flex-col items-center">
                <Upload className="h-8 w-8 text-orange-500 mb-2" />
                <span className="font-bold text-slate-700">Click to Upload CSV</span>
            </div>
          </div>

          {cols.length > 0 && (
            <div className="flex gap-4 items-end bg-white p-4 rounded border">
                <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">WKT Column</label>
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
