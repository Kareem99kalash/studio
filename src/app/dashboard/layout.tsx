'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from "next/link";
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'; 
import { db } from '@/firebase'; 
import { logoutAction } from '@/app/actions/auth'; // 🟢 Added Server Action
import { 
  LayoutDashboard, 
  Users, 
  Settings2, 
  Map as MapIcon, 
  History, 
  Ticket, 
  ShieldCheck, 
  LogOut, 
  Building2, 
  Search,
  Menu,
  X,
  Loader2
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from '@/components/ui/badge';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { logger } from '@/lib/logger';

// --- NAVIGATION CONFIG ---
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { label: 'User Roles', href: '/dashboard/user-management', icon: Users, permission: 'manage_users' },
  { label: 'Thresholds', href: '/dashboard/city-thresholds', icon: Settings2, permission: 'manage_thresholds' },
  { label: 'Cities', href: '/dashboard/city-management', icon: Building2, permission: 'view_cities' },
  { label: 'Activity Logs', href: '/dashboard/audit-logs', icon: History, permission: 'view_audit' },
  { label: 'Tickets', href: '/dashboard/tickets', icon: Ticket, permission: 'view_tickets' },
  { label: 'Admin Tools', href: '/dashboard/admin-tools', icon: ShieldCheck, permission: 'access_admin_tools' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true); // 🟢 Start in loading state
  const [openTicketCount, setOpenTicketCount] = useState(0);
  
  // Sidebar State (The "Curtain")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // --- 1. AUTHENTICATION & IDENTITY SYNC ---
  useEffect(() => {
    const syncSession = async () => {
      try {
        // Fetch identity from secure HTTP-only cookies
        const res = await fetch('/api/auth/me');
        
        if (!res.ok) {
          throw new Error("Unauthorized");
        }

        const sessionData = await res.json();
        setUser(sessionData.user);

        // 🟢 Setup real-time Firestore sync based on the ID from the cookie
        const userRef = doc(db, 'users', sessionData.user.uid);
        const unsub = onSnapshot(userRef, (docSnap) => {
          if (!docSnap.exists()) {
            handleLogout(); // Kill session if user is deleted from DB
          } else {
            const freshData = docSnap.data();
            setUser((prev: any) => ({ ...prev, ...freshData }));
          }
        });

        setLoading(false);
        return () => unsub();
      } catch (e) {
        logger.error("Auth", "Identity verification failed", e);
        window.location.href = '/'; 
      }
    };

    syncSession();
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  // --- 2. PERMISSION CHECKER ---
  const hasAccess = (permissionKey: string) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    if (permissionKey === 'view_dashboard') return true;
    if (user.permissions && user.permissions[permissionKey] === true) return true;
    return false;
  };

  // --- 3. TICKET COUNTER ---
  useEffect(() => {
    if (loading || !user) return;
    if (!hasAccess('view_tickets')) return;

    const q = query(
      collection(db, 'tickets'), 
      where('status', 'in', ['Pending', 'In Progress', 'Open', 'New'])
    );
    const unsub = onSnapshot(q, (snap) => setOpenTicketCount(snap.size));
    return () => unsub();
  }, [loading, user]);

  // --- 4. SEARCH LOGIC ---
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    const results = NAV_ITEMS.filter(item => 
      hasAccess(item.permission) && 
      item.label.toLowerCase().includes(lowerQuery)
    );
    
    setSearchResults(results);
    setIsSearchOpen(true);
  }, [searchQuery, user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logoutAction(); // 🟢 Clears Server-side Cookies
    localStorage.removeItem('geo_user'); // Clean up any old residue
    window.location.href = '/'; 
  };

  // 🛡️ 5. GUARD: SHOW LOADER DURING VERIFICATION
  if (loading || !user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white gap-6">
        <Loader2 className="animate-spin h-12 w-12 text-primary" />
        <p className="text-[10px] font-black text-primary uppercase tracking-[0.5em] animate-pulse">Synchronizing Session</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-body">
      
      {/* 🟢 TOP NAVIGATION BAR */}
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-12 shrink-0 sticky top-0 z-[100] shadow-sm">
        
        {/* LEFT: HAMBURGER (Mobile) & LOGO */}
        <div className="flex items-center gap-6">
          
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-primary hover:bg-slate-50 rounded-none transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>

          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-primary rounded-none flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg">
              <MapIcon className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl text-primary leading-none tracking-tighter uppercase italic">GeoCoverage</span>
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 hidden sm:block">
                 {user.role === 'admin' ? 'Strategic Intelligence' : 'Field Operator'}
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-2 ml-10">
            {NAV_ITEMS.map((item) => {
              if (!hasAccess(item.permission)) return null;
              
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`
                    relative px-4 py-2 rounded-none text-[11px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-2
                    ${isActive ? 'text-primary' : 'text-slate-400 hover:text-primary hover:bg-slate-50'}
                  `}
                >
                  {item.label}
                  {item.label === 'Tickets' && openTicketCount > 0 && (
                    <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-none bg-primary text-[8px] font-black text-white">
                      {openTicketCount}
                    </span>
                  )}
                  {isActive && <span className="absolute bottom-[-24px] left-0 w-full h-[3px] bg-primary" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* RIGHT: SEARCH & PROFILE */}
        <div className="flex items-center gap-6">
          
          <div className="relative hidden md:block" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="GLOBAL SEARCH"
                className="w-72 h-10 pl-10 bg-slate-50 border-slate-200 text-primary focus:bg-white focus:border-primary rounded-none placeholder:text-slate-300 transition-all font-black text-[10px] tracking-widest"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if(searchQuery) setIsSearchOpen(true) }}
              />
            </div>

            {isSearchOpen && (
              <div className="absolute top-full right-0 mt-4 w-80 bg-white rounded-none shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
                <div className="p-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-3 py-2 border-b border-slate-50 mb-2">Navigation Matrix</p>
                  {searchResults.length > 0 ? (
                    searchResults.map((res) => (
                      <Link 
                        key={res.href} 
                        href={res.href} 
                        className="flex items-center gap-4 px-4 py-3 text-[11px] font-bold text-primary hover:bg-slate-50 rounded-none transition-colors uppercase tracking-wider"
                        onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                      >
                        <res.icon className="h-4 w-4 text-slate-400" />
                        {res.label}
                      </Link>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">
                      Zero matching coordinates.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-8 w-[1px] bg-slate-200 mx-2 hidden md:block" />

          <NotificationBell user={user} />

          <HoverCard openDelay={200} closeDelay={200}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-4 cursor-pointer group pl-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-primary uppercase tracking-tighter leading-none group-hover:italic transition-all">
                    {user.username}
                  </p>
                  <p className="text-[9px] text-slate-400 font-black uppercase mt-1 tracking-widest group-hover:text-primary transition-colors">
                    {user.role === 'admin' ? 'Command' : 'Field'}
                  </p>
                </div>
                <Avatar className="h-10 w-10 border-2 border-slate-200 rounded-none group-hover:border-primary transition-all shadow-md">
                  <AvatarFallback className="bg-primary text-white font-black rounded-none uppercase">
                    {user.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </HoverCardTrigger>
            
            <HoverCardContent align="end" className="w-80 p-0 overflow-hidden border-slate-200 shadow-2xl rounded-none mt-4">
              <div className="bg-slate-50 p-6 border-b border-slate-100 flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-white shadow-lg rounded-none">
                  <AvatarFallback className="bg-primary text-white font-black text-xl rounded-none">
                    {user.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-black text-primary text-base uppercase tracking-tighter">{user.username}</h4>
                  <Badge className="mt-2 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-none px-2 py-0.5">
                    {user.role === 'admin' ? 'Strategic Command' : 'Active Personnel'}
                  </Badge>
                </div>
              </div>
              
              <div className="p-6">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Privilege Clearance</p>
                <div className="flex flex-wrap gap-2">
                  {user.role === 'admin' ? (
                    <Badge className="bg-slate-900 text-white rounded-none font-black text-[9px] uppercase tracking-widest px-2 py-1">
                      <ShieldCheck className="h-3 w-3 mr-2" /> Level 10 Clearance
                    </Badge>
                  ) : user.permissions && Object.keys(user.permissions).length > 0 ? (
                    Object.entries(user.permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k} className="inline-flex items-center px-2 py-1 rounded-none bg-slate-50 text-primary text-[9px] font-black uppercase tracking-widest border border-slate-200">
                          {k.replace(/_/g, ' ')}
                        </span>
                      ))
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 italic uppercase tracking-widest">Base Access Only</span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-100">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-red-600 hover:text-white hover:bg-red-600 h-10 text-[10px] font-black uppercase tracking-[0.2em] rounded-none transition-all"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-3" /> Terminate Session
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>

        </div>
      </header>

      {/* 🟢 SIDEBAR DRAWER (THE "CURTAIN" for Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-primary/20 backdrop-blur-md z-[110] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`
        fixed top-0 left-0 h-full w-[300px] bg-white z-[120] shadow-2xl transform transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] lg:hidden border-r border-slate-100
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-20 flex items-center justify-between px-8 border-b border-slate-50 bg-white">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-none flex items-center justify-center shadow-lg">
                  <MapIcon className="h-6 w-6 text-white" />
              </div>
              <span className="font-black text-xl text-primary tracking-tighter uppercase italic">GeoCoverage</span>
           </div>
           <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-300 hover:text-primary transition-colors">
              <X className="h-6 w-6" />
           </button>
        </div>

        <div className="p-6 space-y-1 overflow-y-auto">
           <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em] mb-6 px-4">Command Menu</p>
           {NAV_ITEMS.map((item) => {
              if (!hasAccess(item.permission)) return null;
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`
                    flex items-center gap-5 px-6 py-4 rounded-none text-[11px] font-black uppercase tracking-widest transition-all
                    ${isActive 
                      ? 'bg-primary text-white shadow-xl shadow-primary/20'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-primary'
                    }
                  `}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {item.label}
                  {item.label === 'Tickets' && openTicketCount > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 px-1.5 items-center justify-center rounded-none bg-white text-[9px] font-black text-primary">
                      {openTicketCount}
                    </span>
                  )}
                </Link>
              )
           })}
        </div>

        <div className="absolute bottom-10 left-0 w-full px-8">
           <div className="bg-slate-50 p-6 rounded-none border border-slate-100 flex items-center gap-4 group">
                 <Avatar className="h-12 w-12 rounded-none border-2 border-white shadow-md group-hover:border-primary transition-all">
                    <AvatarFallback className="bg-primary text-white font-black">
                        {user.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 overflow-hidden">
                    <div className="font-black text-xs text-primary truncate uppercase tracking-tighter">{user.username}</div>
                    <Badge className="text-[8px] px-1.5 h-4 bg-white border-slate-200 text-slate-400 rounded-none uppercase font-black tracking-widest mt-1">
                      {user.role}
                    </Badge>
                 </div>
                 <button onClick={handleLogout} className="text-slate-300 hover:text-red-500 transition-colors">
                    <LogOut className="h-5 w-5" />
                 </button>
            </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
        {children}
      </main>

    </div>
  );
}
