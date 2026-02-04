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
      email: '',
      password: '',
      ...(isLoginView ? {} : { username: '' }),
    },
  });

  useEffect(() => {
    form.reset();
  }, [isLoginView, form]);

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
