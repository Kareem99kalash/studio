'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, History, User, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchLogs = async (username?: string) => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'logs');
      let q;

      if (username && username.trim() !== '') {
        // 🛡️ Search for specific user
        // Note: This requires a Firestore Composite Index
        q = query(
          logsRef, 
          where('username', '==', username.trim().toLowerCase()), 
          orderBy('timestamp', 'desc'),
          limit(100)
        );
      } else {
        // 📜 Global Recent Activity
        q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(data);

    } catch (e: any) {
      console.error("Firestore Fetch Error:", e);
      
      // Check if it's the specific Index error
      if (e.message?.includes("index")) {
        toast({ 
          variant: "destructive", 
          title: "Index Required", 
          description: "Please check the browser console and click the link to create the Firestore index." 
        });
      } else {
        toast({ 
          variant: "destructive", 
          title: "Fetch Error", 
          description: "Make sure you have at least one log in the database." 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

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
            <Button size="sm" onClick={() => fetchLogs(searchUser)} className="bg-purple-600 hover:bg-purple-700">
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
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin h-6 w-6 mx-auto text-purple-600" /></TableCell></TableRow>
              ) : logs.length > 0 ? (
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
                    <p>No activity logs found for this query.</p>
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
