'use client';

import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import { useEffect } from 'react';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutGrid, LogOut, Settings, UploadCloud, Users } from "lucide-react";
import Link from "next/link"; // Required for navigation
import { Logo } from "@/components/logo";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname(); // Identify active page
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user, firestore]);
  const { data: userProfile, isLoading: isUserProfileLoading } = useDoc(userProfileRef);

  const adminRoleRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'roles_admin', user.uid);
  }, [user, firestore]);

  const { data: adminRole, isLoading: isAdminLoading } = useDoc(adminRoleRef);
  const isAdmin = !!adminRole;
  const isLoading = isUserLoading || isAdminLoading || isUserProfileLoading;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const handleLogout = () => {
    auth.signOut();
  };

  const handleBecomeAdmin = () => {
    if (!user || !userProfile) {
        toast({ title: 'Error', description: 'User profile not loaded yet.', variant: 'destructive'});
        return;
    }

    const adminRoleDocRef = doc(firestore, 'roles_admin', user.uid);
    const adminData = {
        ...userProfile,
        role: 'Admin'
    };

    setDoc(adminRoleDocRef, adminData)
        .then(() => {
            toast({ title: 'Success', description: 'You are now an admin. The page will refresh to apply changes.'});
        })
        .catch(error => {
            const contextualError = new FirestorePermissionError({
                operation: 'create',
                path: adminRoleDocRef.path,
                requestResourceData: adminData,
            });
            errorEmitter.emit('permission-error', contextualError);
        });
  };

  if (isLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
        </div>
      );
  }

  if (!user) {
    return null;
  }
  
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <Logo className="size-8" />
            <span className="text-lg font-headline font-semibold">GeoCoverage</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {/* 1. DASHBOARD LINK */}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                <Link href="/dashboard">
                  <LayoutGrid />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {isAdmin && (
              <>
              {/* 2. USER MANAGEMENT LINK */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard/user-management'}>
                  <Link href="/dashboard/user-management">
                    <Users />
                    <span>User Management</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* 3. CITY MANAGEMENT LINK */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard/city-management'}>
                  <Link href="/dashboard/city-management">
                    <UploadCloud />
                    <span>City Management</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="#">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                <LogOut />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
          <SidebarTrigger />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || 'User'} />
                <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.displayName || user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {!isAdmin && (
          <div className="p-4 sm:p-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-headline text-lg">Become an Administrator</CardTitle>
                <CardDescription>
                  To access all features of this application, such as user and city management, you need administrator privileges.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleBecomeAdmin}>Grant Admin Access</Button>
              </CardContent>
            </Card>
          </div>
        )}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
