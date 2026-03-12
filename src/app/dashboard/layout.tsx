'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from "next/link";
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db, auth as firebaseAuth } from '@/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { logoutAction } from '@/app/actions/auth';
import { useTheme } from 'next-themes';
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
  Loader2,
  BookOpen,
  Sun,
  Moon
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
import { PERMISSIONS, hasPermission } from '@/lib/permissions';

// --- NAVIGATION CONFIG ---
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD.VIEW },
  { label: 'User Roles', href: '/dashboard/user-management', icon: Users, permission: PERMISSIONS.USER_MANAGEMENT.VIEW },
  { label: 'Thresholds', href: '/dashboard/city-thresholds', icon: Settings2, permission: PERMISSIONS.CITY_THRESHOLDS.VIEW },
  { label: 'Cities', href: '/dashboard/city-management', icon: Building2, permission: PERMISSIONS.CITY_MANAGEMENT.VIEW },
  { label: 'Activity Logs', href: '/dashboard/audit-logs', icon: History, permission: PERMISSIONS.AUDIT_LOGS.VIEW },
  { label: 'Tickets', href: '/dashboard/tickets', icon: Ticket, permission: PERMISSIONS.TICKETS.VIEW },
  { label: 'Admin Tools', href: '/dashboard/admin-tools', icon: ShieldCheck, permission: PERMISSIONS.ADMIN_TOOLS.VIEW },
  { label: 'Documentation', href: '/dashboard/documentation', icon: BookOpen, permission: PERMISSIONS.DOCUMENTATION.VIEW },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  
  // Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Prevent hydration mismatch for theme icon
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const syncSession = async () => {
      try {
        const res = await fetch('/api/auth/me');

        if (!res.ok) {
          throw new Error("Unauthorized");
        }

        const sessionData = await res.json();

        if (sessionData.customToken) {
          const currentFbUser = firebaseAuth.currentUser;
          if (!currentFbUser || currentFbUser.uid !== sessionData.user.uid) {
            try {
              await signInWithCustomToken(firebaseAuth, sessionData.customToken);
            } catch (authErr) {
              logger.error("Auth", "Firebase Client SDK sync failed", authErr);
            }
          }
        }

        setUser(sessionData.user);

        const userRef = doc(db, 'users', sessionData.user.uid);
        const unsub = onSnapshot(
          userRef,
          (docSnap) => {
            if (!docSnap.exists()) {
              handleLogout();
            } else {
              setUser((prev: any) => ({ ...prev, ...docSnap.data() }));
            }
          },
          (err) => {
            logger.error("Auth", "User snapshot listener error", err);
          }
        );

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
  const checkAccess = (permissionKey: string) => {
    return hasPermission(user, permissionKey);
  };

  // --- 3. TICKET COUNTER ---
  useEffect(() => {
    if (loading || !user) return;
    if (!checkAccess(PERMISSIONS.TICKETS.VIEW)) return;

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
      checkAccess(item.permission) &&
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
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-primary/30" />
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] animate-pulse">Initializing Workspace</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-body">
      
      {/* 🟢 TOP NAVIGATION BAR */}
      <header className="h-16 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 z-[100] shadow-lg">
        
        {/* LEFT: HAMBURGER (Mobile) & LOGO */}
        <div className="flex items-center gap-6">
          
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center group-hover:shadow-lg group-hover:shadow-white/10 transition-all">
              <MapIcon className="h-5 w-5 text-slate-950" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg text-white leading-none tracking-tight">GeoCoverage</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.1em] mt-1 hidden sm:block">
                 {user.role === 'admin' ? 'Administrator Panel' : 'User Workspace'}
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 ml-8">
            {NAV_ITEMS.map((item) => {
              if (!checkAccess(item.permission)) return null;
              
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`
                    relative px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2
                    ${isActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}
                  `}
                >
                  {item.label}
                  {item.label === 'Tickets' && openTicketCount > 0 && (
                    <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-white text-[8px] font-bold text-slate-950">
                      {openTicketCount}
                    </span>
                  )}
                  {isActive && <span className="absolute bottom-[-14px] left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* RIGHT: SEARCH & PROFILE */}
        <div className="flex items-center gap-4">
          
          <div className="relative hidden md:block" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <Input 
                placeholder="Search resources..."
                className="w-64 h-9 pl-9 bg-white/5 border-transparent text-white focus:bg-white/10 focus:border-slate-700 rounded-xl placeholder:text-slate-600 transition-all font-medium text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if(searchQuery) setIsSearchOpen(true) }}
              />
            </div>

            {isSearchOpen && (
              <div className="absolute top-full right-0 mt-3 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                <div className="p-2">
                  <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest px-3 py-2">Quick Navigation</p>
                  {searchResults.length > 0 ? (
                    searchResults.map((res) => (
                      <Link 
                        key={res.href} 
                        href={res.href} 
                        className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary rounded-xl transition-colors"
                        onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                      >
                        <res.icon className="h-4 w-4 opacity-40" />
                        {res.label}
                      </Link>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-[10px] font-medium text-slate-300 dark:text-slate-600 italic">
                      No matching results found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-800 mx-2 hidden md:block" />

          {/* Dark Mode Toggle */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark mode"
          >
            {mounted && theme === 'dark' ? (
              <Sun className="h-5 w-5 transition-transform duration-300 rotate-0" />
            ) : (
              <Moon className="h-5 w-5 transition-transform duration-300 rotate-0" />
            )}
          </Button>

          <NotificationBell user={user} />

          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-3 cursor-pointer group pl-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-white leading-none group-hover:text-slate-300 transition-colors">
                    {user.username}
                  </p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 tracking-wider">
                    {user.role === 'admin' ? 'Admin' : 'User'}
                  </p>
                </div>
                <Avatar className="h-9 w-9 border border-slate-800 rounded-xl group-hover:border-slate-700 transition-all">
                  <AvatarFallback className="bg-white/10 text-white font-bold rounded-xl text-xs">
                    {user.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </HoverCardTrigger>
            
            <HoverCardContent align="end" className="w-72 p-0 overflow-hidden border-slate-100 dark:border-slate-800 shadow-2xl rounded-2xl mt-3 bg-white dark:bg-slate-900">
              <div className="bg-slate-50/50 dark:bg-slate-800/50 p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4">
                <Avatar className="h-12 w-12 border border-white dark:border-slate-700 shadow-sm rounded-xl">
                  <AvatarFallback className="bg-primary text-white dark:text-slate-900 font-bold text-lg rounded-xl">
                    {user.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{user.username}</h4>
                  <Badge className="mt-1 bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider rounded-md px-2 py-0 border-none shadow-none">
                    {user.role === 'admin' ? 'Full Administrator' : 'User Access'}
                  </Badge>
                </div>
              </div>
              
              <div className="p-5">
                <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-3">Permissions</p>
                <div className="flex flex-wrap gap-1.5">
                  {user.role === 'admin' ? (
                    <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-bold text-[9px] uppercase border-none shadow-none px-2">
                      <ShieldCheck className="h-3 w-3 mr-1.5 opacity-50" /> System Superuser
                    </Badge>
                  ) : user.permissions && Object.keys(user.permissions).length > 0 ? (
                    Object.entries(user.permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k} className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wide border border-slate-100 dark:border-slate-700">
                          {k.replace(/_/g, ' ')}
                        </span>
                      ))
                  ) : (
                    <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600 italic">Limited read access</span>
                  )}
                </div>
              </div>

              <div className="p-2 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 h-9 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3.5 w-3.5 mr-2.5 opacity-50" /> Sign Out
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>

        </div>
      </header>

      {/* 🟢 SIDEBAR DRAWER (THE "CURTAIN" for Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[110] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`
        fixed top-0 left-0 h-full w-[280px] bg-slate-950 z-[120] shadow-2xl transform transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] lg:hidden border-r border-slate-800
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center">
                  <MapIcon className="h-5 w-5 text-slate-950" />
              </div>
              <span className="font-bold text-lg text-white tracking-tight">GeoCoverage</span>
           </div>
           <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:text-white transition-colors">
              <X className="h-5 w-5" />
           </button>
        </div>

        <div className="p-4 space-y-1 overflow-y-auto">
           <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-4 px-4">Menu</p>
           {NAV_ITEMS.map((item) => {
              if (!checkAccess(item.permission)) return null;
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`
                    flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-bold transition-all
                    ${isActive 
                      ? 'bg-white text-slate-950 shadow-lg shadow-white/10'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }
                  `}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? 'text-slate-950' : 'text-slate-500'}`} />
                  {item.label}
                  {item.label === 'Tickets' && openTicketCount > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-white text-[9px] font-bold text-slate-950">
                      {openTicketCount}
                    </span>
                  )}
                </Link>
              )
           })}
        </div>

        <div className="absolute bottom-8 left-0 w-full px-6">
           <div className="bg-white/5 p-4 rounded-2xl border border-slate-800 flex items-center gap-3 group">
                 <Avatar className="h-10 w-10 rounded-xl border border-white shadow-sm group-hover:border-primary/20 transition-all">
                    <AvatarFallback className="bg-white/10 text-white font-bold rounded-xl text-xs">
                        {user.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 overflow-hidden">
                    <div className="font-bold text-xs text-white truncate tracking-tight">{user.username}</div>
                    <Badge className="text-[8px] px-1.5 h-4 bg-white/10 border-none text-slate-400 rounded-md uppercase font-bold tracking-wide mt-1 shadow-none">
                      {user.role}
                    </Badge>
                 </div>
                 <button onClick={handleLogout} className="text-slate-500 hover:text-red-500 transition-colors">
                    <LogOut className="h-4 w-4" />
                 </button>
            </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 lg:p-8 animate-in fade-in duration-500 bg-background">
        {children}
      </main>

    </div>
  );
}
