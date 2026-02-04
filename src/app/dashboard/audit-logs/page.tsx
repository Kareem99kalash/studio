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
      const parsedUser = JSON.parse(stored);
      setCurrentUser(parsedUser);
      
      // 🛡️ THE GUARD: Only 'Admin' is allowed here
      if (parsedUser.role !== 'Admin') {
        setLoading(false);
        return;
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
      toast({ variant: "destructive", title: "Fetch Error", description: "Could not retrieve logs." });
    } finally {
      setLoading(false);
    }
  };

  // --- 🛡️ RESTRICTED ACCESS UI ---
  if (currentUser && currentUser.role !== 'Admin') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full text-center shadow-lg border-t-4 border-t-red-500">
          <CardContent className="pt-10 pb-10 space-y-4">
            <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Admin Only Area</h2>
              <p className="text-sm text-slate-500">
                The Audit Logs contain sensitive system data. Access is restricted to <strong>System Administrators</strong>.
              </p>
            </div>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => router.push('/dashboard')}
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) return <div className="h-full w-full flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="text-purple-600" /> User Activity Audit
        </h1>
        <p className="text-sm text-muted-foreground">Detailed logs of all administrative and analysis actions.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="bg-white border-b">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <User className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Username (e.g. admin_01)" 
                className="pl-8 h-9 text-sm"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchLogs(searchUser)}
              />
            </div>
            <Button size="sm" onClick={() => fetchLogs(searchUser)} className="bg-purple-600">
              <Search className="mr-2 h-4 w-4" /> Filter
            </Button>
            <Button size="sm" variant="outline" onClick={() => {setSearchUser(''); fetchLogs();}}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-40">User</TableHead>
                <TableHead className="w-40">Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-52">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-bold text-sm">@{log.username}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 font-bold text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 leading-relaxed">{log.details}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString('en-GB')}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-20 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>No activity logs found.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
