'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  MapPin,
  Download,
  Play,
  StopCircle,
  Search,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateScrapeGrid, scrapeTile, ScrapedBusiness } from '@/app/actions/scrape-data';

// Dynamically import Map with no SSR
const ScraperMap = dynamic(() => import('@/components/dashboard/scraper-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">Loading Map Engine...</div>
});

const BUSINESS_TYPES = [
  { id: 'amenity=restaurant', label: 'Restaurants' },
  { id: 'amenity=cafe', label: 'Cafes' },
  { id: 'amenity=fast_food', label: 'Fast Food' },
  { id: 'amenity=bar', label: 'Bars' },
  { id: 'shop=supermarket', label: 'Supermarkets' },
  { id: 'shop=convenience', label: 'Convenience Stores' },
  { id: 'shop=clothes', label: 'Clothing Stores' },
  { id: 'shop=*', label: 'All Shops (Generic)' },
  { id: 'tourism=hotel', label: 'Hotels' },
];

export default function DataScraperPage() {
  const { toast } = useToast();

  // --- STATE ---
  const [center, setCenter] = useState<[number, number]>([51.505, -0.09]); // Default: London
  const [radius, setRadius] = useState<number>(1000); // 1km
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['amenity=restaurant']);

  const [isScraping, setIsScraping] = useState(false);
  const [stopSignal, setStopSignal] = useState(false);

  const [gridTiles, setGridTiles] = useState<number[][]>([]);
  const [processedTilesCount, setProcessedTilesCount] = useState(0);

  const [results, setResults] = useState<ScrapedBusiness[]>([]);

  // To prevent multiple rapid state updates from freezing UI, we might buffer results?
  // For now, direct updates are fine for < 1000 items.

  const stopRef = useRef(false);

  // --- HANDLERS ---

  const handleCenterChange = (lat: number, lng: number) => {
    setCenter([lat, lng]);
  };

  const toggleType = (typeId: string) => {
    setSelectedTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  const handleStartScraping = async () => {
    if (selectedTypes.length === 0) {
        toast({ variant: "destructive", title: "Selection Required", description: "Please select at least one business type." });
        return;
    }

    setIsScraping(true);
    setStopSignal(false);
    stopRef.current = false;
    setResults([]);
    setProcessedTilesCount(0);

    try {
        // 1. Generate Grid
        toast({ title: "Initializing", description: "Generating search grid..." });
        const gridRes = await generateScrapeGrid(center[0], center[1], radius);

        if (!gridRes.success || !gridRes.tiles) {
            throw new Error(gridRes.error || "Failed to generate grid");
        }

        setGridTiles(gridRes.tiles);
        const totalTiles = gridRes.tiles.length;

        toast({ title: "Grid Ready", description: `Starting scrape for ${totalTiles} tiles covering ${gridRes.totalAreaKm2} km²` });

        // 2. Process Tiles
        const uniqueResults = new Map<string, ScrapedBusiness>();

        // Batch processing (2 at a time) to respect client-side concurrency
        const BATCH_SIZE = 2;

        for (let i = 0; i < totalTiles; i += BATCH_SIZE) {
            if (stopRef.current) break;

            const batch = gridRes.tiles.slice(i, i + BATCH_SIZE);
            const promises = batch.map(tileBbox => scrapeTile(tileBbox, selectedTypes));

            const batchResults = await Promise.all(promises);

            // Flatten and add to results
            let newItemsCount = 0;
            batchResults.flat().forEach(item => {
                if (!uniqueResults.has(item.id)) {
                    uniqueResults.set(item.id, item);
                    newItemsCount++;
                }
            });

            setResults(Array.from(uniqueResults.values()));
            setProcessedTilesCount(prev => Math.min(prev + batch.length, totalTiles));

            // Small delay to be polite
            await new Promise(r => setTimeout(r, 200));
        }

        if (stopRef.current) {
            toast({ title: "Stopped", description: `Scraping stopped. Found ${uniqueResults.size} businesses.` });
        } else {
            toast({ title: "Complete", description: `Scraping finished. Found ${uniqueResults.size} businesses.` });
        }

    } catch (error) {
        console.error(error);
        toast({ variant: "destructive", title: "Error", description: "Scraping failed." });
    } finally {
        setIsScraping(false);
        stopRef.current = false;
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    setStopSignal(true);
  };

  const handleExport = () => {
    if (results.length === 0) return;

    // Convert to CSV
    const headers = ["ID", "Name", "Type", "Address", "City", "Phone", "Website", "Latitude", "Longitude", "Opening Hours"];
    const csvContent = [
        headers.join(','),
        ...results.map(r => [
            r.id,
            `"${r.name.replace(/"/g, '""')}"`,
            r.type,
            `"${(r.address || '').replace(/"/g, '""')}"`,
            r.city || '',
            r.phone || '',
            r.website || '',
            r.lat,
            r.lng,
            `"${(r.opening_hours || '').replace(/"/g, '""')}"`
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `scraped_data_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progressPercent = gridTiles.length > 0 ? (processedTilesCount / gridTiles.length) * 100 : 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
        {/* HEADER */}
        <div className="h-16 bg-white border-b px-6 flex items-center justify-between shrink-0 z-20 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg"><Search className="h-5 w-5 text-white" /></div>
                <h1 className="font-bold text-lg text-slate-800">OpenStreetMap Data Scraper</h1>
                <Badge variant="secondary" className="text-xs font-mono">Free Tier</Badge>
            </div>
            <div className="flex items-center gap-3">
                {results.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                        <Download className="h-4 w-4" /> Export CSV ({results.length})
                    </Button>
                )}
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            {/* LEFT SIDEBAR: CONTROLS */}
            <div className="w-80 bg-white border-r flex flex-col shrink-0 z-10 shadow-xl shadow-slate-200/50">
                <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

                    {/* 1. LOCATION */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wide">
                            <MapPin className="h-4 w-4 text-indigo-500" /> Target Area
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border space-y-3">
                            <div>
                                <Label className="text-xs text-slate-500 font-bold uppercase">Center Point</Label>
                                <div className="text-xs font-mono text-slate-700 bg-white p-2 rounded border mt-1">
                                    {center[0].toFixed(5)}, {center[1].toFixed(5)}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Drag the marker on the map to move.</p>
                            </div>

                            <div>
                                <Label className="text-xs text-slate-500 font-bold uppercase flex justify-between">
                                    Radius
                                    <span className="text-indigo-600">{(radius / 1000).toFixed(1)} km</span>
                                </Label>
                                <Slider
                                    value={[radius]}
                                    min={100}
                                    max={20000}
                                    step={100}
                                    onValueChange={(v) => setRadius(v[0])}
                                    className="mt-2"
                                    disabled={isScraping}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 2. FILTERS */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wide">
                            <Filter className="h-4 w-4 text-indigo-500" /> Business Types
                        </div>
                        <div className="grid grid-cols-1 gap-2 p-1">
                            {BUSINESS_TYPES.map(type => (
                                <div key={type.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={type.id}
                                        checked={selectedTypes.includes(type.id)}
                                        onCheckedChange={() => toggleType(type.id)}
                                        disabled={isScraping}
                                    />
                                    <label htmlFor={type.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                                        {type.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. STATUS */}
                    {isScraping && (
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between text-xs font-bold text-indigo-900 uppercase">
                                <span>Progress</span>
                                <span>{Math.round(progressPercent)}%</span>
                            </div>
                            <Progress value={progressPercent} className="h-2 bg-indigo-200" />
                            <div className="flex justify-between text-[10px] text-indigo-600 font-medium">
                                <span>{processedTilesCount} / {gridTiles.length} Tiles</span>
                                <span>{results.length} Found</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-slate-50">
                    {!isScraping ? (
                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-bold" onClick={handleStartScraping}>
                            <Play className="mr-2 h-4 w-4" /> Start Scraping
                        </Button>
                    ) : (
                        <Button variant="destructive" className="w-full shadow-lg shadow-red-200 font-bold" onClick={handleStop}>
                            <StopCircle className="mr-2 h-4 w-4" /> Stop Operation
                        </Button>
                    )}
                </div>
            </div>

            {/* MAIN CONTENT: MAP & GRID */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* TOP: MAP (60%) */}
                <div className="flex-[3] relative border-b border-slate-200 shadow-inner bg-slate-100">
                    <ScraperMap
                        center={center}
                        radius={radius}
                        onCenterChange={handleCenterChange}
                        results={results}
                        gridTiles={gridTiles}
                        processedCount={processedTilesCount}
                    />
                </div>

                {/* BOTTOM: DATA GRID (40%) */}
                <div className="flex-[2] bg-white flex flex-col min-h-0">
                    <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between shrink-0">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Scraped Data ({results.length})
                        </h3>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-[200px]">Name</TableHead>
                                    <TableHead className="w-[100px]">Type</TableHead>
                                    <TableHead className="w-[200px]">Address</TableHead>
                                    <TableHead className="w-[100px]">City</TableHead>
                                    <TableHead className="w-[120px]">Phone</TableHead>
                                    <TableHead className="w-[150px]">Website</TableHead>
                                    <TableHead className="w-[100px]">Hours</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-slate-400 italic">
                                            No data scraped yet. Configure the area and click Start.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    results.map((r) => (
                                        <TableRow key={r.id} className="hover:bg-slate-50 text-xs">
                                            <TableCell className="font-medium">{r.name}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[10px] font-normal">{r.type}</Badge></TableCell>
                                            <TableCell className="truncate max-w-[200px]" title={r.address}>{r.address || '-'}</TableCell>
                                            <TableCell>{r.city || '-'}</TableCell>
                                            <TableCell>{r.phone || '-'}</TableCell>
                                            <TableCell>{r.website ? <a href={r.website} target="_blank" className="text-blue-500 hover:underline">Link</a> : '-'}</TableCell>
                                            <TableCell className="truncate max-w-[150px]" title={r.opening_hours}>{r.opening_hours || '-'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
