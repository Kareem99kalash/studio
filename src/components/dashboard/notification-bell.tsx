'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { Bell, CheckCheck, Info, AlertTriangle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export function NotificationBell({ user }: { user: any }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // 1. Listen to recent notifications (Limit to 20 for performance)
    const q = query(
      collection(db, 'notifications'), 
      orderBy('createdAt', 'desc'), 
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allNotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // 2. Filter: Is this message for ME?
      // Matches 'all', my specific role, or my exact username
      const myNotes = allNotes.filter((n: any) => {
        const target = n.target || 'all';
        return (
          target === 'all' || 
          target.toLowerCase() === user.role?.toLowerCase() || 
          target.toLowerCase() === user.username?.toLowerCase()
        );
      });

      // 3. Simple "Read" Check (Uses Local Storage to remember what you've seen)
      const readIds = JSON.parse(localStorage.getItem('geo_read_notes') || '[]');
      const unread = myNotes.filter(n => !readIds.includes(n.id)).length;

      setNotifications(myNotes);
      setUnreadCount(unread);
    });

    return () => unsub();
  }, [user]);

  const markAllRead = () => {
    const ids = notifications.map(n => n.id);
    localStorage.setItem('geo_read_notes', JSON.stringify(ids));
    setUnreadCount(0);
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if(open) markAllRead(); }}>
      <PopoverTrigger asChild>
        <button className="text-slate-400 hover:text-white transition-colors relative outline-none p-1">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-[#0f172a] animate-pulse"></span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-slate-200 shadow-xl mr-4" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-bold text-sm text-slate-800">Notifications</h4>
          {unreadCount > 0 && <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">{unreadCount} New</Badge>}
        </div>
        <ScrollArea className="h-[320px]">
          {notifications.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {notifications.map((note) => (
                <div key={note.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-3 items-start group">
                  <div className={`mt-1 p-1.5 rounded-full shrink-0 ${note.type === 'alert' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                    {note.type === 'alert' ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                       <p className="text-sm font-semibold text-slate-800 leading-none mb-1">{note.title}</p>
                       <span className="text-[9px] text-slate-400 whitespace-nowrap ml-2">{new Date(note.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{note.message}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
              <CheckCheck className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-xs font-medium">No new notifications</p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
