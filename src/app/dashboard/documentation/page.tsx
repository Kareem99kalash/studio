'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Shield,
  Map as MapIcon,
  ShoppingBasket,
  Layers,
  RefreshCw,
  Bell,
  Ticket,
  History,
  Building2,
  Settings2,
  ChevronRight,
  Info,
  Sparkles,
  Zap,
  CheckCircle2,
  ExternalLink,
  Target,
  Search,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const SECTIONS = [
  { id: 'overview', title: 'System Overview', icon: BookOpen },
  { id: 'access-control', title: 'User & Access Control', icon: Shield },
  { id: 'batch-processor', title: 'Batch Coverage Processor', icon: MapIcon },
  { id: 'darkstore-analyzer', title: 'Dark Store Analyzer', icon: ShoppingBasket },
  { id: 'topology-architect', title: 'Topology Architect', icon: Layers },
  { id: 'map-architect', title: 'Map Architect', icon: MapIcon },
  { id: 'coord-flipper', title: 'Coordinate Flipper', icon: RefreshCw },
  { id: 'operational', title: 'Operational Management', icon: Ticket },
  { id: 'broadcast', title: 'Broadcast Center', icon: Bell },
  { id: 'compliance', title: 'Audit & Compliance', icon: History },
];

export default function DocumentationPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20">

      {/* HEADER SECTION */}
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-3 rounded-2xl shadow-xl shadow-primary/20">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">System Documentation</h1>
            <p className="text-slate-500 font-medium">The complete guide to GeoCoverage platforms and tools.</p>
          </div>
        </div>

        <Card className="bg-slate-900 border-none shadow-2xl rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Sparkles className="h-32 w-32 text-white" />
          </div>
          <CardContent className="p-8 relative z-10">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to GeoCoverage Command</h2>
            <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
              This platform is a high-performance territory management and routing suite designed for complex delivery networks.
              From AI-driven store assignments to real-time topology validation, this guide explains every module in detail.
            </p>
          </CardContent>
        </Card>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">

        {/* STICKY NAV */}
        <aside className="lg:col-span-1">
          <div className="sticky top-24 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Table of Contents</p>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-primary transition-all group border border-transparent hover:border-slate-200"
              >
                <section.icon className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                <span className="text-sm font-bold">{section.title}</span>
              </a>
            ))}
          </div>
        </aside>

        {/* CONTENT AREA */}
        <main className="lg:col-span-3 space-y-16">

          {/* 1. OVERVIEW */}
          <section id="overview" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">1.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">System Overview</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
              <p>
                GeoCoverage is built on a distributed architecture using <strong>Next.js</strong> for the frontend, <strong>Firebase</strong> for real-time data and authentication, and specialized <strong>OSRM (Open Source Routing Machine)</strong> engines for hyper-fast road-network calculations.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                       <Zap className="h-4 w-4 text-amber-500" /> Real-time Sync
                    </h4>
                    <p className="text-xs">All changes to tickets, users, and cities are synced instantly across all active sessions using Firestore snapshots.</p>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                       <Target className="h-4 w-4 text-blue-500" /> Routing Engines
                    </h4>
                    <p className="text-xs">Dual-region OSRM instances (Iraq & Lebanon) handle massive matrix requests for batch store assignments.</p>
                 </div>
              </div>
            </div>
          </section>

          {/* 2. ACCESS CONTROL */}
          <section id="access-control" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">2.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">User & Access Control</h2>
            </div>
            <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100">
                <CardTitle className="text-lg">Role-Based Access Control (RBAC)</CardTitle>
                <CardDescription>Granular permission system for different organizational levels.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="space-y-2">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                         <Badge className="bg-slate-900 text-white border-none">Admin</Badge>
                      </div>
                      <p className="text-xs text-slate-500">Full system access. Can manage users, edit global settings, and access all diagnostic tools.</p>
                   </div>
                   <div className="space-y-2">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                         <Badge variant="outline" className="border-primary text-primary">Manager</Badge>
                      </div>
                      <p className="text-xs text-slate-500">Can manage tickets and city data. Limited access to Admin Toolbox (Batch Processor only).</p>
                   </div>
                   <div className="space-y-2">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                         <Badge variant="secondary">Analyst</Badge>
                      </div>
                      <p className="text-xs text-slate-500">Read-only access to operational data. Can use Topology and Map visualization tools.</p>
                   </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                   <h5 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                      <Info className="h-4 w-4" /> The User Wizard
                   </h5>
                   <p className="text-xs text-blue-800 leading-relaxed">
                      Use the <strong>Quick Add Wizard</strong> in the User Management tab to create accounts. The wizard guides you through selecting credentials, geographic group assignment, and granular permission overrides if a custom role is needed.
                   </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 3. BATCH PROCESSOR */}
          <section id="batch-processor" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">3.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Batch Coverage Processor</h2>
            </div>
            <div className="space-y-4">
              <p className="text-slate-600">
                The flagship tool for territory optimization. It uses a <strong>Multi-Point Analysis</strong> algorithm to assign polygons to the most efficient branch.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                 <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 text-sm uppercase tracking-widest">Assignment Logic</h4>
                    <ul className="space-y-3">
                       <li className="flex items-start gap-3 text-xs text-slate-500">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          <span><strong>Centroid Check:</strong> Initial distance check to the polygon center.</span>
                       </li>
                       <li className="flex items-start gap-3 text-xs text-slate-500">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          <span><strong>3-Point Verification:</strong> Validates coverage at the Centroid, Closest Edge, and Furthest Edge.</span>
                       </li>
                       <li className="flex items-start gap-3 text-xs text-slate-500">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          <span><strong>Smart Balance:</strong> AI logic that shifts assignments from overloaded branches to starving branches within a distance threshold.</span>
                       </li>
                    </ul>
                 </div>
                 <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest">Visual Feedback</div>
                    <div className="flex items-center gap-4 mb-4">
                       <div className="w-12 h-2 rounded-full bg-blue-500" />
                       <span className="text-[10px] font-bold">Primary Layer</span>
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                       <div className="w-12 h-2 rounded-full bg-orange-400" />
                       <span className="text-[10px] font-bold">Secondary Layer</span>
                    </div>
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-2 rounded-full bg-slate-400" />
                       <span className="text-[10px] font-bold">Dead Zone</span>
                    </div>
                 </div>
              </div>
            </div>
          </section>

          {/* 4. DARK STORE ANALYZER */}
          <section id="darkstore-analyzer" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">4.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Dark Store Analyzer</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600">
              <p>
                A specialized utility for planning "Dark Stores" or delivery hubs. It focuses on <strong>Capacity Weights</strong> and <strong>Order Demand Percentage</strong>.
              </p>
              <div className="bg-slate-900 text-white p-6 rounded-3xl mt-6 not-prose">
                 <div className="grid grid-cols-2 gap-8">
                    <div>
                       <h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Simulation Features</h5>
                       <ul className="space-y-2">
                          <li className="text-xs flex items-center gap-2"><div className="w-1 h-1 bg-primary rounded-full" />Offline Simulations (Toggle stores)</li>
                          <li className="text-xs flex items-center gap-2"><div className="w-1 h-1 bg-primary rounded-full" />Radius Visualizations (Service distance)</li>
                          <li className="text-xs flex items-center gap-2"><div className="w-1 h-1 bg-primary rounded-full" />Traffic Load Balancing</li>
                       </ul>
                    </div>
                    <div>
                       <h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Gravity Model</h5>
                       <p className="text-[10px] text-slate-400 leading-relaxed">
                          Stores with higher "Weight" attract more polygons, simulating a larger fleet or warehouse capacity compared to standard hubs.
                       </p>
                    </div>
                 </div>
              </div>
            </div>
          </section>

          {/* 5. TOPOLOGY ARCHITECT */}
          <section id="topology-architect" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">5.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Topology Architect</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600">
               <p>
                  Ensures geometric integrity across the entire platform. The Topology Architect scans your polygon sets to identify two critical issues:
               </p>
               <ul className="text-xs">
                  <li><strong>Overlaps:</strong> Where two branches claim the same territory, leading to assignment conflicts.</li>
                  <li><strong>Gaps:</strong> Small slivers of "No Man's Land" where no branch is providing coverage.</li>
               </ul>
               <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-start gap-3 mt-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800">Always run a Topology Check after importing new GeoJSON files to prevent routing errors in production.</p>
               </div>
            </div>
          </section>

          {/* 6. MAP ARCHITECT */}
          <section id="map-architect" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">6.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Map Architect</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600">
               <p>
                  A visual CAD-like environment for manually adjusting polygon vertices. Map Architect allows you to:
               </p>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                     <strong>Edge Snapping:</strong> Automatically align the edge of one polygon to its neighbor to prevent gaps.
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                     <strong>Multi-Select:</strong> Move entire groups of polygons between different branch layers.
                  </div>
               </div>
            </div>
          </section>

          {/* 7. COORDINATE FLIPPER */}
          <section id="coord-flipper" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">7.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Coordinate Flipper</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600">
               <p>
                  A utility tool for fixing common GIS export errors. Some systems export WKT (Well-Known Text) as <code>[Lat, Lon]</code> while others use <code>[Lon, Lat]</code>.
               </p>
               <p className="text-xs">
                  If your map appears in the middle of the ocean or at the South Pole, your coordinates are likely inverted. Paste your WKT into this tool to flip them instantly.
               </p>
            </div>
          </section>

          {/* 8. OPERATIONAL */}
          <section id="operational" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">8.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Operational Management</h2>
            </div>
            <div className="space-y-4 text-slate-600 text-sm">
               <p>Daily operations are managed via the Cities, Thresholds, and Tickets modules.</p>
               <div className="space-y-2">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <Building2 className="h-5 w-5 text-slate-400" />
                     <div>
                        <span className="font-bold text-slate-900 block">City Management</span>
                        <span className="text-xs">Update active status and center coordinates for operational hubs.</span>
                     </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <Settings2 className="h-5 w-5 text-slate-400" />
                     <div>
                        <span className="font-bold text-slate-900 block">Thresholds</span>
                        <span className="text-xs">Define dynamic service limits (KM or Minutes) per city.</span>
                     </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <Ticket className="h-5 w-5 text-slate-400" />
                     <div>
                        <span className="font-bold text-slate-900 block">Ticket System</span>
                        <span className="text-xs">Report and track geometric errors or branch assignment requests.</span>
                     </div>
                  </div>
               </div>
            </div>
          </section>

          {/* 9. BROADCAST CENTER */}
          <section id="broadcast" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">9.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Broadcast Center</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600">
               <p>
                  Send real-time push notifications and in-app alerts to all active users or specific geographic groups.
               </p>
               <ul className="text-xs">
                  <li><strong>System Alerts:</strong> Maintenance windows or platform updates.</li>
                  <li><strong>Operational Alerts:</strong> Sudden weather-related service suspensions in specific cities.</li>
               </ul>
            </div>
          </section>

          {/* 10. COMPLIANCE */}
          <section id="compliance" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-none rounded-lg px-3 py-1 font-bold">10.0</Badge>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Audit & Compliance</h2>
            </div>
            <div className="prose prose-slate max-w-none text-slate-600">
               <p>
                  Every action on the platform is logged for security and accountability. The Audit Logs track:
               </p>
               <ul className="text-xs">
                  <li><strong>User Changes:</strong> Creation, role updates, and deletions.</li>
                  <li><strong>Geometry Edits:</strong> Who modified which polygon and when.</li>
                  <li><strong>Batch Processes:</strong> History of all coverage optimization runs.</li>
               </ul>
            </div>
          </section>

          {/* FOOTER */}
          <footer className="pt-12 border-t border-slate-100">
             <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                      <MapIcon className="h-5 w-5 text-white" />
                   </div>
                   <div>
                      <span className="font-bold text-slate-900 block">GeoCoverage Platform</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Technical Guide v2.4</span>
                   </div>
                </div>
                <Button variant="outline" className="rounded-xl font-bold gap-2 text-xs" asChild>
                   <Link href="/dashboard">
                      Back to Dashboard <ChevronRight className="h-4 w-4" />
                   </Link>
                </Button>
             </div>
          </footer>

        </main>
      </div>
    </div>
  );
}
