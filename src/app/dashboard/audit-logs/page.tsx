'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, limit, getDocs, writeBatch, doc } from 'firebase/firestore'; 
import { db } from '@/firebase';
import { 
  History, 
  Loader2, 
  ShieldAlert, 
  Search, 
  Filter, 
  Trash2,
  Calendar
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from '@/hooks/use-session'; // 🟢 Import Hook

export default function AuditLogsPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // 1. Auth & Session Management
  const { user, loading: sessionLoading } = useSession(true);

  // 2. Local State
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Selection & Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // 3. Fetch Logs Effect
  useEffect(() => {
    const fetchLogs = async () => {
      // Wait for session to load
      if (sessionLoading || !user) return;

      // Permission Check
      const canView = user.role === 'admin' || 
                      user.role === 'super_admin' || 
                      user.permissions?.view_audit === true;

      if (!canView) {
        setLogsLoading(false);
        return;
      }

      try {
        // Fetch last 200 logs
        const q = query(
          collection(db, 'audit_logs'), 
          limit(200)
        );
        
        const snapshot = await getDocs(q);
        
        const fetchedLogs = snapshot.docs.map(doc => {
            const data = doc.data();
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
        toast({ variant: "destructive", title: "Error", description: "Could not load audit logs." });
      } finally {
        setLogsLoading(false);
      }
    };

    fetchLogs();
  }, [user, sessionLoading, toast]);

  // --- FILTERING LOGIC ---
  const filteredLogs = logs.filter(log => {
    // 1. Search Filter
    const matchesSearch = 
        (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.user && log.user.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // 2. Date Filter (YYYY-MM-DD)
    let matchesDate = true;
    if (dateFilter) {
        matchesDate = log.timestamp.startsWith(dateFilter);
    }

    return matchesSearch && matchesDate;
  });

  // --- SELECTION HANDLERS ---
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLogs.length && filteredLogs.length > 0) {
        setSelectedIds(new Set()); // Deselect All
    } else {
        setSelectedIds(new Set(filteredLogs.map(l => l.id))); // Select All Visible
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // --- BULK DELETE ---
  const handleDeleteSelected = async () => {
    if (!isAdmin) return;
    if (!confirm(`Permanently delete ${selectedIds.size} logs?`)) return;

    setIsDeleting(true);
    try {
        const batch = writeBatch(db);
        selectedIds.forEach(id => {
            const ref = doc(db, 'audit_logs', id);
            batch.delete(ref);
        });

        await batch.commit();

        toast({ title: "Success", description: `Deleted ${selectedIds.size} logs.` });
        
        // Update Local State
        setLogs(prev => prev.filter(l => !selectedIds.has(l.id)));
        setSelectedIds(new Set());

    } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "Error", description: "Failed to delete logs." });
    } finally {
        setIsDeleting(false);
    }
  };

  // --- LOADING STATE (Session or Data) ---
  if (sessionLoading || (logsLoading && user)) {
    return (
      <div className="h-[80vh] w-full flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary/30" />
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
            </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Return to Dashboard
        </Button>
      </div>
    );
  }

  // --- MAIN UI ---
  return (
    <div className="p-8 space-y-8 bg-slate-50/30 min-h-screen max-w-7xl mx-auto">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
                <History className="h-8 w-8 text-primary" /> System Activity
            </h1>
            <p className="text-slate-500 text-sm">Comprehensive log of all administrative actions.</p>
        </div>
        
        {/* FILTERS & ACTIONS */}
        <div className="flex flex-wrap items-center gap-2">
            {isAdmin && selectedIds.size > 0 && (
                <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleDeleteSelected} 
                    disabled={isDeleting}
                    className="mr-2 animate-in fade-in slide-in-from-right-4"
                >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete ({selectedIds.size})
                </Button>
            )}

            <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                    type="date"
                    className="pl-9 w-[160px] bg-white text-xs font-bold uppercase text-slate-600 h-10"
                    value={dateFilter}
                    onChange={(e) => { setDateFilter(e.target.value); setSelectedIds(new Set()); }}
                />
            </div>

            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                    placeholder="Search logs..." 
                    className="pl-9 w-[200px] bg-white h-10" 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setSelectedIds(new Set()); }}
                />
            </div>
            
            {(searchTerm || dateFilter) && (
                <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(''); setDateFilter(''); }} title="Clear Filters">
                    <Filter className="h-4 w-4 text-red-400" />
                </Button>
            )}
        </div>
      </div>

      {/* LOGS TABLE */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="bg-slate-50/50">
                        {/* Checkbox Column (Admin Only) */}
                        {isAdmin && (
                            <TableHead className="w-[50px] text-center">
                                <Checkbox 
                                    checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                        )}
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
                            <TableCell colSpan={isAdmin ? 6 : 5} className="h-32 text-center text-slate-400">
                                <div className="flex flex-col items-center gap-2">
                                    <Search className="h-8 w-8 opacity-20" />
                                    <span>No activity found matching filters.</span>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredLogs.map((log) => (
                            <TableRow 
                                key={log.id} 
                                className={`group hover:bg-slate-50 transition-colors ${selectedIds.has(log.id) ? 'bg-primary/5' : ''}`}
                            >
                                {/* Checkbox Cell */}
                                {isAdmin && (
                                    <TableCell className="text-center">
                                        <Checkbox 
                                            checked={selectedIds.has(log.id)}
                                            onCheckedChange={() => toggleSelect(log.id)}
                                        />
                                    </TableCell>
                                )}

                                <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        {new Date(log.timestamp).toLocaleString([], { 
                                            year: 'numeric', month: 'short', day: '2-digit', 
                                            hour: '2-digit', minute:'2-digit' 
                                        })}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="h-7 w-7 rounded-lg bg-primary/5 flex items-center justify-center text-[10px] font-bold text-primary uppercase border border-primary/10">
                                            {log.user?.[0] || '?'}
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700">{log.user || 'System'}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wide bg-white whitespace-nowrap">
                                        {log.action || 'Unknown'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-slate-600 max-w-md truncate" title={log.details}>
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
            </div>
        </CardContent>
      </Card>
      
      <div className="text-right text-xs text-slate-400">
          Showing {filteredLogs.length} records
      </div>
    </div>
  );
}
