import { Wrench, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MaintenanceScreenProps {
  message?: string;
}

export function MaintenanceScreen({ message }: MaintenanceScreenProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)',
          backgroundSize: '24px 24px'
      }}></div>

      <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl relative z-10 p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        
        {/* Icon Circle */}
        <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-amber-500/20">
          <Wrench className="h-10 w-10 text-amber-500 animate-pulse" />
        </div>

        <h1 className="text-2xl font-black text-white tracking-tight mb-3">
          System Under Maintenance
        </h1>

        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          {message || "We are currently optimizing the coverage zones and route data. Please check back shortly."}
        </p>

        <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800 mb-6">
           <div className="flex items-center justify-center gap-2 text-xs font-medium text-amber-500">
              <Info className="h-3 w-3" />
              <span>Contact Admin for urgent inquiries</span>
           </div>
        </div>

        <Button 
          className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold h-11"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Check for Updates
        </Button>

        <div className="mt-8 flex justify-center items-center gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
           <span className="w-2 h-2 rounded-full bg-amber-500"></span>
           Status Page: Offline
        </div>
      </Card>
    </div>
  );
}
