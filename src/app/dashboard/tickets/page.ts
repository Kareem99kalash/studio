'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, updateDoc, doc, where, orderBy } from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function TicketsPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (stored) setUser(JSON.parse(stored));
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleCreateTicket = async (e: any) => {
    e.preventDefault();
    const ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    const newTicket = {
      ticketId,
      title: e.target.title.value,
      type: e.target.type.value,
      status: 'New',
      creator: user.username,
      createdAt: new Date().toISOString()
    };
    await addDoc(collection(db, 'tickets'), newTicket);
    setIsCreating(false);
    fetchTickets();
    toast({ title: "Ticket Sent", description: `ID: ${ticketId}` });
  };

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, 'tickets', id), { status });
    fetchTickets();
  };

  const filteredTickets = tickets.filter(t => 
    t.ticketId.toLowerCase().includes(search.toLowerCase()) || 
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Request Tickets</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ID or Title..." className="pl-8 w-64" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {user?.role === 'Manager' && (
            <Button onClick={() => setIsCreating(true)} className="bg-purple-600"><Plus className="mr-2 h-4" /> New Request</Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Status</TableHead>
                {user?.role === 'Admin' && <TableHead>Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-bold text-xs">{t.ticketId}</TableCell>
                  <TableCell>{t.title}</TableCell>
                  <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                  <TableCell className="text-xs">@{t.creator}</TableCell>
                  <TableCell>
                    <Badge className={
                      t.status === 'New' ? 'bg-blue-500' : 
                      t.status === 'Pending' ? 'bg-amber-500' : 'bg-green-500'
                    }>
                      {t.status === 'New' && <Clock className="mr-1 h-3 w-3" />}
                      {t.status === 'Pending' && <AlertCircle className="mr-1 h-3 w-3" />}
                      {t.status === 'Solved' && <CheckCircle className="mr-1 h-3 w-3" />}
                      {t.status}
                    </Badge>
                  </TableCell>
                  {user?.role === 'Admin' && (
                    <TableCell>
                      <Select onValueChange={(val) => updateStatus(t.id, val)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue placeholder="Update" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Set Pending</SelectItem>
                          <SelectItem value="Solved">Solve</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Basic Create Ticket Form Overlay */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>Create Request</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCreateTicket} className="space-y-4">
                <Input name="title" placeholder="Request Title" required />
                <Select name="type" defaultValue="General">
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                      <SelectItem value="DeleteUser">Delete User</SelectItem>
                      <SelectItem value="AddZone">Add New Zones</SelectItem>
                      <SelectItem value="General">General Question</SelectItem>
                   </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 bg-purple-600">Send Ticket</Button>
                  <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}