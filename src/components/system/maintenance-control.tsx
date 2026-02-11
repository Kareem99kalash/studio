'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ShieldAlert, Lock, Unlock, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function MaintenanceControl() {
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Listen to current status
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_metadata', 'maintenance'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setIsActive(data.isActive);
        // Only update message state if we aren't currently editing it
        if (!isOpen) setMessage(data.message || '');
      }
    });
    return () => unsub();
  }, [isOpen]);

  const saveStatus = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'system_metadata', 'maintenance'), {
        isActive,
        message: message || "System optimization in progress.",
        updatedAt: new Date().toISOString()
      });
      toast({ 
        title: isActive ? "System Locked" : "System Online", 
        description: isActive ? "Maintenance mode is now active for all users." : "Users can now access the tool.",
        variant: isActive ? "destructive" : "default"
      });
      setIsOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update system status." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50" title="Emergency Maintenance Control">
            <ShieldAlert className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
             <ShieldAlert className="h-5 w-5" /> Maintenance Control
          </DialogTitle>
          <DialogDescription>
            When active, only Admins can access the dashboard. All other users will see a maintenance screen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg bg-slate-50">
            <div className="flex flex-col space-y-1">
               <Label htmlFor="m-mode" className="font-bold text-slate-700">Maintenance Mode</Label>
               <span className="text-xs text-slate-500">{isActive ? 'Currently Active' : 'Currently Inactive'}</span>
            </div>
            <Switch 
                id="m-mode" 
                checked={isActive} 
                onCheckedChange={setIsActive}
                className="data-[state=checked]:bg-red-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Public Reason (Message)</Label>
            <Input 
                value={message} 
                onChange={(e) => setMessage(e.target.value)} 
                placeholder="e.g. Updating Routing Engine..."
                disabled={!isActive}
                className="bg-white"
            />
          </div>

          {isActive && (
              <div className="bg-amber-50 p-3 rounded text-xs text-amber-800 flex gap-2 items-start border border-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p><strong>Warning:</strong> This will immediately disconnect active sessions for non-admin users.</p>
              </div>
          )}
        </div>

        <DialogFooter>
           <Button onClick={saveStatus} disabled={loading} className={isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}>
              {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : isActive ? <Lock className="h-4 w-4 mr-2"/> : <Unlock className="h-4 w-4 mr-2"/>}
              {isActive ? "Lock System" : "Go Online"}
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}