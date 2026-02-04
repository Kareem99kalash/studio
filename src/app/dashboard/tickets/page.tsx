'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, updateDoc, doc, orderBy, deleteDoc } from 'firebase/firestore'; // Added deleteDoc
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, CheckCircle, Clock, AlertCircle, Loader2, FileSpreadsheet, Download, Trash2 } from 'lucide-react';

export default function TicketsPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachedFile, setAttachedFile] = useState<{name: string, content: string} | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (stored) setUser(JSON.parse(stored));
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // --- 📥 DOWNLOAD LOGIC ---
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
    toast({ title: "Download Started" });
  };

  // --- 🗑️ DELETE LOGIC ---
  const handleDeleteTicket = async (id: string) => {
    if (!confirm("Are you sure? This ticket will be permanently deleted from the database.")) return;
    try {
      await deleteDoc(doc(db, 'tickets', id));
      setTickets(prev => prev.filter(t => t.id !== id));
      toast({ title: "Ticket Deleted", description: "The record has been removed." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Could not delete ticket." });
    }
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

  const handleCreateTicket = async (e: any) => {
    e.preventDefault();
    const ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    const newTicket = {
      ticketId,
      title: e.target.title.value,
      description: e.target.description.value,
      type: e.target.type.value,
      status: 'New',
      creator: user.username,
      attachedFileName: attachedFile?.name || null,
      csvContent: attachedFile?.content || null,
      createdAt: new Date().toISOString()
    };
    await addDoc(collection(db, 'tickets'), newTicket);
    setIsCreating(false);
    setAttachedFile(null);
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

  if (loading) return <div className="h-full w-full flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">Request Tickets</h1>
            <p className="text-xs text-muted-foreground mt-1">Total Requests: {tickets.length}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ID..." className="pl-8 w-48 bg-white" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {(user?.role === 'Manager' || user?.role === 'Admin') && (
            <Button onClick={() => setIsCreating(true)} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="mr-2 h-4 w-4" /> New Request
            </Button>
          )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
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
                    <div className="text-[10px] text-muted-foreground">@{t.creator}</div>
                  </TableCell>
                  <TableCell>
                    {t.attachedFileName ? (
                        <div className="flex items-center gap-1 text-[10px] text-purple-600 font-bold">
                            <FileSpreadsheet className="size-3" /> {t.attachedFileName}
                        </div>
                    ) : <span className="text-[10px] text-slate-400">None</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={t.status === 'New' ? 'bg-blue-500' : t.status === 'Pending' ? 'bg-amber-500' : 'bg-green-500'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Admin Download & Delete */}
                      {user?.role === 'Admin' && (
                        <>
                          {t.csvContent && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => downloadAttachedCSV(t)}><Download className="size-3" /></Button>
                          )}
                          <Select onValueChange={(val) => updateStatus(t.id, val)}>
                            <SelectTrigger className="h-7 w-24 text-[10px]"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Solved">Solved</SelectItem></SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteTicket(t.id)}><Trash2 className="size-3" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CREATE MODAL ... same as before ... */}
    </div>
  );
}
