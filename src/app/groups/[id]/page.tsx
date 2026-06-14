'use client';

import React, { useState, useEffect, use } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  Coins, LogOut, ArrowLeft, Users, Calendar, 
  Settings, UserPlus, ShieldAlert, Loader2, Trash2,
  Clock, Plus, DollarSign, FileSpreadsheet, X, Info, CheckCircle,
  Printer, Download, FileText
} from 'lucide-react';
import Link from 'next/link';
import { exportMemberLedgerToCsv, exportSettlementsToCsv } from '@/lib/export';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Membership {
  id: string;
  userId: string;
  user: Member;
  joinedAt: string;
  leftAt: string | null;
}

interface ExpenseParticipant {
  id: string;
  userId: string;
  owedAmount: number;
  splitValue: number;
  user: Member;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  payerId: string;
  splitType: 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARES';
  createdAt: string;
  payer: Member;
  participants: ExpenseParticipant[];
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  defaultCurrency: string;
  createdAt: string;
  memberships: Membership[];
}

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'expenses' | 'members' | 'balances' | 'imports' | 'reports'>('expenses');

  // Reports Tab States
  const [activeReportTab, setActiveReportTab] = useState<'balance' | 'ledger' | 'settlement' | 'imports'>('balance');
  const [reportLedgerUserId, setReportLedgerUserId] = useState('');
  const [reportLedgerData, setReportLedgerData] = useState<any>(null);
  const [reportLedgerLoading, setReportLedgerLoading] = useState(false);
  const [reportSettlementData, setReportSettlementData] = useState<any[]>([]);
  const [reportSettlementLoading, setReportSettlementLoading] = useState(false);
  const [reportImportData, setReportImportData] = useState<any[]>([]);
  const [reportImportLoading, setReportImportLoading] = useState(false);

  // Expense States
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [viewExpense, setViewExpense] = useState<Expense | null>(null);

  // Expense Form States
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('INR');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expPayer, setExpPayer] = useState('');
  const [expSplitType, setExpSplitType] = useState<'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARES'>('EQUAL');
  const [participantShares, setParticipantShares] = useState<{ [userId: string]: { checked: boolean; value: string } }>({});
  
  const [expenseFormLoading, setExpenseFormLoading] = useState(false);
  const [expenseFormError, setExpenseFormError] = useState('');

  // Add Member State
  const [memberEmail, setMemberEmail] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [memberSuccess, setMemberSuccess] = useState('');

  // Edit Membership Dates State
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editJoinedAt, setEditJoinedAt] = useState('');
  const [editLeftAt, setEditLeftAt] = useState('');
  const [editMembershipLoading, setEditMembershipLoading] = useState(false);

  // Edit Group State
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Fetch Group details
  const fetchGroupDetails = async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load group details.');
      
      setGroup(data.group);
      setEditName(data.group.name);
      setEditDesc(data.group.description || '');
      setEditCurrency(data.group.defaultCurrency);
      setExpCurrency(data.group.defaultCurrency);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Expenses
  const fetchExpenses = async () => {
    setExpensesLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/expenses`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load expenses.');
      setExpenses(data.expenses || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setExpensesLoading(false);
    }
  };

  // Import Jobs State
  const [importJobs, setImportJobs] = useState<any[]>([]);
  const [importJobsLoading, setImportJobsLoading] = useState(true);

  // Fetch Import Jobs
  const fetchImportJobs = async () => {
    setImportJobsLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/imports`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load imports.');
      setImportJobs(data.jobs || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setImportJobsLoading(false);
    }
  };

  // Balances State
  const [balances, setBalances] = useState<any>(null);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedLedgerUser, setSelectedLedgerUser] = useState<any>(null);

  // Fetch Balances
  const fetchBalances = async () => {
    setBalancesLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/balances`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load balances.');
      setBalances(data.balances || {});
      
      const currencies = Object.keys(data.balances || {});
      if (currencies.length > 0) {
        setSelectedCurrency(prev => prev || currencies[0]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setBalancesLoading(false);
    }
  };

  // Fetch Report Data
  const fetchReportLedger = async (userId: string) => {
    if (!userId) return;
    setReportLedgerLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/reports/member-ledger?userId=${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch ledger report');
      setReportLedgerData(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setReportLedgerLoading(false);
    }
  };

  const fetchReportSettlements = async () => {
    setReportSettlementLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/reports/settlement-history`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch settlement report');
      setReportSettlementData(data.settlements || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setReportSettlementLoading(false);
    }
  };

  const fetchReportImports = async () => {
    setReportImportLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/reports/import-audit`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch import report');
      setReportImportData(data.jobs || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setReportImportLoading(false);
    }
  };
  // Settlement Recording States
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [setPayPayer, setSetPayPayer] = useState('');
  const [setPayPayee, setSetPayPayee] = useState('');
  const [setPayAmount, setSetPayAmount] = useState('');
  const [setPayCurrency, setSetPayCurrency] = useState('INR');
  const [setPayDate, setSetPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementError, setSettlementError] = useState('');

  const handlePrefillSettlement = (fromId: string, toId: string, amount: number) => {
    setSetPayPayer(fromId);
    setSetPayPayee(toId);
    setSetPayAmount(amount.toString());
    setSetPayCurrency(selectedCurrency);
    setSettlementError('');
    setSettlementModalOpen(true);
  };

  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettlementError('');

    const amtNum = parseFloat(setPayAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setSettlementError('Please enter a positive amount.');
      return;
    }

    if (setPayPayer === setPayPayee) {
      setSettlementError('Debtor and Creditor must be different members.');
      return;
    }

    setSettlementLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payerId: setPayPayer,
          payeeId: setPayPayee,
          amount: amtNum,
          currency: setPayCurrency,
          date: new Date(setPayDate).toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record settlement.');

      setSettlementModalOpen(false);
      setSetPayAmount('');
      fetchBalances();
      fetchExpenses(); // Refresh expense trail
    } catch (err: any) {
      setSettlementError(err.message || 'Failed to record settlement.');
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleDeleteSettlement = async (settlementId: string) => {
    if (!confirm('Are you sure you want to delete this settlement? This will restore the debt balance.')) {
      return;
    }

    try {
      const res = await fetch(`/api/groups/${groupId}/settlements/${settlementId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete settlement.');
      
      setSelectedLedgerUser(null);
      fetchBalances();
      fetchExpenses();
    } catch (err: any) {
      alert(err.message || 'Failed to delete settlement.');
    }
  };
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchGroupDetails();
      fetchExpenses();
      fetchImportJobs();
      fetchBalances();
    }
  }, [status, groupId, router]);

  useEffect(() => {
    if (activeTab === 'reports') {
      if (activeReportTab === 'ledger' && reportLedgerUserId) {
        fetchReportLedger(reportLedgerUserId);
      } else if (activeReportTab === 'settlement') {
        fetchReportSettlements();
      } else if (activeReportTab === 'imports') {
        fetchReportImports();
      }
    }
  }, [activeTab, activeReportTab, reportLedgerUserId]);

  useEffect(() => {
    if (activeTab === 'reports' && group && group.memberships.length > 0 && !reportLedgerUserId) {
      const memberSelf = group.memberships.find(m => m.userId === session?.user?.id);
      setReportLedgerUserId(memberSelf ? memberSelf.userId : group.memberships[0].userId);
    }
  }, [activeTab, group, session, reportLedgerUserId]);

  // Helper: Get active members on a specific date
  const getActiveMembersOnDate = (dateStr: string) => {
    if (!group) return [];
    try {
      const checkDay = new Date(dateStr).toISOString().split('T')[0];
      return group.memberships.filter(m => {
        const joinDay = new Date(m.joinedAt).toISOString().split('T')[0];
        const leaveDay = m.leftAt ? new Date(m.leftAt).toISOString().split('T')[0] : null;
        return joinDay <= checkDay && (leaveDay === null || leaveDay >= checkDay);
      });
    } catch {
      return [];
    }
  };

  const activeMembersOnExpDate = getActiveMembersOnDate(expDate);

  // Initialize participant inputs when active list, modal, or split type changes
  useEffect(() => {
    if (!group) return;
    const initialShares: { [userId: string]: { checked: boolean; value: string } } = {};
    
    // Set default value based on split type
    activeMembersOnExpDate.forEach(m => {
      initialShares[m.userId] = {
        checked: true,
        value: expSplitType === 'EQUAL' ? '1' : 
               expSplitType === 'PERCENTAGE' ? (100 / activeMembersOnExpDate.length).toFixed(1) : 
               expSplitType === 'SHARES' ? '1' : '',
      };
    });

    setParticipantShares(initialShares);
    if (activeMembersOnExpDate.length > 0 && !expPayer) {
      // Default payer is session user if active, otherwise first active member
      const sessionActive = activeMembersOnExpDate.find(m => m.userId === session?.user?.id);
      setExpPayer(sessionActive ? sessionActive.userId : activeMembersOnExpDate[0].userId);
    }
  }, [group, expDate, expSplitType, expenseModalOpen]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');
    setMemberSuccess('');
    
    if (!memberEmail.trim()) {
      setMemberError('Email address is required.');
      return;
    }

    setMemberLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add member.');
      
      setMemberSuccess('Member added successfully!');
      setMemberEmail('');
      fetchGroupDetails();
      fetchExpenses(); // Refresh in case splits affect roster updates
    } catch (err: any) {
      setMemberError(err.message || 'Failed to add member.');
    } finally {
      setMemberLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member? They will no longer be included in new expenses, but past transactions remain.')) {
      return;
    }

    try {
      const res = await fetch(`/api/groups/${groupId}/members/${memberId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to remove member.');
      fetchGroupDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  const handleUpdateMembershipDates = async (userId: string) => {
    setEditMembershipLoading(true);
    setMemberError('');
    setMemberSuccess('');
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joinedAt: editJoinedAt ? new Date(editJoinedAt).toISOString() : undefined,
          leftAt: editLeftAt ? new Date(editLeftAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update membership dates.');
      setMemberSuccess('Membership dates updated successfully!');
      setEditingMembershipId(null);
      fetchGroupDetails();
      fetchExpenses();
      fetchBalances();
    } catch (err: any) {
      setMemberError(err.message || 'Failed to update membership dates.');
    } finally {
      setEditMembershipLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseFormError('');

    if (!expDesc.trim()) {
      setExpenseFormError('Description is required.');
      return;
    }

    const amountNum = parseFloat(expAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setExpenseFormError('Please enter a valid positive amount.');
      return;
    }

    // Prepare participants list
    const selectedParticipants = Object.keys(participantShares)
      .filter(uid => participantShares[uid].checked)
      .map(uid => ({
        userId: uid,
        splitValue: parseFloat(participantShares[uid].value) || 0,
      }));

    if (selectedParticipants.length === 0) {
      setExpenseFormError('Please select at least one participant.');
      return;
    }

    // Client-side Split Type validations
    if (expSplitType === 'PERCENTAGE') {
      const totalPct = selectedParticipants.reduce((sum, p) => sum + p.splitValue, 0);
      if (Math.abs(totalPct - 100) > 0.1) {
        setExpenseFormError(`Total percentages must sum to 100%. Currently: ${totalPct}%`);
        return;
      }
    } else if (expSplitType === 'UNEQUAL') {
      const totalUnequal = selectedParticipants.reduce((sum, p) => sum + p.splitValue, 0);
      if (Math.abs(totalUnequal - amountNum) > 0.01) {
        setExpenseFormError(`Total unequal splits must equal the total amount (${amountNum}). Currently: ${totalUnequal}`);
        return;
      }
    } else if (expSplitType === 'SHARES') {
      const totalShares = selectedParticipants.reduce((sum, p) => sum + p.splitValue, 0);
      if (totalShares <= 0) {
        setExpenseFormError('Total shares count must be greater than zero.');
        return;
      }
    }

    setExpenseFormLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: expDesc,
          amount: amountNum,
          currency: expCurrency,
          date: new Date(expDate).toISOString(),
          payerId: expPayer,
          splitType: expSplitType,
          participants: selectedParticipants,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add expense.');

      setExpenseModalOpen(false);
      setExpDesc('');
      setExpAmount('');
      fetchExpenses();
    } catch (err: any) {
      setExpenseFormError(err.message || 'Failed to create expense.');
    } finally {
      setExpenseFormLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Are you sure you want to delete this expense? This will recalculate group balances.')) {
      return;
    }

    try {
      const res = await fetch(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete expense.');
      
      setViewExpense(null);
      fetchExpenses();
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense.');
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    setEditSuccess('');
    setEditLoading(true);

    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          defaultCurrency: editCurrency,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update group.');

      setEditSuccess('Group settings updated successfully!');
      fetchGroupDetails();
      setTimeout(() => setShowSettings(false), 1000);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update settings.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('CRITICAL WARNING: Are you sure you want to delete this group? This will permanently delete all expenses, splits, and settlements. This action CANNOT be undone!')) {
      return;
    }

    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to delete group.');
      router.push('/groups');
    } catch (err: any) {
      alert(err.message || 'Failed to delete group.');
    }
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-slate-400 text-sm">Loading group details...</p>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-100 p-6">
        <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl text-center space-y-6 max-w-md w-full">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-200">Access Error</h2>
          <p className="text-sm text-slate-400">{error || 'Group details could not be found.'}</p>
          <Link href="/groups" className="inline-block py-2.5 px-5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-violet-400 font-semibold hover:bg-slate-900 transition-all">
            Back to Groups
          </Link>
        </div>
      </div>
    );
  }

  const activeMemberships = group.memberships.filter(m => m.leftAt === null);
  const membershipHistory = [...group.memberships].sort(
    (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()
  );

  return (
    <div className="relative min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="backdrop-blur-md bg-slate-950/40 border-b border-slate-900/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/groups" className="text-slate-400 hover:text-slate-200 transition-colors p-1 bg-slate-950 border border-slate-900 rounded-lg">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
              FairShare
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 bg-slate-950 border border-slate-900 hover:border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 hover:bg-slate-900 border border-slate-900 px-3 py-2 rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Group Detail Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 z-10 space-y-8">
        
        {/* Settings Area / Form */}
        {showSettings && (
          <div className="backdrop-blur-xl bg-slate-900/80 border border-slate-800/85 p-6 rounded-2xl space-y-6 animate-slide-down">
            <div className="flex justify-between items-center pb-4 border-b border-slate-950">
              <h3 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                <Settings className="w-5 h-5 text-violet-500" />
                <span>Group Settings</span>
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-slate-500 hover:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                {editError}
              </div>
            )}
            {editSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs">
                {editSuccess}
              </div>
            )}

            <form onSubmit={handleEditGroup} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Group Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Default Currency</label>
                <select
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Description</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                />
              </div>

              <div className="md:col-span-3 flex justify-between items-center pt-4 border-t border-slate-950">
                <button
                  type="button"
                  onClick={handleDeleteGroup}
                  className="py-2.5 px-4 rounded-xl bg-red-950/20 hover:bg-red-950/50 border border-red-900/50 text-red-400 text-xs font-semibold cursor-pointer flex items-center space-x-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Group Permanently</span>
                </button>

                <button
                  type="submit"
                  disabled={editLoading}
                  className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {editLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Save Changes</span>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Group Meta Info Header */}
        <div className="backdrop-blur-xl bg-slate-900/20 border border-slate-800/60 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center space-x-3 flex-wrap gap-y-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-100">{group.name}</h1>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-violet-400 flex items-center space-x-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Base: {group.defaultCurrency}</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-2xl">{group.description || 'No description provided.'}</p>
            <div className="flex items-center space-x-4 text-xs text-slate-500">
              <span className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{activeMemberships.length} Active Members</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
            <button
              onClick={() => setExpenseModalOpen(true)}
              className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center space-x-1.5 shadow-lg shadow-indigo-600/15 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Expense</span>
            </button>

            <Link
              href={`/groups/${group.id}/import`}
              className="py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 font-semibold text-slate-300 text-xs flex items-center space-x-1.5 hover:bg-slate-800 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Import CSV</span>
            </Link>
          </div>
        </div>
        {/* Tab Bar Navigation */}
        <div className="flex border-b border-slate-900 space-x-4 overflow-x-auto scrollbar-none no-print">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`pb-4 px-2 text-sm font-semibold transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'expenses' 
                ? 'border-violet-500 text-violet-400 font-bold' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Expenses</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`pb-4 px-2 text-sm font-semibold transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'members' 
                ? 'border-violet-500 text-violet-400 font-bold' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Members & History</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('balances');
              fetchBalances();
            }}
            className={`pb-4 px-2 text-sm font-semibold transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'balances' 
                ? 'border-violet-500 text-violet-400 font-bold' 
                : 'border-transparent text-slate-550 hover:text-slate-300'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Balances & Netting</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('imports');
              fetchImportJobs();
            }}
            className={`pb-4 px-2 text-sm font-semibold transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'imports' 
                ? 'border-violet-500 text-violet-400 font-bold' 
                : 'border-transparent text-slate-550 hover:text-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Jobs</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-4 px-2 text-sm font-semibold transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'reports' 
                ? 'border-violet-500 text-violet-400 font-bold' 
                : 'border-transparent text-slate-550 hover:text-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Reports & Audits</span>
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'members' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Add Member Card */}
              <div className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-md">
                <h3 className="font-bold text-sm text-slate-200 flex items-center space-x-2 mb-4">
                  <UserPlus className="w-4 h-4 text-violet-500" />
                  <span>Add New Member</span>
                </h3>

                {memberError && (
                  <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                    {memberError}
                  </div>
                )}
                {memberSuccess && (
                  <div className="p-3 mb-4 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs animate-fade-in">
                    {memberSuccess}
                  </div>
                )}

                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    required
                    placeholder="friend@email.com"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 outline-none text-sm text-slate-100 placeholder-slate-650"
                  />
                  <button
                    type="submit"
                    disabled={memberLoading}
                    className="py-3 px-6 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer hover:bg-slate-850"
                  >
                    {memberLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Add Member</span>}
                  </button>
                </form>
              </div>

              {/* Roster list */}
              <div className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-4">
                <h3 className="font-bold text-sm text-slate-200 flex items-center space-x-2 pb-3 border-b border-slate-950">
                  <Users className="w-4 h-4 text-violet-500" />
                  <span>Group Roster ({group.memberships.length})</span>
                </h3>

                <div className="divide-y divide-slate-950">
                  {group.memberships.map((membership) => {
                    const isSelf = membership.userId === session?.user?.id;
                    const isActive = membership.leftAt === null;
                    const isEditing = editingMembershipId === membership.id;

                    return (
                      <div 
                        key={membership.id}
                        className="py-4 space-y-3 first:pt-1 last:pb-1"
                      >
                        {isEditing ? (
                          <div className="space-y-3 bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                            <p className="text-xs font-bold text-slate-200">
                              Edit Membership Dates for {membership.user.name || membership.user.email}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Join Date</label>
                                <input
                                  type="date"
                                  value={editJoinedAt}
                                  onChange={(e) => setEditJoinedAt(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 outline-none focus:border-violet-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Leave Date (Optional)</label>
                                <input
                                  type="date"
                                  value={editLeftAt}
                                  onChange={(e) => setEditLeftAt(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 outline-none focus:border-violet-500"
                                  placeholder="Active / Present"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingMembershipId(null)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs cursor-pointer transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={editMembershipLoading}
                                onClick={() => handleUpdateMembershipDates(membership.userId)}
                                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-750 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                              >
                                {editMembershipLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Dates'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-slate-250 flex items-center gap-1.5 flex-wrap">
                                <span>{membership.user.name || 'Anonymous User'}</span>
                                {isSelf && (
                                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-950 border border-violet-800 text-violet-350 font-semibold uppercase tracking-wider">
                                    You
                                  </span>
                                )}
                                <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                                  isActive 
                                    ? 'bg-[#0b1c11]/40 border-emerald-900/60 text-emerald-400' 
                                    : 'bg-[#1c0b0b]/40 border-red-900/60 text-red-400'
                                }`}>
                                  {isActive ? 'Active' : 'Left'}
                                </span>
                              </p>
                              <p className="text-xs text-slate-500">{membership.user.email}</p>
                              <div className="flex flex-col gap-0.5 text-[10px] text-slate-550 mt-1">
                                <p className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-650" />
                                  <span>Joined: {new Date(membership.joinedAt).toLocaleDateString()}</span>
                                </p>
                                {!isActive && (
                                  <p className="flex items-center gap-1 text-red-400/80">
                                    <Clock className="w-3 h-3 text-red-900/60" />
                                    <span>Left: {new Date(membership.leftAt!).toLocaleDateString()}</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingMembershipId(membership.id);
                                  setEditJoinedAt(membership.joinedAt.split('T')[0]);
                                  setEditLeftAt(membership.leftAt ? membership.leftAt.split('T')[0] : '');
                                }}
                                className="p-2 text-slate-500 hover:text-violet-400 hover:bg-violet-950/20 border border-transparent hover:border-violet-900/30 rounded-lg transition-all cursor-pointer"
                                title="Edit membership dates"
                              >
                                <Settings className="w-4 h-4" />
                              </button>

                              {!isSelf && isActive && (
                                <button
                                  onClick={() => handleRemoveMember(membership.userId)}
                                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 rounded-lg transition-all cursor-pointer"
                                  title="Remove member from group"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Membership Timeline */}
            <div className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 shadow-md space-y-6 flex flex-col">
              <h3 className="font-bold text-sm text-slate-200 flex items-center space-x-2 pb-3 border-b border-slate-950">
                <Clock className="w-4 h-4 text-violet-500" />
                <span>Membership Timeline</span>
              </h3>

              <div className="relative border-l border-slate-850 ml-2.5 pl-6 space-y-6 flex-1 py-1">
                {membershipHistory.map((item, idx) => {
                  const hasLeft = item.leftAt !== null;
                  
                  return (
                    <React.Fragment key={item.id}>
                      {hasLeft && (
                        <div className="relative animate-fade-in">
                          <span className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-red-900 border-2 border-slate-900 ring-4 ring-[#070b13]" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-slate-350 flex items-center gap-1 flex-wrap">
                              <strong className="text-slate-200 font-bold">{item.user.name || 'Anonymous'}</strong> 
                              <span className="text-red-400 font-medium">left the group</span>
                            </p>
                            <p className="text-[10px] text-slate-550 font-mono">
                              {new Date(item.leftAt!).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="relative animate-fade-in">
                        <span className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-emerald-950 border-2 border-slate-900 ring-4 ring-[#070b13]" />
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-350 flex items-center gap-1 flex-wrap">
                            <strong className="text-slate-200 font-bold">{item.user.name || 'Anonymous'}</strong> 
                            <span className="text-emerald-400 font-medium">joined the group</span>
                          </p>
                          <p className="text-[10px] text-slate-550 font-mono">
                            {new Date(item.joinedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-6">
            
            {/* List Header */}
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-250 flex items-center space-x-2">
                <Coins className="w-5 h-5 text-violet-500" />
                <span>Expense Ledger</span>
              </h3>
              
              <button
                onClick={() => setExpenseModalOpen(true)}
                className="py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-violet-400 flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Expense</span>
              </button>
            </div>

            {/* Expenses List */}
            {expensesLoading ? (
              <div className="py-20 text-center text-slate-500 space-y-2">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" />
                <p className="text-xs">Loading ledger...</p>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-20 backdrop-blur-xl bg-slate-900/10 border border-dashed border-slate-800/80 rounded-3xl space-y-4">
                <Coins className="w-12 h-12 text-slate-650 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-400">No Expenses Recorded</h3>
                <p className="text-slate-550 text-sm max-w-sm mx-auto">
                  Start tracking splits by adding your first expense. Click the button above to begin.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    onClick={() => setViewExpense(exp)}
                    className="backdrop-blur-xl bg-slate-900/30 hover:bg-slate-900/50 border border-slate-800/80 hover:border-slate-850 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all animate-fade-in group shadow-sm shadow-black/5"
                  >
                    <div className="flex items-start space-x-4">
                      {/* Calendar Icon Badge */}
                      <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-850 flex flex-col items-center justify-center font-mono text-[9px] shrink-0 text-slate-400 group-hover:border-violet-500/20 transition-all">
                        <span className="text-[8px] uppercase font-bold text-slate-600 leading-none">
                          {new Date(exp.date).toLocaleString('default', { month: 'short' })}
                        </span>
                        <span className="text-base font-extrabold text-slate-200 mt-0.5 leading-none">
                          {new Date(exp.date).getDate()}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-slate-200 group-hover:text-violet-400 transition-colors">
                          {exp.description}
                        </h4>
                        <p className="text-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-1">
                          <span>Paid by <strong className="text-slate-350">{exp.payer.name || exp.payer.email}</strong></span>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-900 text-[10px] text-slate-400 font-mono">
                            {exp.splitType} split
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-slate-950 pt-3 sm:pt-0 shrink-0">
                      <div className="text-right space-y-0.5">
                        <p className="text-base font-extrabold text-slate-100">
                          {exp.currency} {(exp.amount / 100).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {exp.participants.length} participant{exp.participants.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Placeholders */}
        {activeTab === 'balances' && (
          <div className="space-y-8 animate-fade-in">
            {balancesLoading ? (
              <div className="py-20 text-center text-slate-500 space-y-2">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" />
                <p className="text-xs">Calculating ledgers...</p>
              </div>
            ) : !balances || Object.keys(balances).length === 0 ? (
              <div className="text-center py-20 backdrop-blur-xl bg-slate-900/10 border border-dashed border-slate-800/80 rounded-3xl space-y-4">
                <DollarSign className="w-12 h-12 text-slate-650 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-400">No Balances Yet</h3>
                <p className="text-slate-550 text-sm max-w-sm mx-auto">
                  Once you add expenses or import sheets, calculated ledgers and simplified debts will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Currency Selector Bar */}
                <div className="flex items-center space-x-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-900 w-fit">
                  {Object.keys(balances).map((cur) => (
                    <button
                      key={cur}
                      onClick={() => setSelectedCurrency(cur)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        selectedCurrency === cur
                          ? 'bg-violet-600 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cur} Balances
                    </button>
                  ))}
                </div>

                {selectedCurrency && balances[selectedCurrency] && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Simplified Debts Netting Paths */}
                    <div className="space-y-4">
                      <h3 className="font-bold text-sm text-slate-200 flex items-center space-x-2">
                        <Coins className="w-4 h-4 text-violet-500" />
                        <span>Simplified Netting</span>
                      </h3>

                      {balances[selectedCurrency].simplifiedDebts.length === 0 ? (
                        <div className="backdrop-blur-xl bg-slate-900/20 border border-slate-805/60 p-6 rounded-2xl text-center space-y-2">
                          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                          <p className="text-xs font-bold text-slate-300">All Settled Up!</p>
                          <p className="text-[10px] text-slate-500">No outstanding balances exist in this currency.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {balances[selectedCurrency].simplifiedDebts.map((debt: any, idx: number) => (
                            <div 
                              key={idx}
                              className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm"
                            >
                              <div className="text-xs space-y-1">
                                <p className="text-slate-350">
                                  <strong className="text-slate-200 font-bold">{debt.fromName}</strong> owes
                                </p>
                                <p className="text-slate-350">
                                  <strong className="text-slate-200 font-bold">{debt.toName}</strong>
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-extrabold text-violet-400">
                                  {selectedCurrency} {debt.amount.toFixed(2)}
                                </p>
                                <button
                                  onClick={() => handlePrefillSettlement(debt.from, debt.to, debt.amount)}
                                  className="mt-1 text-[9px] font-bold text-slate-400 hover:text-slate-200 underline cursor-pointer"
                                >
                                  Record Settlement
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Member Balances Ledger Table */}
                    <div className="lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-sm text-slate-200 flex items-center space-x-2">
                        <Users className="w-4 h-4 text-violet-500" />
                        <span>Member Ledgers (Click to Trace)</span>
                      </h3>

                      <div className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden shadow-md">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs divide-y divide-slate-950">
                            <thead className="bg-slate-950/40 text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                              <tr>
                                <th className="px-5 py-3.5">Member</th>
                                <th className="px-5 py-3.5 text-right">Paid</th>
                                <th className="px-5 py-3.5 text-right">Owed</th>
                                <th className="px-5 py-3.5 text-right">Settled</th>
                                <th className="px-5 py-3.5 text-right">Net Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-950/40">
                              {Object.values(balances[selectedCurrency].ledgers).map((ledger: any) => {
                                const net = ledger.netBalance;
                                return (
                                  <tr 
                                    key={ledger.userId}
                                    onClick={() => setSelectedLedgerUser(ledger)}
                                    className="hover:bg-slate-900/40 cursor-pointer transition-colors"
                                  >
                                    <td className="px-5 py-4 font-bold text-slate-250">
                                      {ledger.name || ledger.email}
                                    </td>
                                    <td className="px-5 py-4 text-right font-mono text-slate-300">
                                      {(ledger.totalPaid).toFixed(2)}
                                    </td>
                                    <td className="px-5 py-4 text-right font-mono text-slate-300">
                                      {(ledger.totalOwed).toFixed(2)}
                                    </td>
                                    <td className="px-5 py-4 text-right font-mono text-slate-355">
                                      {(ledger.settlementsSent - ledger.settlementsReceived).toFixed(2)}
                                    </td>
                                    <td className={`px-5 py-4 text-right font-mono font-extrabold ${
                                      net > 0.005 ? 'text-emerald-400' : net < -0.005 ? 'text-red-400' : 'text-slate-500'
                                    }`}>
                                      {net > 0 ? '+' : ''}{net.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'imports' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-250 flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-violet-500" />
                <span>CSV Staging History</span>
              </h3>
              
              <Link
                href={`/groups/${group.id}/import`}
                className="py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-violet-400 flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New CSV Upload</span>
              </Link>
            </div>

            {importJobsLoading ? (
              <div className="py-20 text-center text-slate-500 space-y-2">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" />
                <p className="text-xs">Loading history...</p>
              </div>
            ) : importJobs.length === 0 ? (
              <div className="text-center py-20 backdrop-blur-xl bg-slate-900/10 border border-dashed border-slate-800/80 rounded-3xl space-y-4">
                <FileSpreadsheet className="w-12 h-12 text-slate-650 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-400">No Import History</h3>
                <p className="text-slate-550 text-sm max-w-sm mx-auto">
                  You haven't uploaded any expense sheets yet. Click the button above to upload a spreadsheet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {importJobs.map((job) => {
                  const uploadDate = new Date(job.createdAt).toLocaleString();
                  const isCompleted = job.status === 'COMPLETED';
                  const isFailed = job.status === 'FAILED';
                  const isReview = job.status === 'REVIEW_QUEUE' || job.status === 'ANOMALY_DETECTED' || job.status === 'PENDING';
                  
                  return (
                    <div
                      key={job.id}
                      className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                    >
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-slate-200">{job.fileName}</h4>
                        <p className="text-xs text-slate-500 font-mono">
                          Uploaded on {uploadDate} • By {job.user.name || job.user.email}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Row count: {job.rowCount} entries
                        </p>
                      </div>

                      <div className="flex items-center space-x-4 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                          isCompleted 
                            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400' 
                            : isFailed 
                              ? 'bg-red-950/20 border-red-900/40 text-red-400' 
                              : 'bg-amber-950/20 border-amber-900/40 text-amber-400'
                        }`}>
                          {job.status}
                        </span>

                        {isReview && (
                          <Link
                            href={`/groups/${group.id}/import/${job.id}`}
                            className="py-1.5 px-3 rounded-lg bg-violet-650 hover:bg-violet-600 text-[10px] font-bold text-white transition-colors cursor-pointer"
                          >
                            Resume Review
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Reports & Audits Tab Content */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            
            {/* Sub Tabs / Pill Selector */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-900 w-fit no-print">
              <button
                onClick={() => setActiveReportTab('balance')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeReportTab === 'balance'
                    ? 'bg-violet-650 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Balances Report</span>
              </button>

              <button
                onClick={() => setActiveReportTab('ledger')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeReportTab === 'ledger'
                    ? 'bg-violet-650 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Member Ledger</span>
              </button>

              <button
                onClick={() => setActiveReportTab('settlement')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeReportTab === 'settlement'
                    ? 'bg-violet-650 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Settlement Log</span>
              </button>

              <button
                onClick={() => setActiveReportTab('imports')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeReportTab === 'imports'
                    ? 'bg-violet-650 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Staging & Import Report</span>
              </button>
            </div>

            {/* Sub Tab Contents */}
            
            {/* 1. Balances Report */}
            {activeReportTab === 'balance' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center no-print">
                  <h3 className="font-bold text-sm text-slate-200">Group Balances Statement</h3>
                  <button
                    onClick={() => window.print()}
                    className="py-1.5 px-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-850 text-xs font-semibold text-violet-400 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Statement</span>
                  </button>
                </div>

                {/* Printable Area Wrapper */}
                <div className="space-y-8 bg-[#070b13] p-0 md:p-6 rounded-2xl border border-transparent md:border-slate-900 print:bg-white print:text-black print:border-transparent print:p-0">
                  
                  {/* Header visible ONLY in print */}
                  <div className="hidden print:block mb-6 space-y-2">
                    <h1 className="text-2xl font-bold text-black">FairShare Statement of Accounts</h1>
                    <p className="text-sm text-slate-650 print:text-slate-700">Group: {group.name}</p>
                    <p className="text-xs text-slate-500 print:text-slate-500">Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                    <hr className="border-slate-300" />
                  </div>

                  {!balances || Object.keys(balances).length === 0 ? (
                    <p className="text-slate-550 text-sm py-10 text-center">No balance records available.</p>
                  ) : (
                    Object.keys(balances).map((cur) => {
                      const curData = balances[cur];
                      return (
                        <div key={cur} className="space-y-6 print:break-inside-avoid">
                          <h4 className="font-bold text-sm text-slate-350 border-b border-slate-900 pb-2 print:text-black print:border-slate-350">
                            Currency: <strong className="text-slate-100 print:text-black">{cur}</strong>
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 print:block print:space-y-6">
                            
                            {/* Simplified Netting */}
                            <div className="space-y-4 print:w-full">
                              <h5 className="font-bold text-xs text-slate-400 uppercase tracking-wider print:text-black">Simplified Debts Netting</h5>
                              {curData.simplifiedDebts.length === 0 ? (
                                <p className="text-xs text-slate-550 italic print:text-slate-600">All debts netted and settled.</p>
                              ) : (
                                <div className="space-y-2.5">
                                  {curData.simplifiedDebts.map((debt: any, idx: number) => (
                                    <div key={idx} className="text-xs p-3 rounded-xl bg-slate-950 border border-slate-900 flex justify-between items-center print:bg-white print:border-slate-300 print:text-black">
                                      <div>
                                        <p className="font-semibold text-slate-300 print:text-black">{debt.fromName}</p>
                                        <p className="text-[10px] text-slate-500 print:text-slate-600 font-mono">owes {debt.toName}</p>
                                      </div>
                                      <p className="font-bold text-violet-400 print:text-black font-mono">{cur} {debt.amount.toFixed(2)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Raw ledgers */}
                            <div className="md:col-span-2 space-y-4 print:w-full">
                              <h5 className="font-bold text-xs text-slate-400 uppercase tracking-wider print:text-black">Individual Ledgers</h5>
                              <div className="overflow-hidden border border-slate-900 rounded-xl print:border-slate-300">
                                <table className="w-full text-left text-xs divide-y divide-slate-950 print:divide-slate-300">
                                  <thead className="bg-slate-950/40 text-slate-400 uppercase tracking-widest text-[9px] font-bold print:bg-slate-100 print:text-black">
                                    <tr>
                                      <th className="px-4 py-2.5">Member</th>
                                      <th className="px-4 py-2.5 text-right">Paid</th>
                                      <th className="px-4 py-2.5 text-right">Owed</th>
                                      <th className="px-4 py-2.5 text-right">Settled</th>
                                      <th className="px-4 py-2.5 text-right">Net Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-900/60 print:divide-slate-300 print:text-black">
                                    {Object.values(curData.ledgers).map((ledger: any) => {
                                      const net = ledger.netBalance;
                                      return (
                                        <tr key={ledger.userId} className="print:bg-white">
                                          <td className="px-4 py-3 font-semibold text-slate-200 print:text-black">{ledger.name || ledger.email}</td>
                                          <td className="px-4 py-3 text-right font-mono text-slate-400 print:text-black">{(ledger.totalPaid).toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-mono text-slate-400 print:text-black">{(ledger.totalOwed).toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-mono text-slate-400 print:text-black">{(ledger.settlementsSent - ledger.settlementsReceived).toFixed(2)}</td>
                                          <td className={`px-4 py-3 text-right font-mono font-bold ${
                                            net > 0.005 ? 'text-emerald-400 print:text-black' : net < -0.005 ? 'text-red-400 print:text-black' : 'text-slate-500'
                                          }`}>
                                            {net > 0 ? '+' : ''}{net.toFixed(2)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 2. Member Ledger Sheet */}
            {activeReportTab === 'ledger' && (
              <div className="space-y-6">
                
                {/* Selector Dropdown & Export Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
                  <div className="flex items-center space-x-3">
                    <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">Member Ledger for:</label>
                    <select
                      value={reportLedgerUserId}
                      onChange={(e) => setReportLedgerUserId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 outline-none focus:border-violet-500"
                    >
                      {group.memberships.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user.name || m.user.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {reportLedgerData && reportLedgerData.expenses && reportLedgerData.expenses.length > 0 && (
                    <button
                      onClick={() => exportMemberLedgerToCsv(reportLedgerData.userName, reportLedgerData.expenses)}
                      className="py-1.5 px-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-850 text-xs font-semibold text-violet-400 flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download CSV</span>
                    </button>
                  )}
                </div>

                {reportLedgerLoading ? (
                  <div className="py-20 text-center text-slate-500 space-y-2">
                    <Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" />
                    <p className="text-xs">Loading ledger transactions...</p>
                  </div>
                ) : !reportLedgerData || !reportLedgerData.expenses || reportLedgerData.expenses.length === 0 ? (
                  <div className="text-center py-20 bg-slate-900/10 border border-dashed border-slate-800/80 rounded-2xl">
                    <p className="text-slate-500 text-xs">No transactions registered for this member.</p>
                  </div>
                ) : (
                  <div className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden shadow-md print:bg-white print:text-black print:border-slate-300">
                    
                    {/* Print Only Header */}
                    <div className="hidden print:block p-6 border-b border-slate-300 space-y-1">
                      <h2 className="text-xl font-bold text-black font-sans">Member Statement of Ledger</h2>
                      <p className="text-sm text-slate-700 font-sans">Member: {reportLedgerData.userName} ({reportLedgerData.userEmail})</p>
                      <p className="text-xs text-slate-500 font-sans">Group: {group.name} | Base Currency: {group.defaultCurrency}</p>
                      <p className="text-xs text-slate-550 font-sans">Generated on {new Date().toLocaleDateString()}</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs divide-y divide-slate-950 print:divide-slate-300">
                        <thead className="bg-slate-950/40 text-slate-400 uppercase tracking-widest text-[9px] font-bold print:bg-slate-100 print:text-black">
                          <tr>
                            <th className="px-5 py-3.5">Date</th>
                            <th className="px-5 py-3.5">Description</th>
                            <th className="px-5 py-3.5 text-right">Total Amount</th>
                            <th className="px-5 py-3.5 text-center">My Role</th>
                            <th className="px-5 py-3.5 text-right">Paid Amount</th>
                            <th className="px-5 py-3.5 text-right">Owed Amount</th>
                            <th className="px-5 py-3.5 text-right">Net Impact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-950/40 print:divide-slate-300 print:text-black">
                          {reportLedgerData.expenses.map((exp: any) => {
                            const impactVal = parseFloat(exp.netImpact);
                            return (
                              <tr key={exp.id} className="hover:bg-slate-900/10 print:bg-white">
                                <td className="px-5 py-4 font-mono text-[10px] text-slate-450 print:text-black">
                                  {exp.date.split('T')[0]}
                                </td>
                                <td className="px-5 py-4 font-semibold text-slate-200 print:text-black">
                                  {exp.description}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-300 print:text-black">
                                  {exp.currency} {exp.amount}
                                </td>
                                <td className="px-5 py-4 text-center">
                                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded print:border print:text-black ${
                                    exp.role === 'PAYER'
                                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                                      : exp.role === 'BOTH'
                                        ? 'bg-blue-950/40 text-blue-400 border-blue-900/30'
                                        : 'bg-slate-950/40 text-slate-400 border-slate-900'
                                  }`}>
                                    {exp.role}
                                  </span>
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-300 print:text-black">
                                  {parseFloat(exp.paidAmount) > 0 ? `${exp.currency} ${exp.paidAmount}` : '-'}
                                </td>
                                <td className="px-5 py-4 text-right font-mono text-slate-300 print:text-black">
                                  {parseFloat(exp.owedAmount) > 0 ? `${exp.currency} ${exp.owedAmount}` : '-'}
                                </td>
                                <td className={`px-5 py-4 text-right font-mono font-bold ${
                                  impactVal > 0.005 ? 'text-emerald-400 print:text-black' : impactVal < -0.005 ? 'text-red-400 print:text-black' : 'text-slate-500'
                                }`}>
                                  {impactVal > 0 ? '+' : ''}{exp.netImpact}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Settlement History Log */}
            {activeReportTab === 'settlement' && (
              <div className="space-y-6">
                
                <div className="flex justify-between items-center no-print">
                  <h3 className="font-bold text-sm text-slate-200">Point-to-Point Settlement Log</h3>
                  {reportSettlementData.length > 0 && (
                    <button
                      onClick={() => exportSettlementsToCsv(reportSettlementData)}
                      className="py-1.5 px-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-850 text-xs font-semibold text-violet-400 flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download CSV</span>
                    </button>
                  )}
                </div>

                {reportSettlementLoading ? (
                  <div className="py-20 text-center text-slate-550 space-y-2">
                    <Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" />
                    <p className="text-xs">Loading settlement audit trails...</p>
                  </div>
                ) : reportSettlementData.length === 0 ? (
                  <div className="text-center py-20 bg-slate-900/10 border border-dashed border-slate-800/80 rounded-2xl">
                    <p className="text-slate-500 text-xs">No settlements recorded yet in this group.</p>
                  </div>
                ) : (
                  <div className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden shadow-md print:bg-white print:text-black print:border-slate-300">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs divide-y divide-slate-950 print:divide-slate-300">
                        <thead className="bg-slate-950/40 text-slate-400 uppercase tracking-widest text-[9px] font-bold print:bg-slate-100 print:text-black">
                          <tr>
                            <th className="px-5 py-3.5">Date</th>
                            <th className="px-5 py-3.5">Payer</th>
                            <th className="px-5 py-3.5">Payee</th>
                            <th className="px-5 py-3.5 text-right">Amount</th>
                            <th className="px-5 py-3.5 text-center">Status</th>
                            <th className="px-5 py-3.5">Auditing & Cancellation Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-950/40 print:divide-slate-300 print:text-black">
                          {reportSettlementData.map((s: any) => {
                            const isReversed = s.deletedAt !== null;
                            return (
                              <tr key={s.id} className={`hover:bg-slate-900/10 print:bg-white ${isReversed ? 'bg-slate-950/10 text-slate-550 print:text-slate-400' : ''}`}>
                                <td className="px-5 py-4 font-mono text-[10px] text-slate-450 print:text-black">
                                  {s.date.split('T')[0]}
                                </td>
                                <td className={`px-5 py-4 font-semibold print:text-black ${isReversed ? 'line-through text-slate-550' : 'text-slate-200'}`}>
                                  {s.payerName}
                                </td>
                                <td className={`px-5 py-4 font-semibold print:text-black ${isReversed ? 'line-through text-slate-550' : 'text-slate-200'}`}>
                                  {s.payeeName}
                                </td>
                                <td className={`px-5 py-4 text-right font-mono font-bold print:text-black ${isReversed ? 'line-through text-slate-550' : 'text-slate-100'}`}>
                                  {s.currency} {s.amount}
                                </td>
                                <td className="px-5 py-4 text-center">
                                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded print:border print:text-black ${
                                    isReversed
                                      ? 'bg-red-950/25 border-red-900/30 text-red-400'
                                      : 'bg-emerald-950/25 border-emerald-900/30 text-emerald-400'
                                  }`}>
                                    {isReversed ? 'REVERSED' : 'ACTIVE'}
                                  </span>
                                </td>
                                <td className="px-5 py-4 text-xs text-slate-450 print:text-slate-650">
                                  {isReversed ? (
                                    <span className="flex items-center space-x-1 text-red-400 font-semibold print:text-black">
                                      <Info className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                      <span>Cancelled by {s.deletedBy} on {new Date(s.deletedAt!).toLocaleDateString()}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 italic">Valid active payment</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Import Staging Audit Report */}
            {activeReportTab === 'imports' && (
              <div className="space-y-6">
                <h3 className="font-bold text-sm text-slate-200">CSV Imports & Anomaly Audit Summary</h3>
                
                {reportImportLoading ? (
                  <div className="py-20 text-center text-slate-500 space-y-2">
                    <Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" />
                    <p className="text-xs">Loading import audit trail...</p>
                  </div>
                ) : reportImportData.length === 0 ? (
                  <div className="text-center py-20 bg-slate-900/10 border border-dashed border-slate-800/80 rounded-2xl">
                    <p className="text-slate-500 text-xs">No import jobs recorded.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 print:block print:space-y-4">
                    {reportImportData.map((job: any) => {
                      const uploadDate = new Date(job.uploadedAt).toLocaleString();
                      
                      return (
                        <div
                          key={job.id}
                          className="backdrop-blur-xl bg-slate-900/30 border border-slate-800/80 p-5 rounded-2xl space-y-3 shadow-sm print:bg-white print:text-black print:border-slate-300"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-950 pb-2 print:border-slate-200">
                            <div>
                              <h4 className="font-bold text-sm text-slate-200 print:text-black">{job.fileName}</h4>
                              <p className="text-[10px] text-slate-500 font-mono">
                                Job ID: {job.id} • Uploaded by {job.uploadedBy} on {uploadDate}
                              </p>
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border self-start sm:self-auto ${
                              job.status === 'COMPLETED'
                                ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400 print:text-emerald-700'
                                : 'bg-amber-950/20 border-amber-900/40 text-amber-400 print:text-amber-700'
                            }`}>
                              {job.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-slate-550 block">Row Count</span>
                              <strong className="text-slate-200 print:text-black font-semibold">{job.rowCount} entries</strong>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-slate-550 block">Identified Anomalies</span>
                              <strong className="text-slate-200 print:text-black font-semibold">{job.anomaliesCount}</strong>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-slate-550 block">Resolved / Overridden</span>
                              <strong className="text-slate-200 print:text-black font-semibold">
                                {job.resolvedCount} Resolved • {job.overriddenCount} Overridden
                              </strong>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-slate-550 block">Skipped / Unresolved</span>
                              <strong className="text-slate-250 print:text-black font-semibold">
                                {job.skippedCount} Skipped • {job.unresolvedCount} Left
                              </strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </main>

      {/* ADD EXPENSE MODAL */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="backdrop-blur-xl bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 relative my-8">
            <button
              onClick={() => setExpenseModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent mb-4 flex items-center space-x-2">
              <Coins className="w-5 h-5 text-violet-500" />
              <span>Record Expense</span>
            </h2>

            {expenseFormError && (
              <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                {expenseFormError}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Description */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dinner, Grocery shopping"
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100 placeholder-slate-650"
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100 placeholder-slate-650"
                  />
                </div>

                {/* Currency */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Currency</label>
                  <select
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  />
                </div>

                {/* Payer */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Paid By</label>
                  <select
                    value={expPayer}
                    onChange={(e) => setExpPayer(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  >
                    {activeMembersOnExpDate.map(m => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name || m.user.email} {m.userId === session?.user?.id ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Split Type */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Split Type</label>
                  <select
                    value={expSplitType}
                    onChange={(e) => setExpSplitType(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  >
                    <option value="EQUAL">Equally</option>
                    <option value="UNEQUAL">Unequally (Exact amounts)</option>
                    <option value="PERCENTAGE">By Percentages (%)</option>
                    <option value="SHARES">By Share count weights</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Participants list */}
              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Split Participants</label>
                
                {activeMembersOnExpDate.length === 0 ? (
                  <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-3 rounded-lg">
                    There are no active group members on the selected date. Please adjust the expense date or add members in the members tab.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-slate-850 rounded-xl divide-y divide-slate-950 bg-slate-950/40 p-2 space-y-2">
                    {activeMembersOnExpDate.map((membership) => {
                      const uid = membership.userId;
                      const userShare = participantShares[uid] || { checked: false, value: '' };

                      return (
                        <div key={uid} className="flex items-center justify-between p-2 first:pt-1 last:pb-1">
                          <label className="flex items-center space-x-3 text-xs text-slate-200 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={userShare.checked}
                              onChange={(e) => {
                                setParticipantShares(prev => ({
                                  ...prev,
                                  [uid]: { ...prev[uid], checked: e.target.checked }
                                }));
                              }}
                              className="rounded border-slate-800 text-violet-600 focus:ring-violet-500/20"
                            />
                            <span>{membership.user.name || membership.user.email}</span>
                          </label>

                          {/* Render input values if split is unequal/percentage/share */}
                          {userShare.checked && expSplitType !== 'EQUAL' && (
                            <div className="relative flex items-center">
                              {expSplitType === 'UNEQUAL' && (
                                <span className="absolute left-3 text-[10px] font-bold text-slate-500">{expCurrency}</span>
                              )}
                              <input
                                type="number"
                                step="any"
                                required
                                placeholder={expSplitType === 'PERCENTAGE' ? '0' : '0.00'}
                                value={userShare.value}
                                onChange={(e) => {
                                  setParticipantShares(prev => ({
                                    ...prev,
                                    [uid]: { ...prev[uid], value: e.target.value }
                                  }));
                                }}
                                className={`w-24 px-3 py-1.5 text-xs text-right bg-slate-950 border border-slate-850 focus:border-violet-500/50 outline-none rounded-lg text-slate-100 ${
                                  expSplitType === 'UNEQUAL' ? 'pl-8' : 'pr-6'
                                }`}
                              />
                              {expSplitType === 'PERCENTAGE' && (
                                <span className="absolute right-3 text-[10px] font-semibold text-slate-500">%</span>
                              )}
                              {expSplitType === 'SHARES' && (
                                <span className="absolute right-2 text-[8px] font-bold uppercase tracking-wider text-slate-550">sh</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-4 border-t border-slate-950 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-850 text-slate-400 hover:text-slate-350 hover:bg-slate-800/40 transition-all text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseFormLoading || activeMembersOnExpDate.length === 0}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {expenseFormLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Record Expense</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPENSE DETAIL OVERLAY */}
      {viewExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="backdrop-blur-xl bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setViewExpense(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-6">
              {/* Header Info */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 bg-violet-950/30 border border-violet-900/30 px-2.5 py-1 rounded-full">
                  Expense Details
                </span>
                <h2 className="text-xl font-bold text-slate-150 pt-2">{viewExpense.description}</h2>
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-650" />
                  <span>Incurred on {new Date(viewExpense.date).toLocaleDateString()}</span>
                </p>
              </div>

              {/* Amount Showcase */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-850 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Spent</p>
                  <p className="text-2xl font-extrabold text-slate-100">
                    {viewExpense.currency} {(viewExpense.amount / 100).toFixed(2)}
                  </p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Paid By</p>
                  <p className="text-sm font-bold text-slate-200">
                    {viewExpense.payer.name || viewExpense.payer.email}
                  </p>
                </div>
              </div>

              {/* Splits List */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-500" />
                  <span>Calculated Splits ({viewExpense.splitType})</span>
                </h4>
                
                <div className="border border-slate-850 rounded-xl bg-slate-950/30 divide-y divide-slate-950 p-2 space-y-2 max-h-48 overflow-y-auto">
                  {viewExpense.participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 text-xs text-slate-350 first:pt-1 last:pb-1">
                      <span className="font-medium">{p.user.name || p.user.email}</span>
                      <div className="text-right font-mono">
                        <span className="text-slate-100 font-bold">
                          {viewExpense.currency} {(p.owedAmount / 100).toFixed(2)}
                        </span>
                        {viewExpense.splitType !== 'EQUAL' && (
                          <span className="text-[10px] text-slate-500 block">
                            Share: {p.splitValue}
                            {viewExpense.splitType === 'PERCENTAGE' ? '%' : 
                             viewExpense.splitType === 'SHARES' ? ' shares' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-950 flex justify-between items-center">
                <button
                  onClick={() => handleDeleteExpense(viewExpense.id)}
                  className="py-2.5 px-4 rounded-xl bg-red-950/20 hover:bg-red-950/50 border border-red-900/50 text-red-400 text-xs font-semibold cursor-pointer flex items-center space-x-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Expense</span>
                </button>

                <button
                  onClick={() => setViewExpense(null)}
                  className="py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* RECORD SETTLEMENT MODAL */}
      {settlementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="backdrop-blur-xl bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 relative my-8">
            <button
              onClick={() => setSettlementModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent mb-4 flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-violet-500" />
              <span>Record Settlement</span>
            </h2>

            {settlementError && (
              <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                {settlementError}
              </div>
            )}

            <form onSubmit={handleRecordSettlement} className="space-y-4">
              {/* Payer (Debtor) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Sender (Debtor)</label>
                <select
                  value={setPayPayer}
                  onChange={(e) => setSetPayPayer(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                >
                  <option value="">-- Select Debtor --</option>
                  {activeMemberships.map(m => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name || m.user.email} {m.userId === session?.user?.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payee (Creditor) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Recipient (Creditor)</label>
                <select
                  value={setPayPayee}
                  onChange={(e) => setSetPayPayee(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                >
                  <option value="">-- Select Creditor --</option>
                  {activeMemberships.map(m => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name || m.user.email} {m.userId === session?.user?.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Amount Paid</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={setPayAmount}
                  onChange={(e) => setSetPayAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                />
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Currency</label>
                <select
                  value={setPayCurrency}
                  onChange={(e) => setSetPayCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Date</label>
                <input
                  type="date"
                  required
                  value={setPayDate}
                  onChange={(e) => setSetPayDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                />
              </div>

              <div className="pt-4 border-t border-slate-950 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setSettlementModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-850 text-slate-400 hover:text-slate-350 hover:bg-slate-800/40 transition-all text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settlementLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {settlementLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Record Payment</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* TRANSACTION TRAIL OVERLAY */}
      {selectedLedgerUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="backdrop-blur-xl bg-slate-900 border border-slate-805 w-full max-w-lg rounded-2xl shadow-2xl p-6 relative my-8">
            <button
              onClick={() => setSelectedLedgerUser(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-6">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 bg-violet-950/30 border border-violet-900/30 px-2.5 py-1 rounded-full">
                  Traceable Balance Trail
                </span>
                <h2 className="text-xl font-bold text-slate-150 pt-2">
                  {selectedLedgerUser.name || selectedLedgerUser.email}'s Ledger
                </h2>
                <p className="text-xs text-slate-500">
                  Explaining the exact calculation that determines this member's net balance.
                </p>
              </div>

              {/* Aggregation summary cards */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950 border border-slate-850 p-4 rounded-xl text-xs">
                <div className="space-y-1">
                  <p className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">Total Paid</p>
                  <p className="text-sm font-bold text-slate-200">{selectedCurrency} {selectedLedgerUser.totalPaid.toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">Total Owed</p>
                  <p className="text-sm font-bold text-slate-200">{selectedCurrency} {selectedLedgerUser.totalOwed.toFixed(2)}</p>
                </div>
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <p className="text-slate-550 uppercase tracking-widest text-[8px] font-bold">Settles Sent</p>
                  <p className="text-xs font-semibold text-slate-300">{selectedCurrency} {selectedLedgerUser.settlementsSent.toFixed(2)}</p>
                </div>
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <p className="text-slate-550 uppercase tracking-widest text-[8px] font-bold">Settles Recv</p>
                  <p className="text-xs font-semibold text-slate-300">{selectedCurrency} {selectedLedgerUser.settlementsReceived.toFixed(2)}</p>
                </div>
                <div className="col-span-2 pt-3 border-t border-slate-900 flex justify-between items-center text-slate-100 font-extrabold text-sm">
                  <span>Net Ledger Balance</span>
                  <span className={selectedLedgerUser.netBalance > 0.005 ? 'text-emerald-400' : selectedLedgerUser.netBalance < -0.005 ? 'text-red-400' : 'text-slate-500'}>
                    {selectedLedgerUser.netBalance > 0 ? '+' : ''}{selectedLedgerUser.netBalance.toFixed(2)} {selectedCurrency}
                  </span>
                </div>
              </div>

              {/* Timeline trail of individual actions */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaction Trail (Audit Log)</h4>
                
                {selectedLedgerUser.trail.length === 0 ? (
                  <p className="text-xs text-slate-550 text-center py-6 bg-slate-950/40 border border-slate-850 rounded-xl">
                    No transactions recorded in this currency.
                  </p>
                ) : (
                  <div className="border border-slate-850 rounded-xl bg-slate-950/30 divide-y divide-slate-950 p-2 space-y-2 max-h-52 overflow-y-auto">
                    {selectedLedgerUser.trail.map((item: any) => {
                      const isExpense = item.type === 'EXPENSE';
                      
                      return (
                        <div key={item.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-900/30 rounded-lg transition-colors">
                          <div className="space-y-1 pr-4">
                            <p className="font-bold text-slate-200">{item.description}</p>
                            <p className="text-[9px] text-slate-500 font-mono">
                              {new Date(item.date).toLocaleDateString()} • Role: <strong className="text-slate-400 font-bold">{item.role}</strong>
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {isExpense ? (
                              <>
                                <p className="font-mono text-red-450 font-semibold text-red-400/90">
                                  - {selectedCurrency} {item.personalShare.toFixed(2)}
                                </p>
                                {item.role.includes('PAYER') && (
                                  <p className="text-[9px] text-emerald-400 font-bold font-mono">
                                    + {selectedCurrency} {item.amount.toFixed(2)} paid
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className={`font-mono font-bold ${
                                item.role === 'SENDER' ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {item.role === 'SENDER' ? '+' : '-'} {selectedCurrency} {item.personalShare.toFixed(2)}
                              </p>
                            )}
                            {!isExpense && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSettlement(item.id);
                                }}
                                className="mt-1 text-[9px] text-red-400 hover:text-red-300 flex items-center justify-end space-x-0.5 ml-auto cursor-pointer"
                                title="Delete settlement payment"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLedgerUser(null)}
                  className="py-2.5 px-6 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Close Trace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
