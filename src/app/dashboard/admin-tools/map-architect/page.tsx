'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Download, FileCode, Layers, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; 
import dynamic from 'next/dynamic';

// 1. Dynamic Import (No changes here, just cleaner loading state)
const StudioMap = dynamic(
  () => import('@/components/map-architect/drawing-interface').then(m => m.DrawingInterface), 
  { 
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-50 flex flex-col items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mb-4" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading GIS Engine...</p>
      </div>
    )
  }
);

export default function GeoStudioPro() {
  const { toast } = useToast();
  // 2. We ONLY need to track the GeoJSON data now. No more 'aiEnabled' state here.
  const [activeGeoJSON, setActiveGeoJSON] = useState<any>({ type: "FeatureCollection", features: [] });

  // 3. Robust WKT Generator
  const toWKT = (geometry: any) => {
    if (!geometry || geometry.type !== 'Polygon') return 'EMPTY';
    const coords = geometry.coordinates[0].map((c: any) => `${c[0]} ${c[1]}`).join(', ');
    return `POLYGON ((${coords}))`;
  };

  const exportCSV = () => {
    if (activeGeoJSON.features.length === 0) return;
    
    const headers = ['NAME', 'WKT_GEOMETRY', 'MODE', 'TIMESTAMP'];
    const rows = activeGeoJSON.features.map((f: any) => [
      `"${f.properties.name}"`, 
      `"${toWKT(f.geometry)}"`, 
      f.properties.mode || 'MANUAL',
      f.properties.timestamp || new Date().toISOString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `GEOPRO_WKT_EXPORT_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "Export Successful", description: "WKT Geometry ready for upload." });
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-4 p-2 bg-slate-50">
      {/* 🚀 HEADER: Removed the dead 'AI Toggle' button */}
      <div className="flex items-center justify-between bg-slate-950 p-4 rounded-[2rem] text-white shadow-2xl border border-white/5">
        <div className="flex items-center gap-4">
          <div className="bg-purple-600 p-3 rounded-2xl shadow-lg border border-purple-400/20">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter leading-none">Architect Studio</h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1">Spatial Intelligence v3.0</p>
          </div>
        </div>

        {/* Only the Export action remains here. Drawing controls are now ON THE MAP. */}
        <Button 
          onClick={exportCSV} 
          className="bg-white text-slate-900 hover:bg-slate-200 font-black px-10 h-11 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95"
          disabled={activeGeoJSON.features.length === 0}
        >
          <Download className="h-4 w-4 mr-2" /> Download WKT
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
        {/* 📊 LIVE INSPECTOR: Updated to match new 'AI_ASSISTED' tags */}
        <Card className="col-span-3 border-none shadow-xl rounded-[2rem] flex flex-col bg-white overflow-hidden">
          <CardHeader className="bg-slate-50 border-b py-5 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Workspace</CardTitle>
            </div>
            <Badge className="bg-slate-900 text-[10px] font-black rounded-lg">{activeGeoJSON.features.length}</Badge>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto scrollbar-hide">
            {activeGeoJSON.features.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                    <FileCode className="h-12 w-12 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Polygons</p>
                </div>
            ) : (
                activeGeoJSON.features.map((f: any, i: number) => (
                    <div key={i} className="p-5 border-b hover:bg-slate-50/50 transition-all cursor-default group">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{f.properties.name}</span>
                        {/* Dynamic Badges based on the new Engine modes */}
                        <Badge 
                           className={`text-[8px] font-black border-none rounded-md px-2 py-0.5 ${
                             f.properties.mode === 'AI_ASSISTED' ? 'bg-purple-100 text-purple-600' : 
                             f.properties.mode === 'MANUAL' ? 'bg-slate-100 text-slate-400' :
                             'bg-blue-100 text-blue-600'
                           }`}
                        >
                          {f.properties.mode}
                        </Badge>
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 truncate bg-slate-100 p-2 rounded-lg border border-slate-200 group-hover:border-purple-200 group-hover:bg-purple-50/30 transition-colors">
                        {toWKT(f.geometry)}
                      </div>
                    </div>
                  ))
            )}
          </CardContent>
        </Card>

        {/* 🗺️ MAP CONTAINER */}
        <div className="col-span-9 rounded-[3rem] border-[10px] border-white bg-white overflow-hidden shadow-2xl relative ring-1 ring-slate-200">
          {/* Note: We no longer pass aiEnabled prop */}
          <StudioMap geojson={activeGeoJSON} onChange={setActiveGeoJSON} />
        </div>
      </div>
    </div>
  );
}
