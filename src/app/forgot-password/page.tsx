'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-x-hidden bg-gradient-to-br from-slate-50 via-orange-50 to-slate-100 px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-100/40 via-transparent to-transparent" />

      <Card className="w-full max-w-md relative z-10 border-slate-200/50 shadow-xl">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
              <Zap className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold text-slate-900">Reset your password</CardTitle>
          <CardDescription>We&apos;ll help you get back in</CardDescription>
        </CardHeader>

        <CardContent className="text-sm text-slate-600 space-y-3">
          <p>
            Self-service password reset isn&apos;t available yet. To reset your password, please
            contact support and we&apos;ll help you regain access to your account.
          </p>
          <p>
            Email:{' '}
            <a href="mailto:support@exportreach.app" className="font-medium text-orange-600 hover:underline">
              support@exportreach.app
            </a>
          </p>
        </CardContent>

        <CardFooter className="flex justify-center">
          <p className="text-sm text-slate-600">
            Remembered it?{' '}
            <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
