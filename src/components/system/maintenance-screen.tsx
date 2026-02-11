import { Wrench, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MaintenanceScreenProps {
  message?: string;
}

export function MaintenanceScreen({ message }: MaintenanceScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/50 backdrop-blur-md transition-all duration-500">
      {/* Dark Card Popout */}
      <Card className="w-full max-w-md bg-[#0f172a] border-slate-800 shadow-2xl relative z-50 p-8 text-center animate-in zoom-in-95 fade-in duration-300">
        
        {/* Icon Circle */}
        <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-amber-500/20 shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]">
          <Wrench className="h-10 w-10 text-amber-500 animate-pulse" />
        </div>

        <h1 className="text-2xl font-black text-white tracking-tight mb-2">
          System Under Maintenance
        </h1>
        
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">
            Updating Routing Engine
        </p>

        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 mb-6">
           <p className="text-slate-300 text-sm leading-relaxed">
             {message || "We are optimizing the coverage zones. Access is temporarily restricted to Administrators."}
           </p>
        </div>

        {/* Action Area */}
        <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-[10px] font-medium text-amber-500/80 bg-amber-500/5 p-2 rounded border border-amber-500/10">
                <Info className="h-3 w-3" />
                <span>Contact Admin for urgent inquiries</span>
            </div>

            <Button 
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-11 border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 transition-all"
            onClick={() => window.location.reload()}
            >
            <RefreshCw className="h-4 w-4 mr-2" /> Check for Updates
            </Button>
        </div>

        <div className="mt-8 flex justify-center items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-widest">
           <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
           Status Page: Offline
        </div>
      </Card>
    </div>
  );
}
