'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; 
import { collection, addDoc, getDocs, query, updateDoc, doc, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Loader2, FileSpreadsheet, Download, Trash2, ShieldAlert, ChevronLeft, HelpCircle } from 'lucide-react';
import { useSession } from '@/hooks/use-session'; // 🟢 Import Hook Correctly
import Link from 'next/link';

export default function TicketsPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // 1. Auth & Session Management
  const { user, loading: sessionLoading } = useSession(true);

  // 2. Local State
  const [tickets, setTickets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [attachedFile, setAttachedFile] = useState<{name: string, content: string} | null>(null);

  // Form State
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [newTicketDesc, setNewTicketDesc] = useState('');
  const [newTicketType, setNewTicketType] = useState('General');

  // 3. Fetch Data
  const fetchTickets = async () => {
    try {
      const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { 
      console.error(e); 
      toast({ variant: "destructive", title: "Error", description: "Failed to load tickets." });
    } finally { 
      setDataLoading(false); 
    }
  };

  useEffect(() => {
    if (user) fetchTickets();
  }, [user]);

  // Loading State
  if (sessionLoading || dataLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
      </div>
    );
  }

  // --- 🛡️ PERMISSION HELPERS ---
  const canCreate = user?.permissions?.create_tickets || user?.role === 'admin' || user?.role === 'manager';
  const canManage = user?.permissions?.manage_tickets || user?.role === 'admin';

  // --- 🛡️ RESTRICTED ACCESS UI ---
  if (user && !user.permissions?.view_tickets && user.role !== 'admin' && user.role !== 'manager') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full text-center shadow-lg border-t-4 border-t-red-500">
          <CardContent className="pt-10 pb-10 space-y-4">
            <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
              <p className="text-sm text-slate-500">
                You do not have permission to view tickets. Contact your administrator.
              </p>
            </div>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard')}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- HANDLERS ---

  const downloadAttachedCSV = (ticket: any) => {
    if (!ticket.csvContent) return;
    const blob = new Blob([ticket.csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = ticket.attachedFileName || `ticket_${ticket.ticketId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteTicket = async (id: string) => {
    if (!canManage) return; 
    if (!confirm("Permanently delete this ticket?")) return;
    try {
      await deleteDoc(doc(db, 'tickets', id));
      setTickets(prev => prev.filter(t => t.id !== id));
      toast({ title: "Ticket Deleted" });
    } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedFile({ name: file.name, content: event.target?.result as string });
      toast({ title: "File Attached", description: file.name });
    };
    reader.readAsText(file);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketTitle || !newTicketDesc) return;

    const ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    const newTicket = {
      ticketId,
      title: newTicketTitle,
      description: newTicketDesc,
      type: newTicketType,
      status: 'New',
      creator: user.username || 'Unknown',
      attachedFileName: attachedFile?.name || null,
      csvContent: attachedFile?.content || null,
      createdAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, 'tickets'), newTicket);
    setIsCreating(false);
    setAttachedFile(null);
    setNewTicketTitle(''); setNewTicketDesc('');
    fetchTickets();
    toast({ title: "Ticket Sent", description: `ID: ${ticketId}` });
  };

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, 'tickets', id), { status });
    fetchTickets();
  };

  const filteredTickets = tickets.filter(t => 
    t.ticketId?.toLowerCase().includes(search.toLowerCase()) || 
    t.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 bg-slate-50/30 min-h-full max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
               Support Tickets
               <Link href="/dashboard/documentation#operational">
                  <HelpCircle className="h-5 w-5 text-slate-300 hover:text-primary transition-colors cursor-help" />
               </Link>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Submit zone additions or system requests.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ID..." className="pl-8 w-48 bg-white" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          
          {canCreate && (
            <Button onClick={() => setIsCreating(true)} className="bg-primary hover:bg-primary/90 font-bold rounded-xl h-11 px-6 shadow-lg shadow-primary/20 transition-all">
              <Plus className="mr-2 h-5 w-5" /> New Ticket
            </Button>
          )}
        </div>
      </div>

      <Card className="shadow-xl shadow-slate-200/50 border-slate-100 rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map(t => (
                <TableRow key={t.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-mono font-bold text-xs">{t.ticketId}</TableCell>
                  <TableCell>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[10px] text-muted-foreground">by @{t.creator}</div>
                  </TableCell>
                  <TableCell>
                    {t.attachedFileName ? (
                        <div className="flex items-center gap-2 text-[10px] text-primary font-bold uppercase tracking-wider bg-primary/5 px-2 py-1 rounded-md border border-primary/10 w-fit">
                            <FileSpreadsheet className="size-3" /> {t.attachedFileName}
                        </div>
                    ) : <span className="text-[10px] text-slate-300">None</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={t.status === 'New' ? 'bg-blue-500' : t.status === 'Pending' ? 'bg-amber-500' : 'bg-green-500'}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      
                      {t.csvContent && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => downloadAttachedCSV(t)}>
                            <Download className="size-3" />
                        </Button>
                      )}

                      {(canCreate || canManage) && (
                        <Select onValueChange={(val) => updateStatus(t.id, val)} defaultValue={t.status}>
                            <SelectTrigger className="h-7 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="New">New</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="In Progress">In Progress</SelectItem>
                                <SelectItem value="Resolved">Resolved</SelectItem>
                            </SelectContent>
                        </Select>
                      )}
                      
                      {canManage && (
                         <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteTicket(t.id)}>
                            <Trash2 className="size-3" />
                         </Button>
                      )}

                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CREATE MODAL */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-lg shadow-2xl border-t-4 border-t-primary rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100"><CardTitle className="text-xl">Create New Ticket</CardTitle></CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleCreateTicket} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ticket Subject</label>
                    <Input className="h-12 rounded-xl bg-slate-50/50" placeholder="e.g. Add 15 new zones to Erbil" value={newTicketTitle} onChange={(e) => setNewTicketTitle(e.target.value)} required />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                    <Select value={newTicketType} onValueChange={setNewTicketType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="AddZone">Add New Zones</SelectItem>
                            <SelectItem value="General">General Question</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                    <Textarea value={newTicketDesc} onChange={(e) => setNewTicketDesc(e.target.value)} required />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Attachment</label>
                    <Input type="file" accept=".csv" onChange={handleFileChange} className="text-xs" />
                </div>
                <div className="flex gap-3 pt-6 border-t border-slate-50">
                  <Button type="submit" className="flex-1 h-12 bg-primary hover:bg-primary/90 rounded-xl font-bold shadow-lg shadow-primary/20">Submit Ticket</Button>
                  <Button type="button" variant="outline" className="h-12 rounded-xl px-8" onClick={() => setIsCreating(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
