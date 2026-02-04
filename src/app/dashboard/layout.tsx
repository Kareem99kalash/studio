'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Users, LayoutGrid, LogOut, UploadCloud, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/logo";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // --- 1. STABLE AUTH CHECK ---
  useEffect(() => {
    const checkAuth = () => {
        try {
            const storedUser = localStorage.getItem('geo_user');
            if (!storedUser) {
                // If no user, redirect immediately and KEEP LOADING true
                // preventing the UI from flickering
                router.replace('/'); 
            } else {
                setUser(JSON.parse(storedUser));
                setLoading(false); // Only stop loading if success
            }
        } catch (e) {
            router.replace('/');
        }
    };
    
    // Tiny timeout ensures router is ready
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('geo_user');
    router.replace('/');
  };

  // While checking, show a full-screen spinner (No flickering)
  if (loading) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
  }

  // If loading is false but user is null (shouldn't happen due to redirect, but safety first)
  if (!user) return null;

  const isAdmin = user.role === 'Admin';

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-4">
            <Logo className="size-8 text-primary" />
            <span className="text-lg font-bold tracking-tight">GeoCoverage</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                <Link href="/dashboard"><LayoutGrid /><span>Dashboard</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {isAdmin && (
              <>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-thresholds'}>
                        <Link href="/dashboard/city-thresholds"><SlidersHorizontal /><span>Thresholds</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/dashboard/user-management'}>
                        <Link href="/dashboard/user-management"><Users /><span>User Management</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-management'}>
                        <Link href="/dashboard/city-management"><UploadCloud /><span>City Management</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <LogOut /><span>Logout</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      
      <SidebarInset>
         <header className="flex h-14 items-center justify-between border-b px-4 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.role}</p>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger className="outline-none">
                        <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-offset-2 ring-transparent hover:ring-slate-200 transition-all">
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                {user.username?.[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
         </header>
         <div className="flex-1 overflow-hidden">
            {children}
         </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
