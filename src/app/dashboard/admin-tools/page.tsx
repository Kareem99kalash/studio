'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Map, RefreshCw, Layers, PenTool, ArrowRight, ShieldCheck, Users } from 'lucide-react';

export default function AdminToolsPage() {
  const tools = [
    {
      title: "Batch Coverage Processor",
      desc: "Assign thousands of stores to polygons using AI-driven routing logic.",
      icon: Map,
      color: "text-blue-600",
      bg: "bg-blue-100",
      href: "/dashboard/admin-tools/batch-coverage"
    },
    {
      title: "Topology Architect",
      desc: "Detect overlaps, gaps, and invalid geometry in your territory maps.",
      icon: Layers,
      color: "text-orange-600",
      bg: "bg-orange-100",
      href: "/dashboard/admin-tools/topology-check"
    },
    {
      title: "Map Architect",
      desc: "Draw, snap, and auto-trim territories. A pro-version of Google My Maps.",
      icon: PenTool,
      color: "text-purple-600",
      bg: "bg-purple-100",
      href: "/dashboard/admin-tools/map-architect"
    },
    {
      title: "Team Access Manager",
      desc: "Promote staff to Admins. Restricts deletion of Super Admin accounts.",
      icon: Users,
      color: "text-indigo-600",
      bg: "bg-indigo-100",
      href: "/dashboard/admin-tools/team-manager"
    },
    {
      title: "Coordinate Flipper",
      desc: "Fix inverted Lat/Lon coordinates from WKT files instantly.",
      icon: RefreshCw,
      color: "text-green-600",
      bg: "bg-green-100",
      href: "/dashboard/admin-tools/coordinate-flipper"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-slate-900 rounded-lg">
           <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
           <h1 className="text-2xl font-bold text-slate-900">Admin Utilities</h1>
           <p className="text-slate-500">Advanced tools for territory and data management.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool, i) => (
          <Link key={i} href={tool.href} className="group">
            <Card className="h-full hover:shadow-lg transition-all border-slate-200 hover:border-purple-200 group-hover:-translate-y-1">
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg ${tool.bg} flex items-center justify-center mb-4`}>
                  <tool.icon className={`h-6 w-6 ${tool.color}`} />
                </div>
                <CardTitle className="group-hover:text-purple-700 transition-colors">
                  {tool.title}
                </CardTitle>
                <CardDescription>
                  {tool.desc}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm font-bold text-slate-400 group-hover:text-purple-600 transition-colors">
                  Open Tool <ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
