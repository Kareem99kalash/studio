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
import { GoogleMapsProvider } from "@/components/google-maps-provider";
import { Home, LayoutGrid, LogOut, Settings, UploadCloud, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = { name: "Admin User", email: "admin@geocoverage.com", role: "admin", avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d" };

  return (
    <GoogleMapsProvider>
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
              <SidebarMenuItem>
                <SidebarMenuButton href="/dashboard" isActive>
                  <LayoutGrid />
                  Dashboard
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user.role === 'admin' && (
                <>
                <SidebarMenuItem>
                  <SidebarMenuButton href="#">
                    <Users />
                    User Management
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="#">
                    <UploadCloud />
                    City Management
                  </SidebarMenuButton>
                </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton href="#">
                  <Settings />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton href="/">
                  <LogOut />
                  Logout
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
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">Logout</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </GoogleMapsProvider>
  );
}
