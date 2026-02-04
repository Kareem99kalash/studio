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
    const stored = localStorage.getItem('geo_user');
    if (!stored) {
      window.location.href = '/'; 
    } else {
      setUser(JSON.parse(stored));
      setIsAuth(true);
    }
  }, []);

  if (!isAuth) return null;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4"><div className="flex items-center gap-2"><Logo className="size-6" /><span className="font-bold">GeoCoverage</span></div></SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === '/dashboard'}><Link href="/dashboard"><LayoutGrid />Dashboard</Link></SidebarMenuButton></SidebarMenuItem>
            {user?.role === 'Admin' && (
              <>
                <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === '/dashboard/city-thresholds'}><Link href="/dashboard/city-thresholds"><SlidersHorizontal />Thresholds</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === '/dashboard/user-management'}><Link href="/dashboard/user-management"><Users />Users</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === '/dashboard/city-management'}><Link href="/dashboard/city-management"><UploadCloud />Cities</Link></SidebarMenuButton></SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter><SidebarMenuButton onClick={() => { localStorage.clear(); window.location.href='/'; }}><LogOut />Logout</SidebarMenuButton></SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4"><SidebarTrigger /></header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
