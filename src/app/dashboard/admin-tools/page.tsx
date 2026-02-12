'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Map as MapIcon, 
  Layers, 
  RefreshCw, 
  ChevronRight, 
  Lock, 
  Wrench, 
  Loader2, 
  ShieldAlert,
  Bell,
  ShoppingBasket 
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EngineStatusCard } from '@/components/dashboard/engine-status'; 
import { useSession } from '@/hooks/use-session'; // 🟢 Import the new hook

// 🛠️ CONFIGURATION
const tools = [
  {
    title: "Batch Coverage Processor",
    description: "Assign thousands of stores to polygons using AI-driven routing logic.",
    icon: MapIcon,
    href: "/dashboard/admin-tools/batch-processor",
    color: "text-blue-500",
    bg: "bg-blue-50",
    requiredPermission: 'tool_batch',
    locked: false
  },
  {
    title: "Dark Warehouse Analyzer",
    description: "Network planning, time-based analysis, and dead zone detection for delivery.",
    icon: ShoppingBasket,
    href: "/dashboard/admin-tools/dark-store-analyzer",
    color: "text-pink-600",
    bg: "bg-pink-50",
    requiredPermission: 'tool_darkstore',
    locked: false
  },
  {
    title: "Topology Architect",
    description: "Detect overlaps, gaps, and invalid geometry in your territory maps.",
    icon: Layers,
    href: "/dashboard/admin-tools/topology-check",
    color: "text-orange-500",
    bg: "bg-orange-50",
    requiredPermission: 'tool_topology',
    locked: false
  },
  {
    title: "Map Architect - Under Development",
    description: "Draw, snap, and auto-trim territories. (Beta Version)",
    icon: MapIcon,
    href: "/dashboard/admin-tools/map-architect",
    color: "text-purple-500",
    bg: "bg-purple-50",
    requiredPermission: 'tool_maps',
    locked: false
  },
  {
    title: "Coordinate Flipper",
    description: "Fix inverted Lat/Lon coordinates from WKT files instantly.",
    icon: RefreshCw,
    href: "/dashboard/admin-tools/coord-flipper",
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    requiredPermission: 'tool_coords',
    locked: false
  },
  {
    title: "Broadcast Center",
    description: "Send push notifications and system alerts to users.",
    icon: Bell, 
    href: "/dashboard/admin-tools/notifications",
    color: "text-pink-500",
    bg: "bg-pink-50",
    requiredPermission: 'tool_broadcast',
    locked: false
  }
];

export default function AdminUtilitiesPage() {
  const router = useRouter();

  // 1. USE SESSION HOOK (Replaces localStorage logic)
  const { user, loading } = useSession(true);

  // 2. GLOBAL PAGE GUARD
  const canAccessPage = user && (
    user.role === 'admin' || 
    user.role === 'super_admin' || 
    user.permissions?.access_admin_tools ||
    // Granular Check: Do they have AT LEAST ONE tool permission?
    tools.some(t => user.permissions?.[t.requiredPermission] === true)
  );

  // 3. ITEM CHECKER
  const canSeeTool = (toolPermission: string) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true; 
    return user.permissions?.[toolPermission] === true;
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
      </div>
    );
  }

  // 4. RESTRICTED UI
  if (!canAccessPage) {
    return (
      <div className="h-[80vh] w-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-16 w-16 text-red-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-800">Restricted Area</h2>
          <p className="text-slate-500">You do not have permission to access Admin Utilities.</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-slate-50">
      
      {/* --- SERVER STATUS MONITORS --- */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
         <EngineStatusCard target="erbil" label="Erbil OSRM Engine" />
         <EngineStatusCard target="beirut" label="Beirut OSRM Engine" />
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
            <div className="bg-slate-900 p-2.5 rounded-xl shadow-lg shadow-slate-200">
                <Wrench className="h-6 w-6 text-white" />
            </div>
            <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Utilities & Tools</h1>
                <p className="text-slate-500 text-sm font-medium">Advanced territory management suite.</p>
            </div>
        </div>
        
        {/* Helper badge */}
        <div className="mt-4 inline-flex items-center gap-2">
           <Badge variant="outline" className="bg-white text-slate-500 border-slate-200 rounded-lg px-3 py-1 font-bold text-[10px] uppercase tracking-wider shadow-sm">
             Role: {user.role || 'Custom'}
           </Badge>
           {user.role === 'custom' && (
             <Badge className="bg-primary/5 text-primary border-primary/10 rounded-lg px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
               Custom Clearances Active
             </Badge>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool, idx) => {
          
          // 5. FILTER TOOLS
          if (!canSeeTool(tool.requiredPermission)) return null;

          return (
            <Link href={tool.href} key={idx} className="block group">
              <Card className="h-full p-8 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 border-slate-100 hover:border-primary/20 relative overflow-hidden bg-white rounded-3xl group-hover:-translate-y-1">
                
                <div className={`w-14 h-14 ${tool.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm`}>
                  <tool.icon className={`h-7 w-7 ${tool.color}`} />
                </div>
                
                <h3 className="font-bold text-xl text-slate-900 mb-3 tracking-tight group-hover:text-primary transition-colors">
                  {tool.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
                  {tool.description}
                </p>

                <div className="flex items-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 group-hover:text-primary transition-colors mt-auto">
                  Launch Application <ChevronRight className="h-3.5 w-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
                </div>

                {tool.locked && (
                    <div className="absolute top-4 right-4 bg-slate-100 p-1.5 rounded-lg" title="Feature Locked">
                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
