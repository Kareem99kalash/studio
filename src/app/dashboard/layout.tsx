'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Users, LayoutGrid, LogOut, UploadCloud, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    // 1. Check local storage for the user we saved at login
    const stored = localStorage.getItem('geo_user');
    if (!stored) {
      // Hard redirect to login if no session found
      window.location.href = '/'; 
    } else {
      try {
        setUser(JSON.parse(stored));
        setIsAuth(true);
      } catch (e) {
        window.location.href = '/';
      }
    }
  }, []);

  // Show a clean loading state while checking storage to prevent "glitching"
  if (!isAuth) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Logo className="size-6 text-primary" />
            <span className="font-bold text-lg">GeoCoverage</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                <Link href="/dashboard"><LayoutGrid /><span>Dashboard</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {user?.role === 'Admin' && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-thresholds'}>
                    <Link href="/dashboard/city-thresholds"><SlidersHorizontal /><span>Thresholds</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/dashboard/user-management'}>
                    <Link href="/dashboard/user-management"><Users /><span>Users</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-management'}>
                    <Link href="/dashboard/city-management"><UploadCloud /><span>Cities</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <SidebarMenuButton 
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => { localStorage.clear(); window.location.href = '/'; }}
          >
            <LogOut /><span>Logout</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4 bg-white sticky top-0 z-10">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium">{user?.name}</span>
            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded uppercase font-bold text-slate-500">{user?.role}</span>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
