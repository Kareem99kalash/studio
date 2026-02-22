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
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  X
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useToast } from '@/hooks/use-toast';
import { generateScrapeGrid, scrapeTile, ScrapedBusiness, ScrapeTileResult } from '@/app/actions/scrape-data';

// Dynamically import Map with no SSR
const ScraperMap = dynamic(() => import('@/components/dashboard/scraper-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">Loading Map Engine...</div>
});

const BUSINESS_CATEGORIES = [
    {
        name: "Broad Search",
        options: [
            { id: 'generic', label: '⚡ BROAD SEARCH (Everything)' }
        ]
    },
    {
        name: "Food & Drink",
        options: [
            { id: 'amenity=restaurant', label: 'Restaurants' },
            { id: 'amenity=cafe', label: 'Cafes' },
            { id: 'amenity=fast_food', label: 'Fast Food' },
            { id: 'amenity=bar', label: 'Bars' },
            { id: 'amenity=pub', label: 'Pubs' },
            { id: 'amenity=ice_cream', label: 'Ice Cream' },
            { id: 'amenity=biergarten', label: 'Biergarten' },
            { id: 'amenity=food_court', label: 'Food Court' },
            { id: 'shop=bakery', label: 'Bakeries' },
        ]
    },
    {
        name: "Shopping",
        options: [
            { id: 'shop=supermarket', label: 'Supermarkets' },
            { id: 'shop=convenience', label: 'Convenience Stores' },
            { id: 'shop=mall', label: 'Shopping Malls' },
            { id: 'shop=department_store', label: 'Department Stores' },
            { id: 'shop=clothes', label: 'Clothing' },
            { id: 'shop=shoes', label: 'Shoes' },
            { id: 'shop=electronics', label: 'Electronics' },
            { id: 'shop=jewelry', label: 'Jewelry' },
            { id: 'shop=*', label: 'All Shops (Generic)' },
        ]
    },
    {
        name: "Health",
        options: [
            { id: 'amenity=pharmacy', label: 'Pharmacies' },
            { id: 'amenity=hospital', label: 'Hospitals' },
            { id: 'amenity=clinic', label: 'Clinics' },
            { id: 'amenity=dentist', label: 'Dentists' },
            { id: 'amenity=doctors', label: 'Doctors' },
        ]
    },
    {
        name: "Services",
        options: [
            { id: 'amenity=bank', label: 'Banks' },
            { id: 'amenity=atm', label: 'ATMs' },
            { id: 'amenity=post_office', label: 'Post Offices' },
            { id: 'craft=*', label: 'Crafts (Plumber, Electrician)' },
            { id: 'office=*', label: 'Offices (Corporate, Gov)' },
        ]
    },
    {
        name: "Tourism & Leisure",
        options: [
            { id: 'tourism=hotel', label: 'Hotels' },
            { id: 'tourism=hostel', label: 'Hostels' },
            { id: 'tourism=museum', label: 'Museums' },
            { id: 'leisure=fitness_centre', label: 'Gyms' },
            { id: 'leisure=park', label: 'Parks' },
            { id: 'leisure=*', label: 'All Leisure' },
            { id: 'tourism=*', label: 'All Tourism' },
        ]
    }
];

// Tile Status
export type TileStatus = 'pending' | 'loading' | 'success' | 'empty' | 'error' | 'retrying';

function CategorySelector({ selected, onChange, disabled }: { selected: string[], onChange: (s: string[]) => void, disabled: boolean }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [open, setOpen] = useState(false);

    const toggle = (id: string) => {
        if (selected.includes(id)) onChange(selected.filter(s => s !== id));
        else onChange([...selected, id]);
    };

    const count = selected.length;
    const allOptions = BUSINESS_CATEGORIES.flatMap(c => c.options);

    const filteredCategories = BUSINESS_CATEGORIES.map(cat => ({
        ...cat,
        options: cat.options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    })).filter(cat => cat.options.length > 0);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between" disabled={disabled}>
                    {count === 0 ? "Select types..." : count === 1 ? allOptions.find(o => o.id === selected[0])?.label : `${count} types selected`}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <div className="p-2 border-b">
                    <Input
                        placeholder="Search categories..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 text-xs"
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto p-2 space-y-4">
                    {filteredCategories.length === 0 && <div className="text-xs text-center py-4 text-slate-400">No categories found.</div>}
                    {filteredCategories.map((category) => (
                        <div key={category.name}>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider px-2">{category.name}</h4>
                            <div className="space-y-1">
                                {category.options.map((opt) => (
                                    <div
                                        key={opt.id}
                                        className="flex items-center space-x-2 px-2 py-1.5 hover:bg-slate-100 rounded-md cursor-pointer transition-colors"
                                        onClick={() => toggle(opt.id)}
                                    >
                                        <Checkbox
                                            id={`cat-${opt.id}`}
                                            checked={selected.includes(opt.id)}
                                            onCheckedChange={() => toggle(opt.id)}
                                        />
                                        <label htmlFor={`cat-${opt.id}`} className="text-xs font-medium leading-none cursor-pointer flex-1">
                                            {opt.label}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-2 border-t bg-slate-50 flex justify-between">
                     <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onChange([])}>Clear All</Button>
                     <Button variant="default" size="sm" className="h-6 text-[10px]" onClick={() => setOpen(false)}>Done</Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default function DataScraperPage() {
  const { toast } = useToast();

  // --- STATE ---
  const [center, setCenter] = useState<[number, number]>([33.5138, 36.2765]); // Default: Damascus
  const [radius, setRadius] = useState<number>(1000); // 1km
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['generic']);

  const [isScraping, setIsScraping] = useState(false);
  const [stopSignal, setStopSignal] = useState(false);

  const [gridTiles, setGridTiles] = useState<number[][]>([]);
  const [tileStatuses, setTileStatuses] = useState<TileStatus[]>([]);

  const [processedTilesCount, setProcessedTilesCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const [results, setResults] = useState<ScrapedBusiness[]>([]);

  const stopRef = useRef(false);

  // --- HANDLERS ---

  const handleCenterChange = (lat: number, lng: number) => {
    setCenter([lat, lng]);
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    setErrorCount(0);

    try {
        // 1. Generate Grid
        toast({ title: "Initializing", description: "Generating search grid..." });
        const gridRes = await generateScrapeGrid(center[0], center[1], radius);

        if (!gridRes.success || !gridRes.tiles) {
            throw new Error(gridRes.error || "Failed to generate grid");
        }

        setGridTiles(gridRes.tiles);
        setTileStatuses(new Array(gridRes.tiles.length).fill('pending'));

        const totalTiles = gridRes.tiles.length;
        toast({ title: "Grid Ready", description: `Queued ${totalTiles} tiles covering ${gridRes.totalAreaKm2} km²` });

        const uniqueResults = new Map<string, ScrapedBusiness>();

        // 2. Sequential Processing with Retry Logic
        for (let i = 0; i < totalTiles; i++) {
            if (stopRef.current) break;

            const tileBbox = gridRes.tiles[i];

            // Mark as loading
            setTileStatuses(prev => {
                const n = [...prev];
                n[i] = 'loading';
                return n;
            });

            let attempts = 0;
            let success = false;
            let finalStatus: TileStatus = 'error';

            while (attempts < 3 && !success && !stopRef.current) {
                attempts++;

                // If retrying, show that state
                if (attempts > 1) {
                    setTileStatuses(prev => {
                        const n = [...prev];
                        n[i] = 'retrying';
                        return n;
                    });
                    const backoff = 5000 * Math.pow(2, attempts - 1);
                    await wait(backoff);
                }

                try {
                    const res: ScrapeTileResult = await scrapeTile(tileBbox, selectedTypes, i);

                    if (res.success) {
                        success = true;
                        finalStatus = res.data.length > 0 ? 'success' : 'empty';

                        // Add results
                        res.data.forEach(item => {
                            if (!uniqueResults.has(item.id)) {
                                uniqueResults.set(item.id, item);
                            }
                        });
                        setResults(Array.from(uniqueResults.values()));

                    } else if (res.status === 429 || res.status === 504) {
                        console.warn(`Tile ${i}: ${res.error}. Retrying...`);
                    } else {
                        console.error(`Tile ${i}: Fatal Error ${res.status}`);
                        break;
                    }
                } catch (e) {
                    console.error("Network/Client Error", e);
                }
            }

            // Update Final Status
            setTileStatuses(prev => {
                const n = [...prev];
                n[i] = finalStatus;
                return n;
            });

            if (!success) setErrorCount(prev => prev + 1);
            setProcessedTilesCount(prev => prev + 1);

            // Polite delay between successful requests
            await wait(1500);
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
    const headers = ["ID", "Name", "Type", "Address", "City", "Phone", "Website", "Latitude", "Longitude", "Last Updated", "Opening Hours"];
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
            r.last_updated ? new Date(r.last_updated).toISOString().split('T')[0] : '', // YYYY-MM-DD
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
                        <div className="p-1">
                           <CategorySelector
                                selected={selectedTypes}
                                onChange={setSelectedTypes}
                                disabled={isScraping}
                           />
                           {selectedTypes.length > 0 && (
                               <div className="mt-2 flex flex-wrap gap-1">
                                   {selectedTypes.slice(0, 5).map(id => (
                                       <Badge key={id} variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                           {id === 'generic' ? 'Broad Search' : id.split('=')[1] || id}
                                       </Badge>
                                   ))}
                                   {selectedTypes.length > 5 && <span className="text-[10px] text-slate-400">+{selectedTypes.length - 5} more</span>}
                               </div>
                           )}
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
                                {errorCount > 0 && <span className="text-red-500">{errorCount} Failed</span>}
                            </div>
                            <div className="flex items-center gap-1.5 justify-center pt-2">
                                <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                                <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">Processing Grid...</span>
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
                        tileStatuses={tileStatuses}
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
                                    <TableHead className="w-[180px]">Name</TableHead>
                                    <TableHead className="w-[100px]">Type</TableHead>
                                    <TableHead className="w-[180px]">Address</TableHead>
                                    <TableHead className="w-[100px]">City</TableHead>
                                    <TableHead className="w-[120px]">Coordinates</TableHead>
                                    <TableHead className="w-[120px]">Last Updated</TableHead>
                                    <TableHead className="w-[120px]">Phone</TableHead>
                                    <TableHead className="w-[150px]">Website</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center text-slate-400 italic">
                                            No data scraped yet. Configure the area and click Start.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    results.map((r) => (
                                        <TableRow key={r.id} className="hover:bg-slate-50 text-xs">
                                            <TableCell className="font-medium">{r.name}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[10px] font-normal">{r.type}</Badge></TableCell>
                                            <TableCell className="truncate max-w-[180px]" title={r.address}>{r.address || '-'}</TableCell>
                                            <TableCell>{r.city || '-'}</TableCell>
                                            <TableCell className="font-mono text-[10px] text-slate-500">
                                                {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                                            </TableCell>
                                            <TableCell className="text-slate-500">
                                                {r.last_updated ? new Date(r.last_updated).toLocaleDateString() : '-'}
                                            </TableCell>
                                            <TableCell>{r.phone || '-'}</TableCell>
                                            <TableCell>{r.website ? <a href={r.website} target="_blank" className="text-blue-500 hover:underline">Link</a> : '-'}</TableCell>
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
