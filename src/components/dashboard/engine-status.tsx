'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Server, Power, RefreshCw, Loader2, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// New Prop Interface
interface EngineProps {
  target: 'erbil' | 'beirut';
  label: string;
}

export function EngineStatusCard({ target, label }: EngineProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>('LOADING');
  const [isWaking, setIsWaking] = useState(false);

  const fetchStatus = async () => {
    try {
      // Pass target query param
      const res = await fetch(`/api/engine-status?target=${target}`);
      const data = await res.json();
      setStatus(data.status);
      
      if (data.status === 'BUILDING' || data.status === 'STARTING') {
        setTimeout(fetchStatus, 5000);
      }
    } catch (e) { setStatus('ERROR'); }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [target]);

  const handleWakeUp = async () => {
    setIsWaking(true);
    toast({ title: `Waking ${label}`, description: "Sending start signal..." });
    
    // POST with body
    await fetch('/api/engine-status', { 
        method: 'POST',
        body: JSON.stringify({ target }) 
    });
    
    setStatus('BUILDING');
    
    let attempts = 0;
    const poll = setInterval(async () => {
        const res = await fetch(`/api/engine-status?target=${target}`);
        const data = await res.json();
        if (data.status === 'RUNNING') {
            setStatus('RUNNING');
            setIsWaking(false);
            clearInterval(poll);
            toast({ title: `${label} Ready`, description: "Engine online.", variant: "default" });
        }
        if (++attempts > 30) { clearInterval(poll); setIsWaking(false); }
    }, 5000);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'RUNNING': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'SLEEPING': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'BUILDING': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  return (
    <Card className="border-l-4 border-l-slate-800 shadow-sm mb-4">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getStatusColor()}`}>
             {status === 'RUNNING' ? <Zap className="h-5 w-5 fill-current" /> : <Server className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">{label}</h3>
            <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Status:</span>
                <Badge variant="outline" className={`text-[10px] font-black border-none px-1.5 ${getStatusColor()}`}>
                    {status === 'LOADING' ? 'CHECKING...' : status}
                </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchStatus}>
                <RefreshCw className={`h-4 w-4 text-slate-400 ${status === 'BUILDING' ? 'animate-spin' : ''}`} />
            </Button>

            {status === 'SLEEPING' && (
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs" onClick={handleWakeUp} disabled={isWaking}>
                    {isWaking ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Power className="h-3 w-3 mr-2" />}
                    {isWaking ? "Booting..." : "Wake Up"}
                </Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
