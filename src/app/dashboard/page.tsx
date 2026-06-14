'use client';

import React from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Coins, LogOut, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPlaceholder() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-slate-400 text-sm">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Background Decorative Glow Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <header className="backdrop-blur-md bg-slate-950/40 border-b border-slate-900 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center">
              <Coins className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
              FairShare
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-full">
              {session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-slate-300 hover:text-white flex items-center space-x-1.5 hover:bg-slate-900 border border-slate-800/50 hover:border-slate-800 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 z-10">
        <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 max-w-xl w-full rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-200 via-slate-100 to-indigo-200 bg-clip-text text-transparent">
            Authentication Setup Verified
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Welcome, <strong className="text-violet-300">{session?.user?.name || 'User'}</strong>! You have successfully registered, logged in, and entered a session-protected route.
          </p>
          
          <div className="p-4 rounded-2xl bg-violet-950/20 border border-violet-800/20 text-left text-xs font-mono space-y-2 text-violet-300">
            <p className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Session Data:</p>
            <p>User ID: {session?.user?.id}</p>
            <p>Name: {session?.user?.name}</p>
            <p>Email: {session?.user?.email}</p>
          </div>

          <div className="pt-4 flex justify-center">
            <Link 
              href="/groups" 
              className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 font-semibold text-slate-200 text-sm flex items-center space-x-2 transition-all duration-200 cursor-pointer hover:bg-slate-800 group"
            >
              <span>Continue to Group Management</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 text-violet-400" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
