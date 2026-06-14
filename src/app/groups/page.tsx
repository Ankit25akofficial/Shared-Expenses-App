'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  Coins, LogOut, Plus, Users, ArrowRight, Loader2, 
  FolderKanban, DollarSign, X, HelpCircle, FileText 
} from 'lucide-react';
import Link from 'next/link';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Membership {
  id: string;
  userId: string;
  user: Member;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  defaultCurrency: string;
  createdAt: string;
  memberships: Membership[];
}

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Fetch groups
  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load groups.');
      setGroups(data.groups || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchGroups();
    }
  }, [status, router]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    
    if (!newGroupName.trim()) {
      setModalError('Group name is required.');
      return;
    }

    setModalLoading(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDesc,
          defaultCurrency: newGroupCurrency,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group.');
      
      // Close modal, reset form, refresh list
      setModalOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupCurrency('INR');
      fetchGroups();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create group.');
    } finally {
      setModalLoading(false);
    }
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-slate-400 text-sm">Loading groups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="backdrop-blur-md bg-slate-950/40 border-b border-slate-900/60 sticky top-0 z-20">
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
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-full hidden sm:inline-block">
              {session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-slate-300 hover:text-white flex items-center space-x-1.5 hover:bg-slate-900 border border-slate-800/50 hover:border-slate-800 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 z-10 space-y-8">
        
        {/* Banner Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-violet-200 via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              Expense Groups
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Select an existing group or create a new one to begin tracking splits
            </p>
          </div>
          
          <button
            onClick={() => setModalOpen(true)}
            className="self-start sm:self-auto py-3 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:from-violet-700 active:to-indigo-700 font-semibold text-white shadow-lg shadow-indigo-600/20 text-sm flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Group</span>
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs">
            <p className="font-semibold">Error Loading Dashboard</p>
            <p className="mt-1 text-red-400">{error}</p>
          </div>
        )}

        {/* Groups Grid */}
        {groups.length === 0 ? (
          <div className="backdrop-blur-xl bg-slate-900/20 border border-slate-800/60 rounded-3xl p-16 text-center space-y-6 max-w-2xl mx-auto mt-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-950 flex items-center justify-center border border-slate-800">
              <FolderKanban className="w-8 h-8 text-violet-500/80" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-200">No Expense Groups Yet</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                Groups allow roommates, travel buddies, or families to pool together shared costs. Create your first group to get started.
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="py-3 px-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-sm font-semibold hover:bg-slate-800 transition-all cursor-pointer text-violet-400"
            >
              Get Started Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => {
              const activeCount = group.memberships.length;
              return (
                <div 
                  key={group.id}
                  className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 hover:border-violet-500/30 hover:bg-slate-900/50 transition-all flex flex-col justify-between group shadow-lg shadow-black/10"
                >
                  <div className="space-y-4">
                    {/* Header Card */}
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg text-slate-100 group-hover:text-violet-400 transition-colors">
                          {group.name}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Created {new Date(group.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-300 flex items-center space-x-1">
                        <DollarSign className="w-3 h-3 text-slate-500" />
                        <span>{group.defaultCurrency}</span>
                      </span>
                    </div>

                    {/* Desc */}
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {group.description || 'No description provided.'}
                    </p>

                    {/* Members List teaser */}
                    <div className="flex items-center space-x-2 text-xs text-slate-500 bg-slate-950/40 p-2.5 rounded-xl border border-slate-900">
                      <Users className="w-3.5 h-3.5 text-violet-500" />
                      <span>{activeCount} member{activeCount !== 1 ? 's' : ''} active</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-900 flex justify-end">
                    <Link
                      href={`/groups/${group.id}`}
                      className="text-xs font-semibold text-violet-400 group-hover:text-violet-300 flex items-center space-x-1 group/btn"
                    >
                      <span>Manage Group</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-1" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* CREATE GROUP MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="backdrop-blur-xl bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent mb-4">
              Create New Group
            </h2>

            {modalError && (
              <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apartment 304, Euro Trip"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all text-sm text-slate-100 placeholder-slate-600"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Description
                </label>
                <textarea
                  placeholder="Optional brief details..."
                  rows={3}
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all text-sm text-slate-100 placeholder-slate-600 resize-none"
                />
              </div>

              {/* Currency Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Default Currency
                </label>
                <select
                  value={newGroupCurrency}
                  onChange={(e) => setNewGroupCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all text-sm text-slate-100"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div className="pt-2 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800/55 transition-all text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {modalLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Group</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
