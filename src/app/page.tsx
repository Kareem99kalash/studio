'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MapPin, Loader2, UserPlus, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [authType, setAuthType] = useState('login');

  useEffect(() => {
    if (localStorage.getItem('geo_user')) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error("User profile does not exist.");
      }
      
      const userData = userSnap.data();
      localStorage.setItem('geo_user', JSON.stringify({ ...userData, uid: user.uid }));
      
      toast({ title: "Access Granted", description: `Welcome back, ${userData.name || userData.username}!` });
      window.location.href = '/dashboard';
    } catch (error: any) {
      console.error("Login Error:", error);
      toast({ variant: "destructive", title: "Login Failed", description: "Incorrect email or password." });
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
        toast({ variant: "destructive", title: "Weak Password", description: "Password must be at least 6 characters."});
        return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userData = {
        uid: user.uid,
        username: username.toLowerCase(),
        name: name,
        email: user.email,
        role: 'Agent',
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', user.uid), userData);

      localStorage.setItem('geo_user', JSON.stringify(userData));
      toast({ title: "Account Created", description: "Welcome! You are now logged in." });
      window.location.href = '/dashboard';
    } catch (error: any) {
      let desc = "An unknown error occurred.";
      if (error.code === 'auth/email-already-in-use') {
          desc = "This email address is already taken.";
      }
      toast({ variant: "destructive", title: "Sign Up Failed", description: desc });
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-purple-600">
        <CardHeader className="text-center">
          <MapPin className="mx-auto h-10 w-10 text-purple-600 mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-800">GeoCoverage</CardTitle>
          <CardDescription>Administrative Portal</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={authType} onValueChange={setAuthType} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login"><LogIn className="mr-2 h-4 w-4"/>Login</TabsTrigger>
              <TabsTrigger value="signup"><UserPlus className="mr-2 h-4 w-4"/>Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-4">
                <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 h-11" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : "Authenticate"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <Input placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required />
                <Input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
                <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input placeholder="Password (min. 6 characters)" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                <Button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 h-11" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
