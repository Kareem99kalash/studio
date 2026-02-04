'use client';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
    id: string;
    username: string;
    role: string;
}

export default function UserManagementPage() {
    const firestore = useFirestore();

    const usersRef = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
    const { data: users, isLoading, error } = useCollection<UserProfile>(usersRef);

    return (
        <main className="p-4 sm:p-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline text-xl">User Management</CardTitle>
                    <CardDescription>View and manage application users from the Firestore database.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && (
                        <div className="space-y-2">
                           <Skeleton className="h-12 w-full rounded-md" />
                           <Skeleton className="h-12 w-full rounded-md" />
                           <Skeleton className="h-12 w-full rounded-md" />
                        </div>
                    )}
                    {error && <p className="text-destructive">Error loading users: {error.message}</p>}
                    {!isLoading && !error && users && (
                        <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Username</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>User ID</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center h-24">No users found.</TableCell>
                                    </TableRow>
                                )}
                                {users.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.username}</TableCell>
                                        <TableCell>
                                            <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                                                {user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{user.id}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}
