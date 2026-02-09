'use client';

import { useState, useEffect } from 'react';
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
  Bell
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EngineStatusCard } from '@/components/dashboard/engine-status'; 

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
    title: "Map Architect",
    description: "Draw, snap, and auto-trim territories. A pro-version of Google My Maps.",
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
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (stored) {
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);
      setLoading(false);
    } else {
      router.push('/');
    }
  }, [router]);

  // 1. GLOBAL PAGE GUARD
  const canAccessPage = (() => {
      if (!user) return false;
      if (user.role === 'admin' || user.role === 'super_admin') return true;
      if (user.permissions?.access_admin_tools) return true;

      // Granular Check: Do they have AT LEAST ONE tool permission?
      return tools.some(t => user.permissions?.[t.requiredPermission] === true);
  })();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // 2. RESTRICTED UI
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

  // 3. ITEM CHECKER
  const canSeeTool = (toolPermission: string) => {
    if (user?.role === 'admin' || user?.role === 'super_admin') return true; 
    return user?.permissions?.[toolPermission] === true;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-slate-50">
      
      {/* --- SERVER STATUS MONITORS --- */}
      {/* Renders two cards side-by-side for your dual server setup */}
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
        <div className="mt-2 inline-flex items-center gap-2">
           <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
              Role: {user.role || 'Custom'}
           </Badge>
           {user.role === 'custom' && (
             <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">
                Custom Permissions Active
             </Badge>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool, idx) => {
          
          // 4. FILTER TOOLS
          if (!canSeeTool(tool.requiredPermission)) return null;

          return (
            <Link href={tool.href} key={idx} className="block group">
              <Card className="h-full p-6 hover:shadow-xl transition-all duration-300 border-slate-200 hover:border-indigo-200 relative overflow-hidden bg-white">
                
                <div className={`w-12 h-12 ${tool.bg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm`}>
                  <tool.icon className={`h-6 w-6 ${tool.color}`} />
                </div>
                
                <h3 className="font-bold text-lg text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">
                  {tool.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4 font-medium">
                  {tool.description}
                </p>

                <div className="flex items-center text-[10px] font-black uppercase tracking-wider text-slate-400 group-hover:text-indigo-500 transition-colors mt-auto">
                  Launch Tool <ChevronRight className="h-3 w-3 ml-1" />
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
