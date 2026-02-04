'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, History, User, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchLogs = async (username?: string) => {
    setLoading(true);
    try {
      let q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(100));
      
      if (username) {
        q = query(
          collection(db, 'logs'), 
          where('username', '==', username.toLowerCase()), 
          orderBy('timestamp', 'desc')
        );
      }

      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch logs." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="text-purple-600" /> User Activity Audit
        </h1>
        <p className="text-sm text-muted-foreground">Monitor system changes and user actions.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="bg-white border-b">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <User className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by exact username..." 
                className="pl-8"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
              />
            </div>
            <Button onClick={() => fetchLogs(searchUser)} className="bg-purple-600">
              Search Activity
            </Button>
            <Button variant="outline" onClick={() => {setSearchUser(''); fetchLogs();}}>
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Date & Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10">Searching logs...</TableCell></TableRow>
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold text-sm">@{log.username}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-xs">{log.details}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    No activity found for this user.
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
