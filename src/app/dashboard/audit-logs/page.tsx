'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, History, User, Loader2, ShieldAlert, ChevronLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuditLogsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (stored) {
      try {
        const parsedUser = JSON.parse(stored);
        setCurrentUser(parsedUser);
        
        // 🛡️ THE GUARD: Case-insensitive check for 'admin'
        // This ensures 'Admin', 'ADMIN', and 'admin' all work.
        const role = parsedUser.role?.toLowerCase();
        if (role !== 'admin') {
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Session parse error");
      }
    }
    fetchLogs();
  }, []);

  const fetchLogs = async (username?: string) => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'logs');
      let q;

      if (username && username.trim() !== '') {
        q = query(
          logsRef, 
          where('username', '==', username.trim().toLowerCase()), 
          orderBy('timestamp', 'desc'),
          limit(100)
        );
      } else {
        q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
      }

      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      console.error("Firestore Fetch Error:", e);
      toast({ 
        variant: "destructive", 
        title: "Access Restricted", 
        description: "Verify your admin permissions in the database." 
      });
    } finally {
      setLoading(false);
    }
  };

  // --- 🛡️ RESTRICTED ACCESS UI (Fuzzy Role Check) ---
  const isAuthorized = currentUser?.role?.toLowerCase() === 'admin';

  if (!isAuthorized && !loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 p-6 min-h-[80vh]">
        <Card className="max-w-md w-full text-center shadow-2xl border-t-4 border-t-red-500 animate-in zoom-in duration-300">
          <CardContent className="pt-10 pb-10 space-y-4">
            <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
              <ShieldAlert className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Access Denied</h2>
              <p className="text-sm text-slate-500 leading-relaxed px-4">
                The Audit Logs contain sensitive system data. Access is strictly restricted to <strong>System Administrators</strong>.
              </p>
            </div>
            <Button 
              variant="default" 
              className="mt-6 bg-slate-900 text-white w-full max-w-[200px]"
              onClick={() => router.push('/dashboard')}
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[80vh] w-full flex flex-col items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-purple-600 mb-4" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Retrieving System Logs</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-slate-800">
          <History className="text-purple-600" /> SYSTEM AUDIT
        </h1>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Comprehensive security and analysis activity tracking</p>
      </div>

      <Card className="shadow-md border-none overflow-hidden">
        <CardHeader className="bg-white border-b px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[280px] max-w-sm">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Filter by username..." 
                className="pl-9 h-10 text-sm bg-slate-50 border-slate-200 focus:ring-purple-500"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchLogs(searchUser)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fetchLogs(searchUser)} className="bg-purple-600 hover:bg-purple-700 font-bold px-6">
                <Search className="mr-2 h-4 w-4" /> Search
              </Button>
              <Button size="sm" variant="outline" className="font-bold" onClick={() => {setSearchUser(''); fetchLogs();}}>
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-48 text-[10px] font-black uppercase text-slate-400 pl-6">Operator</TableHead>
                  <TableHead className="w-40 text-[10px] font-black uppercase text-slate-400">Action Type</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-400">Activity Details</TableHead>
                  <TableHead className="w-56 text-[10px] font-black uppercase text-slate-400 pr-6 text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors border-b last:border-0">
                      <td className="px-6 py-4 font-bold text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
                            <User className="h-3 w-3 text-slate-400" />
                          </div>
                          @{log.username}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-black text-[9px] px-2 py-0.5 uppercase">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-[13px] text-slate-600 font-medium">
                        {log.details}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                          {new Date(log.timestamp).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-24">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-10 text-slate-900" />
                      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No matching logs found</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
