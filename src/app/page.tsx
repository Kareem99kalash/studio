'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Logo } from '@/components/logo';
import { useAuth, useUser, initiateEmailSignIn, initiateEmailSignUp } from '@/firebase';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

// ... imports and state ...

  // Helper: Haversine Distance (KM)
  function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

const handleAnalyze = (data: AnalysisFormValues) => {
  const cityToAnalyze = cities.find(c => c.id === data.cityId);
  if (!cityToAnalyze || !data.stores.length) return;

  setSubmittedStores(data.stores);
  
  startTransition(async () => {
      try {
          // 1. FETCH THRESHOLDS (KM)
          let limits = { green: 2, yellow: 5 }; // Defaults
          try {
              const cityDocRef = doc(firestore, 'cities', cityToAnalyze.id);
              const citySnapshot = await getDoc(cityDocRef);
              if (citySnapshot.exists()) {
                  const d = citySnapshot.data();
                  if (d.thresholds) limits = d.thresholds;
              }
          } catch (e) { console.log("Using defaults"); }

          // 2. PREPARE STORES
          const stores = data.stores.map(s => ({
              id: s.id,
              name: s.name,
              lat: parseFloat(s.lat),
              lng: parseFloat(s.lng),
          }));

          // 3. CHECK EACH POLYGON DISTANCE
          const assignments: Record<string, string> = {}; // ZoneName -> Color
          const zones = cityToAnalyze.polygons.features as any[];
          
          let coveredCount = 0;

          zones.forEach(zone => {
              const center = zone.properties.centroid;
              
              // Find MINIMUM distance to ANY store
              let minKm = Infinity;
              stores.forEach(store => {
                  const km = getDistanceKm(center.lat, center.lng, store.lat, store.lng);
                  if (km < minKm) minKm = km;
              });

              // Apply Colors
              if (minKm <= limits.green) {
                  assignments[zone.properties.name] = '#22c55e'; // Green
                  coveredCount++;
              } else if (minKm <= limits.yellow) {
                  assignments[zone.properties.name] = '#eab308'; // Yellow
                  coveredCount++;
              } else {
                  assignments[zone.properties.name] = '#ef4444'; // Red (Too far)
              }
          });

          // Pass strictly the Color Map to the View
          setAnalysisResults({
              assignments, // { "Zone A": "#22c55e", "Zone B": "#ef4444" }
              stats: { covered: coveredCount, total: zones.length }
          });

          toast({ title: "Coverage Checked", description: `${coveredCount} zones are within valid range.` });

      } catch (err) {
          console.error("Error:", err);
      }
  });
};
const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const signupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters.'),
  email: z.string().email("Invalid email address."),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

export default function AuthPage() {
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);

  const form = useForm<LoginFormValues | SignupFormValues>({
    resolver: zodResolver(isLoginView ? loginSchema : signupSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    form.reset();
  }, [isLoginView, form.reset]);

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const onSubmit = (data: LoginFormValues | SignupFormValues) => {
    setIsSubmitting(true);
    const handleError = (error: any) => {
        toast({
            variant: 'destructive',
            title: isLoginView ? 'Login Failed' : 'Sign Up Failed',
            description: error.message || 'An unexpected error occurred. Please try again.',
        });
        setIsSubmitting(false);
    };

    if (isLoginView) {
        const { email, password } = data as LoginFormValues;
        initiateEmailSignIn(auth, email, password, handleError);
    } else {
        const { email, password, username } = data as SignupFormValues;
        initiateEmailSignUp(auth, email, password, username, handleError);
    }
  };

  if (isUserLoading || (!isUserLoading && user)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
        </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Logo className="h-12 w-12" />
          </div>
          <CardTitle className="font-headline text-2xl">GeoCoverage Analyzer</CardTitle>
          <CardDescription>
            {isLoginView ? 'Enter your credentials to access your account' : 'Create an account to get started'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              {!isLoginView && (
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem className="grid gap-2">
                      <Label htmlFor="username">Username</Label>
                      <FormControl>
                        <Input id="username" placeholder="e.g., JaneDoe" required {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <FormControl>
                      <Input id="email" type="email" placeholder="m@example.com" required {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="password">Password</Label>
                    </div>
                    <FormControl>
                      <Input id="password" type="password" required {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (isLoginView ? 'Logging in...' : 'Signing up...') : (isLoginView ? 'Login' : 'Sign Up')}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            {isLoginView ? "Don't have an account?" : "Already have an account?"}{' '}
            <Button variant="link" className="p-0 h-auto" onClick={() => setIsLoginView(!isLoginView)}>
              {isLoginView ? 'Sign up' : 'Login'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
