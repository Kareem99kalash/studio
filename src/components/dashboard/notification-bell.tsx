'use client';

import { useState, useEffect } from 'react';
import { 
  Bell, 
  Trash2, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Loader2
} from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  writeBatch, 
  getDocs,
  deleteDoc,
  doc,
  orderBy
} from "firebase/firestore";
import { db } from "@/firebase";

// Helper to pick icons based on notification type
const getIcon = (type: string) => {
  switch (type) {
    case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'warning': return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <Info className="h-4 w-4 text-blue-500" />;
  }
};

export function NotificationBell({ user }: { user: any }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // 1. Listen to Notifications
  useEffect(() => {
    if (!user?.username) return;

    // Query notifications targeting this user
    const q = query(
      collection(db, 'notifications'),
      where('targetUser', '==', user.username),
      // Optional: Add orderBy if you have a composite index set up
      // orderBy('createdAt', 'desc') 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort manually to avoid needing a composite index immediately
      data.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setNotifications(data);
      setUnreadCount(data.length);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Clear All Logic (Batch Delete)
  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    setIsClearing(true);

    try {
      // Get all current notification docs for this user
      const q = query(
        collection(db, 'notifications'), 
        where('targetUser', '==', user.username)
      );
      const snapshot = await getDocs(q);

      // Create a batch operation
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Commit the batch delete
      await batch.commit();
      
      // UI will update automatically via the onSnapshot listener
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    } finally {
      setIsClearing(false);
      setIsOpen(false);
    }
  };

  // 3. Dismiss Single Notification
  const handleDismiss = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.error("Error deleting notification:", e);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-white hover:bg-slate-800">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse ring-2 ring-slate-900" />
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent align="end" className="w-80 p-0 shadow-xl border-slate-200 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            Notifications 
            {unreadCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-indigo-100 text-indigo-700">{unreadCount}</Badge>}
          </h4>
          
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-[10px] text-slate-500 hover:text-red-600 hover:bg-red-50 px-2"
              onClick={handleClearAll}
              disabled={isClearing}
            >
              {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1" /> Clear All</>}
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 py-12">
              <Bell className="h-8 w-8 opacity-20" />
              <p className="text-xs font-medium">No new notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((note) => (
                <div key={note.id} className="p-4 hover:bg-slate-50 transition-colors relative group">
                  <div className="flex gap-3 items-start">
                    <div className="mt-0.5 shrink-0">{getIcon(note.type)}</div>
                    <div className="space-y-1 pr-4">
                      <p className="text-sm font-medium text-slate-800 leading-tight">
                        {note.title}
                      </p>
                      <p className="text-xs text-slate-500 leading-snug">
                        {note.message}
                      </p>
                      <p className="text-[10px] text-slate-400 pt-1">
                        {note.createdAt ? new Date(note.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Single Dismiss Button (Visible on Hover) */}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 h-6 w-6 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDismiss(note.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
