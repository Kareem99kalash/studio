'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, limit, getDocs } from 'firebase/firestore'; // Removed orderBy import
import { db } from '@/firebase';
import { 
  History, 
  Loader2, 
  ShieldAlert, 
  Search, 
  Filter, 
  Calendar
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AuditLogsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const initPage = async () => {
      // 1. AUTH CHECK
      const stored = localStorage.getItem('geo_user');
      if (!stored) {
        router.push('/');
        return;
      }
      
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);

      // 2. PERMISSION CHECK
      const canView = parsedUser.role === 'admin' || 
                      parsedUser.role === 'super_admin' || 
                      parsedUser.permissions?.view_audit === true;

      if (!canView) {
        setLoading(false);
        return;
      }

      // 3. FETCH LOGS (FIXED)
      try {
        // We removed orderBy('timestamp') to prevent Firestore from hiding 
        // documents that might use 'createdAt' or have missing fields.
        const q = query(
          collection(db, 'audit_logs'), 
          limit(50)
        );
        
        const snapshot = await getDocs(q);
        
        // Process and Normalize Data
        const fetchedLogs = snapshot.docs.map(doc => {
            const data = doc.data();
            // Fallback: Check multiple possible names for the date field
            const timeVal = data.timestamp || data.createdAt || data.date || new Date().toISOString();
            
            return { 
                id: doc.id, 
                ...data, 
                timestamp: timeVal 
            };
        });

        // Client-Side Sort (Newest First)
        fetchedLogs.sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setLogs(fetchedLogs);
      } catch (error) {
        console.error("Failed to load logs", error);
      } finally {
        setLoading(false);
      }
    };

    initPage();
  }, [router]);

  // --- LOADING STATE ---
  if (loading) {
    return (
      <div className="h-[80vh] w-full flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  // --- ACCESS DENIED STATE ---
  if (!user || (!user.permissions?.view_audit && user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <div className="h-[80vh] w-full flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-red-50 p-4 rounded-full">
            <ShieldAlert className="h-12 w-12 text-red-600" />
        </div>
        <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-800">Access Restricted</h2>
            <p className="text-slate-500 max-w-md">
                Your account ({user?.username}) does not have permission to view system audit logs. 
                Contact a System Administrator to request the <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">view_audit</span> capability.
            </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Return to Dashboard
        </Button>
      </div>
    );
  }

  // --- MAIN CONTENT ---
  const filteredLogs = logs.filter(log => 
    (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (log.user && log.user.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <History className="h-6 w-6 text-indigo-600" /> System Activity
            </h1>
            <p className="text-slate-500 text-sm"> comprehensive log of all administrative actions.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                    placeholder="Search logs..." 
                    className="pl-9 w-[250px] bg-white" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline" size="icon">
                <Filter className="h-4 w-4 text-slate-600" />
            </Button>
        </div>
      </div>

      {/* LOGS TABLE */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow className="bg-slate-50/50">
                        <TableHead className="w-[180px]">Timestamp</TableHead>
                        <TableHead className="w-[150px]">User</TableHead>
                        <TableHead className="w-[150px]">Action</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredLogs.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center text-slate-400">
                                No activity found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredLogs.map((log) => (
                            <TableRow key={log.id} className="group hover:bg-slate-50 transition-colors">
                                <TableCell className="font-mono text-xs text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-3 w-3 opacity-50" />
                                        {new Date(log.timestamp).toLocaleString()}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                                            {log.user?.[0]?.toUpperCase() || 'S'}
                                        </div>
                                        <span className="text-sm font-medium text-slate-700">{log.user || 'System'}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide bg-white">
                                        {log.action || 'Unknown'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-slate-600 max-w-md truncate" title={log.details}>
                                    {log.details || '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 shadow-none">
                                        Success
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
