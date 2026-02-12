'use client';

import { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  where, 
  writeBatch,
  doc,
  limit 
} from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Send, Bell, Loader2, History, AlertTriangle, Info, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default function BroadcastPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  
  // Form Inputs
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('all'); 
  const [type, setType] = useState('info'); 

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
      const snap = await getDocs(q);
      
      // FIX: Explicitly type this as 'any[]' so TypeScript knows it has custom fields like 'title'
      const rawDocs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Now TS won't complain about 't.title' or 'v.title'
      const distinctHistory = rawDocs.filter((v,i,a) => 
        a.findIndex(t => (t.title === v.title && t.message === v.message)) === i
      );
      
      setHistory(distinctHistory);
    } catch (e) { console.error(e); }
  };

  const handleSend = async () => {
    if (!title || !message) return;
    setLoading(true);
    
    try {
      // 1. FIND RECIPIENTS
      let q;
      if (target === 'all') {
        q = query(collection(db, 'users'));
      } else {
        q = query(collection(db, 'users'), where('role', '==', target));
      }
      
      const userSnap = await getDocs(q);
      
      if (userSnap.empty) {
        toast({ variant: "destructive", title: "No Users Found", description: `No users match the role: ${target}` });
        setLoading(false);
        return;
      }

      // 2. CREATE BATCH (Fan-out)
      const batch = writeBatch(db);
      const timestamp = new Date().toISOString();

      userSnap.docs.forEach((u) => {
        const userData = u.data();
        const recipientId = userData.username || u.id; 

        const newRef = doc(collection(db, 'notifications'));
        batch.set(newRef, {
          targetUser: recipientId,
          title: title,
          message: message,
          type: type,
          read: false,
          createdAt: timestamp,
          broadcastGroup: target 
        });
      });

      // 3. COMMIT
      await batch.commit();
      
      toast({ 
        title: "Broadcast Sent", 
        description: `Delivered to ${userSnap.size} user(s).` 
      });
      
      setTitle(''); 
      setMessage(''); 
      fetchHistory();

    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Failed to broadcast message." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Broadcast Center
            <Link href="/dashboard/documentation#broadcast">
              <HelpCircle className="h-4 w-4 text-slate-300 hover:text-indigo-600 transition-colors cursor-help" />
            </Link>
          </h1>
          <p className="text-slate-500 text-sm">Push system-wide alerts to user dashboards.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COMPOSER */}
        <Card className="lg:col-span-1 border-t-4 border-t-indigo-600 shadow-md h-fit">
          <CardHeader>
            <CardTitle>Compose Message</CardTitle>
            <CardDescription>Target specific roles or everyone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Target Audience</label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone (Global)</SelectItem>
                  <SelectItem value="admin">Admins Only</SelectItem>
                  <SelectItem value="manager">Managers Only</SelectItem>
                  <SelectItem value="analyst">Analysts Only</SelectItem>
                  <SelectItem value="viewer">Viewers Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Type</label>
              <div className="flex gap-2">
                <Button 
                  variant={type === 'info' ? 'default' : 'outline'} 
                  className={`flex-1 ${type === 'info' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                  onClick={() => setType('info')}
                >
                  <Info className="mr-2 h-4 w-4" /> Info
                </Button>
                <Button 
                  variant={type === 'alert' ? 'destructive' : 'outline'} 
                  className="flex-1"
                  onClick={() => setType('alert')}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" /> Alert
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Title</label>
              <Input placeholder="System Update..." value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Message Body</label>
              <Textarea 
                placeholder="Type message here..." 
                className="min-h-[100px]"
                value={message} 
                onChange={e => setMessage(e.target.value)} 
              />
            </div>

            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold" onClick={handleSend} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <><Send className="mr-2 h-4 w-4" /> Send Broadcast</>}
            </Button>
          </CardContent>
        </Card>

        {/* HISTORY */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-slate-400" /> Recent Broadcasts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-center text-slate-400 italic py-8">No messages sent recently.</p>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 p-4 border rounded-lg bg-slate-50/50 hover:bg-white transition-all">
                    <div className={`p-2 rounded-full shrink-0 ${item.type === 'alert' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      {item.type === 'alert' ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800">{item.title}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{item.message}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
                            Role: {item.broadcastGroup || 'Specific User'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
