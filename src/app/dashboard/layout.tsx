'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from "next/link";
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'; 
import { db } from '@/firebase'; 
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
  Bell,
  Menu,
  X
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
  const [isAuth, setIsAuth] = useState(false);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  
  // Sidebar State (The "Curtain")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // --- 1. AUTHENTICATION ---
  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (!stored) {
      window.location.href = '/'; 
      return;
    }

    try {
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);
      setIsAuth(true);

      const userRef = doc(db, 'users', parsedUser.uid || parsedUser.username);
      const unsub = onSnapshot(userRef, (docSnap) => {
        if (!docSnap.exists()) {
          localStorage.removeItem('geo_user');
          window.location.href = '/'; 
        } else {
             const data = docSnap.data();
             if (JSON.stringify(data.permissions) !== JSON.stringify(parsedUser.permissions) || data.role !== parsedUser.role) {
                 const updated = { ...parsedUser, ...data };
                 localStorage.setItem('geo_user', JSON.stringify(updated));
                 setUser(updated);
             }
        }
      });
      return () => unsub(); 
    } catch (e) {
      window.location.href = '/';
    }
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
    if (!isAuth) return;
    if (!hasAccess('view_tickets')) return;

    const q = query(
      collection(db, 'tickets'), 
      where('status', 'in', ['Pending', 'In Progress', 'Open', 'New'])
    );
    const unsub = onSnapshot(q, (snap) => setOpenTicketCount(snap.size));
    return () => unsub();
  }, [isAuth, user]);

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

  const handleLogout = () => {
    localStorage.removeItem('geo_user');
    window.location.href = '/'; 
  };

  if (!isAuth || !user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Verifying Access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* 🟢 TOP NAVIGATION BAR */}
      <header className="h-16 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between px-4 lg:px-8 shrink-0 sticky top-0 z-50 shadow-md">
        
        {/* LEFT: HAMBURGER (Mobile) & LOGO */}
        <div className="flex items-center gap-4">
          
          {/* Mobile Toggle Button (Only visible on small screens) */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>

          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
              <MapIcon className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg text-white leading-none tracking-tight">GeoCoverage</span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider hidden sm:block">
                 {user.role === 'admin' ? 'System Administrator' : 'Workspace'}
              </span>
            </div>
          </Link>

          {/* DESKTOP NAV LINKS (Hidden on small screens) */}
          <nav className="hidden lg:flex items-center gap-1 ml-6">
            {NAV_ITEMS.map((item) => {
              if (!hasAccess(item.permission)) return null;
              
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`
                    relative px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2
                    ${isActive ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
                  `}
                >
                  {item.label}
                  {item.label === 'Tickets' && openTicketCount > 0 && (
                    <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                      {openTicketCount}
                    </span>
                  )}
                  {isActive && <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 rounded-full" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* RIGHT: SEARCH & PROFILE */}
        <div className="flex items-center gap-4">
          
          {/* SEARCH BAR (Hidden on mobile) */}
          <div className="relative hidden md:block" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Jump to page..." 
                className="w-64 h-9 pl-9 bg-slate-900 border-slate-700 text-slate-200 focus:bg-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-slate-600 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if(searchQuery) setIsSearchOpen(true) }}
              />
            </div>

            {/* SEARCH RESULTS DROPDOWN */}
            {isSearchOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                <div className="p-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1">Navigate To</p>
                  {searchResults.length > 0 ? (
                    searchResults.map((res) => (
                      <Link 
                        key={res.href} 
                        href={res.href} 
                        className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
                        onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                      >
                        <res.icon className="h-4 w-4 opacity-50" />
                        {res.label}
                      </Link>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-xs text-slate-400 italic">
                      No matching pages found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-800 mx-2 hidden md:block" />

          {/* NOTIFICATIONS */}
          <NotificationBell user={user} />

          {/* USER PROFILE HOVER CARD */}
          <HoverCard openDelay={200} closeDelay={200}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-3 cursor-pointer group pl-2">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors leading-none">
                    {user.username}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 group-hover:text-blue-400 transition-colors">
                    {user.role === 'admin' ? 'Admin' : user.role || 'User'}
                  </p>
                </div>
                <Avatar className="h-9 w-9 border-2 border-slate-700 group-hover:border-blue-500 transition-colors">
                  <AvatarFallback className="bg-slate-800 text-slate-200 font-bold">
                    {user.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </HoverCardTrigger>
            
            {/* HOVER CONTENT */}
            <HoverCardContent align="end" className="w-80 p-0 overflow-hidden border-slate-200 shadow-xl">
              <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center gap-3">
                <Avatar className="h-12 w-12 border border-white shadow-sm">
                  <AvatarFallback className="bg-blue-600 text-white font-bold text-lg">
                    {user.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{user.username}</h4>
                  <Badge variant="secondary" className="mt-1 bg-slate-200 text-slate-600 text-[10px] uppercase">
                    {user.role === 'admin' ? 'System Administrator' : user.role || 'Custom Role'}
                  </Badge>
                </div>
              </div>
              
              <div className="p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Active Permissions</p>
                <div className="flex flex-wrap gap-1.5">
                  {user.role === 'admin' ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Full System Access
                    </Badge>
                  ) : user.permissions && Object.keys(user.permissions).length > 0 ? (
                    Object.entries(user.permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k} className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200">
                          {k.replace(/_/g, ' ')}
                        </span>
                      ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">Read-only access</span>
                  )}
                </div>
              </div>

              <div className="p-2 bg-slate-50 border-t border-slate-100">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 h-8 text-xs"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3 w-3 mr-2" /> Sign Out
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>

        </div>
      </header>

      {/* 🟢 SIDEBAR DRAWER (THE "CURTAIN" for Mobile) */}
      {/* 1. Dark Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 2. Sliding Panel */}
      <div className={`
        fixed top-0 left-0 h-full w-[280px] bg-white z-[70] shadow-2xl transform transition-transform duration-300 ease-in-out lg:hidden
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 bg-slate-50">
           <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <MapIcon className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg text-slate-800 tracking-tight">GeoCoverage</span>
           </div>
           <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-red-500 transition-colors">
              <X className="h-5 w-5" />
           </button>
        </div>

        {/* Mobile Nav Links */}
        <div className="p-4 space-y-2 overflow-y-auto">
           {NAV_ITEMS.map((item) => {
              if (!hasAccess(item.permission)) return null;
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)} // Close on click
                  className={`
                    flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold transition-all
                    ${isActive 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                      : 'text-slate-600 hover:bg-slate-100'
                    }
                  `}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {item.label}
                  {item.label === 'Tickets' && openTicketCount > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                      {openTicketCount}
                    </span>
                  )}
                </Link>
              )
           })}
        </div>

        {/* Mobile User Info Footer */}
        <div className="absolute bottom-6 left-0 w-full px-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
                 <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-bold">
                        {user.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 overflow-hidden">
                    <div className="font-bold text-sm text-slate-800 truncate">{user.username}</div>
                    <Badge variant="outline" className="text-[10px] px-1 h-5 bg-white">{user.role}</Badge>
                 </div>
                 <button onClick={handleLogout} className="text-slate-400 hover:text-red-500">
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
