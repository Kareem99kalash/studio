'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Users, LayoutGrid, LogOut, UploadCloud, SlidersHorizontal, Ticket } from "lucide-react";
import Link from "next/link";
import { doc, onSnapshot } from 'firebase/firestore'; // Added for real-time check
import { db } from '@/firebase'; // Ensure this points to your firebase config
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [isAuth, setIsAuth] = useState(false);

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

      // 🛡️ SECURITY KILL-SWITCH: Real-time listener
      // This monitors the specific user document. If it's deleted, they are logged out.
      const userRef = doc(db, 'users', parsedUser.username);
      const unsub = onSnapshot(userRef, (docSnap) => {
        if (!docSnap.exists()) {
          console.warn("User account no longer exists. Terminating session...");
          localStorage.removeItem('geo_user');
          window.location.href = '/'; 
        }
      });

      return () => unsub(); // Cleanup listener when component unmounts
    } catch (e) {
      window.location.href = '/';
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('geo_user');
    window.location.href = '/'; 
  };

  if (!isAuth || !user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Verifying Authorization</p>
      </div>
    );
  }

  const isAdmin = user.role === 'Admin';
  const isManager = user.role === 'Manager';

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Logo className="size-6 text-purple-600" />
            <span className="font-bold text-lg tracking-tight">GeoCoverage</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {/* Dashboard Access */}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                <Link href="/dashboard"><LayoutGrid className="size-4" /><span>Dashboard</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Admin or Manager Access: User Management */}
            {(isAdmin || isManager) && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard/user-management'}>
                  <Link href="/dashboard/user-management"><Users className="size-4" /><span>Users</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* Admin Exclusive: Thresholds and Cities */}
            {isAdmin && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-thresholds'}>
                    <Link href="/dashboard/city-thresholds"><SlidersHorizontal className="size-4" /><span>Thresholds</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-management'}>
                    <Link href="/dashboard/city-management"><UploadCloud className="size-4" /><span>Cities</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}

            {/* Global Access: Ticket System */}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/dashboard/tickets'}>
                <Link href="/dashboard/tickets"><Ticket className="size-4" /><span>Tickets</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} className="text-red-600 hover:text-red-700">
                <LogOut className="size-4" />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4 bg-white sticky top-0 z-10">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">{user.role}</p>
            </div>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-purple-100 text-purple-700 font-bold">
                {user.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
