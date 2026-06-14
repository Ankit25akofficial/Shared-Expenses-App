'use client';

import React, { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Coins, FileSpreadsheet, Loader2, 
  AlertTriangle, CheckCircle, HelpCircle, Save,
  X, Eye, Edit3, Trash2, Check, RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Membership {
  userId: string;
  user: Member;
}

interface Group {
  id: string;
  name: string;
  defaultCurrency: string;
  memberships: Membership[];
}

interface Anomaly {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  originalValue: string | null;
  suggestedFix: string | null;
  status: 'UNRESOLVED' | 'RESOLVED' | 'OVERRIDDEN' | 'SKIPPED';
}

interface StagedRow {
  id: string;
  rowNumber: number;
  rawData: any;
  status: 'UNRESOLVED' | 'RESOLVED' | 'OVERRIDDEN' | 'SKIPPED';
  normalizedExpense: {
    description: string;
    amount: number;
    currency: string;
    date: string | null;
    payerId?: string; // added during resolve/manual map
    payerName?: string; // from raw CSV
    splitType: 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARES';
    participants?: { userId: string; splitValue: number }[];
  } | null;
  anomalies: Anomaly[];
}

interface ImportJob {
  id: string;
  fileName: string;
  status: 'PENDING' | 'VALIDATING' | 'NORMALIZING' | 'ANOMALY_DETECTED' | 'REVIEW_QUEUE' | 'COMPLETED' | 'FAILED' | 'REJECTED';
  rowCount: number;
  rows: StagedRow[];
}

export default function ImportReviewPage({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id: groupId, jobId } = use(params);
  const { status } = useSession();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Row editing states
  const [editingRow, setEditingRow] = useState<StagedRow | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPayer, setEditPayer] = useState('');
  const [editSplitType, setEditSplitType] = useState<'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARES'>('EQUAL');
  const [editParts, setEditParts] = useState<{ [userId: string]: { checked: boolean; value: string } }>({});
  
  const [rowSaveLoading, setRowSaveLoading] = useState(false);
  const [rowError, setRowError] = useState('');

  // Commit States (Stage 7/8)
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitReport, setCommitReport] = useState<any>(null);

  // Fetch job details and group members
  const loadPageData = async () => {
    try {
      const [groupRes, jobRes] = await Promise.all([
        fetch(`/api/groups/${groupId}`),
        fetch(`/api/groups/${groupId}/imports/${jobId}`),
      ]);

      const groupData = await groupRes.json();
      const jobData = await jobRes.json();

      if (!groupRes.ok) throw new Error(groupData.error || 'Failed to fetch group.');
      if (!jobRes.ok) throw new Error(jobData.error || 'Failed to fetch import job.');

      setGroup(groupData.group);
      setJob(jobData.job);
    } catch (err: any) {
      setError(err.message || 'Failed to load staging data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      loadPageData();
    }
  }, [status, groupId, jobId]);

  const handleStartEdit = (row: StagedRow) => {
    setEditingRow(row);
    setRowError('');

    const exp = row.normalizedExpense;
    if (exp) {
      setEditDesc(exp.description);
      setEditAmount(exp.amount ? exp.amount.toString() : '');
      setEditCurrency(exp.currency || group?.defaultCurrency || 'INR');
      setEditDate(exp.date ? exp.date.split('T')[0] : '');
      setEditPayer(exp.payerId || '');
      setEditSplitType(exp.splitType || 'EQUAL');

      // Initialize participant mappings
      const partsMap: { [userId: string]: { checked: boolean; value: string } } = {};
      
      // Default to checking everyone who belongs to the group on that date
      const activeMembers = group?.memberships || [];
      activeMembers.forEach(m => {
        const matchingPart = exp.participants?.find(p => p.userId === m.userId);
        partsMap[m.userId] = {
          checked: !!matchingPart,
          value: matchingPart ? matchingPart.splitValue.toString() : 
                 exp.splitType === 'PERCENTAGE' ? (100 / activeMembers.length).toFixed(1) : '1',
        };
      });

      setEditParts(partsMap);
    }
  };

  const handleSaveRowEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow || !group) return;
    setRowError('');

    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setRowError('Please enter a positive amount.');
      return;
    }

    if (!editPayer) {
      setRowError('Please select a payer.');
      return;
    }

    if (!editDate) {
      setRowError('Please select a date.');
      return;
    }

    const selectedParticipants = Object.keys(editParts)
      .filter(uid => editParts[uid].checked)
      .map(uid => ({
        userId: uid,
        splitValue: parseFloat(editParts[uid].value) || 0,
      }));

    if (selectedParticipants.length === 0) {
      setRowError('Please select at least one participant.');
      return;
    }

    // Split validation
    if (editSplitType === 'PERCENTAGE') {
      const sum = selectedParticipants.reduce((s, p) => s + p.splitValue, 0);
      if (Math.abs(sum - 100) > 0.1) {
        setRowError(`Percentages must sum to 100%. Currently: ${sum}%`);
        return;
      }
    } else if (editSplitType === 'UNEQUAL') {
      const sum = selectedParticipants.reduce((s, p) => s + p.splitValue, 0);
      if (Math.abs(sum - amountNum) > 0.01) {
        setRowError(`Split amounts must equal total cost (${amountNum}). Currently: ${sum}`);
        return;
      }
    }

    setRowSaveLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/imports/${jobId}/rows/${editingRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalizedExpense: {
            description: editDesc,
            amount: amountNum,
            currency: editCurrency,
            date: new Date(editDate).toISOString(),
            payerId: editPayer,
            splitType: editSplitType,
            participants: selectedParticipants,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update row.');

      setEditingRow(null);
      loadPageData(); // Refresh list to reflect resolutions
    } catch (err: any) {
      setRowError(err.message || 'Failed to save row.');
    } finally {
      setRowSaveLoading(false);
    }
  };

  const handleSkipRow = async (rowId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/imports/${jobId}/rows/${rowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipRow: true }),
      });
      if (!res.ok) throw new Error('Failed to skip row.');
      loadPageData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCommitImport = async () => {
    if (!job) return;

    setCommitLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/imports/${jobId}/commit`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to commit import.');

      setCommitReport(data.report);
    } catch (err: any) {
      setError(err.message || 'An error occurred during database persistence.');
    } finally {
      setCommitLoading(false);
    }
  };

  const handleCancelImport = async () => {
    if (!confirm('Are you sure you want to cancel? This will discard this staging job.')) {
      return;
    }
    try {
      const res = await fetch(`/api/groups/${groupId}/imports/${jobId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to discard import.');
      router.push(`/groups/${groupId}`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-slate-400 text-sm">Parsing & validating rows...</p>
        </div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-100 p-6">
        <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl text-center space-y-6 max-w-md w-full">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-200">Import Job Error</h2>
          <p className="text-sm text-slate-400">{error}</p>
          <Link href={`/groups/${groupId}`} className="inline-block py-2.5 px-5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-violet-400 font-semibold hover:bg-slate-900 transition-all">
            Return to Group
          </Link>
        </div>
      </div>
    );
  }

  // Stage 8: If import completed successfully, render final report
  if (commitReport) {
    return (
      <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans overflow-hidden items-center justify-center p-6">
        <div className="max-w-md w-full backdrop-blur-xl bg-slate-900/50 border border-slate-800/85 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-900 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
              Import Completed
            </h2>
            <p className="text-xs text-slate-400">
              CSV data has been successfully committed to the database ledger (Stage 8).
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-850 text-left text-xs font-mono space-y-3 text-slate-300">
            <p className="font-bold text-violet-400 uppercase tracking-widest text-[9px]">Import Report Summary:</p>
            <p>• Job ID: {jobId.slice(0, 8)}...</p>
            <p>• Expenses Committed: {commitReport.rowsCommitted} rows</p>
            <p>• Rows Skipped: {commitReport.rowsSkipped} rows</p>
            <p>• Total Amount Added: {group?.defaultCurrency} {(commitReport.totalSubunitsAdded / 100).toFixed(2)}</p>
          </div>

          <button
            onClick={() => router.push(`/groups/${groupId}`)}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-600/10"
          >
            Go to Group Ledger
          </button>
        </div>
      </div>
    );
  }

  // Count active resolved and skipped rows
  const totalRows = job!.rows.length;
  const activeRows = job!.rows.filter(r => r.status !== 'SKIPPED');
  const skippedCount = totalRows - activeRows.length;
  
  // Find outstanding anomalies
  const unresolvedAnomalies = activeRows.reduce((sum, r) => 
    sum + r.anomalies.filter(a => a.status === 'UNRESOLVED').length
  , 0);

  return (
    <div className="relative min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="backdrop-blur-md bg-slate-950/40 border-b border-slate-900/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button 
              onClick={handleCancelImport}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 bg-slate-950 border border-slate-900 rounded-lg cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400 font-medium">Cancel and discard</span>
          </div>

          <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
            Review Queue
          </span>
        </div>
      </header>

      {/* Main Review Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 z-10 space-y-8 flex flex-col">
        
        {/* Meta Bar */}
        <div className="backdrop-blur-xl bg-slate-900/20 border border-slate-800/60 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-violet-500" />
              <span>{job!.fileName}</span>
            </h1>
            <p className="text-xs text-slate-500">
              Uploaded staged database entries ready for ledger verification
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right space-y-0.5 hidden sm:block">
              <p className="text-xs text-slate-400 font-medium">Staged Status:</p>
              <p className="text-[10px] text-slate-500 font-mono">
                {totalRows} Rows ({skippedCount} Skipped)
              </p>
            </div>

            <button
              onClick={handleCommitImport}
              disabled={commitLoading || unresolvedAnomalies > 0}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {commitLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Committing...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Approve & Commit Import</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Global warnings info */}
        {unresolvedAnomalies > 0 && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/30 text-amber-300 text-xs flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5 animate-bounce" />
            <div className="space-y-1">
              <p className="font-semibold">Staged Warnings Unresolved ({unresolvedAnomalies})</p>
              <p className="text-amber-400/80">
                You cannot commit the import because the anomaly engine has identified active warning points. Please resolve them using **Edit** or choose **Skip** on rows you wish to ignore.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Rows Listing Queue */}
        <div className="space-y-4">
          {job!.rows.map((row) => {
            const hasAnoms = row.anomalies.filter(a => a.status === 'UNRESOLVED').length > 0;
            const isSkipped = row.status === 'SKIPPED';
            const exp = row.normalizedExpense;

            return (
              <div 
                key={row.id}
                className={`backdrop-blur-xl border p-5 rounded-2xl transition-all duration-200 flex flex-col gap-4 ${
                  isSkipped 
                    ? 'bg-slate-950/10 border-slate-950 opacity-40' 
                    : hasAnoms 
                      ? 'bg-slate-900/30 border-amber-900/30 hover:border-amber-800/40 shadow-sm shadow-amber-950/5' 
                      : 'bg-slate-900/20 border-slate-800/80 hover:border-slate-850 shadow-sm shadow-black/5'
                }`}
              >
                {/* Top Row bar */}
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-md bg-slate-950 border border-slate-850 flex items-center justify-center font-mono text-[10px] font-bold text-slate-500 shrink-0">
                      {row.rowNumber}
                    </span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-slate-250 flex items-center gap-2">
                        <span>{exp?.description || 'No Description'}</span>
                        {isSkipped && (
                          <span className="text-[8px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                            SKIPPED
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {exp?.date ? new Date(exp.date).toLocaleDateString() : 'Invalid Date'} • Paid by {exp?.payerName || 'Unknown Payer'} • {exp?.splitType} split
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 self-end sm:self-auto shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-slate-200">
                        {exp?.currency} {exp?.amount ? exp.amount.toFixed(2) : '0.00'}
                      </p>
                    </div>

                    {!isSkipped && (
                      <div className="flex space-x-1.5">
                        <button
                          onClick={() => handleStartEdit(row)}
                          className="p-2 bg-slate-950 border border-slate-850 hover:border-slate-800 hover:text-violet-400 rounded-lg text-slate-450 transition-all cursor-pointer"
                          title="Edit staged row settings"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleSkipRow(row.id)}
                          className="p-2 bg-slate-950 border border-slate-850 hover:border-slate-800 hover:text-red-400 rounded-lg text-slate-450 transition-all cursor-pointer"
                          title="Skip importing this row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Anomalies listed under row */}
                {!isSkipped && row.anomalies.length > 0 && (
                  <div className="mt-2 border-t border-slate-950 pt-3 space-y-2">
                    {row.anomalies.map((anom) => (
                      <div 
                        key={anom.id}
                        className={`p-3 rounded-xl border text-[11px] flex items-start space-x-2.5 ${
                          anom.status !== 'UNRESOLVED'
                            ? 'bg-slate-950/20 border-slate-900 text-slate-500'
                            : anom.severity === 'CRITICAL' || anom.severity === 'HIGH'
                              ? 'bg-red-950/10 border-red-950/30 text-red-300'
                              : 'bg-amber-950/10 border-amber-950/20 text-amber-300'
                        }`}
                      >
                        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                          anom.status !== 'UNRESOLVED' ? 'text-slate-650' : 
                          anom.severity === 'CRITICAL' || anom.severity === 'HIGH' ? 'text-red-400' : 'text-amber-400'
                        }`} />
                        <div className="space-y-1">
                          <p className="font-semibold flex items-center gap-1.5">
                            <span>[{anom.severity}] {anom.message}</span>
                            {anom.status !== 'UNRESOLVED' && (
                              <span className="text-[8px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-850 text-slate-500 font-bold uppercase shrink-0">
                                {anom.status}
                              </span>
                            )}
                          </p>
                          {anom.status === 'UNRESOLVED' && anom.suggestedFix && (
                            <p className="text-[10px] text-slate-400 italic">
                              Suggested Fix: {anom.suggestedFix}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* ROW EDIT DIALOG */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="backdrop-blur-xl bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 relative my-8">
            <button
              onClick={() => setEditingRow(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent mb-4">
              Edit Staged Row #{editingRow.rowNumber}
            </h2>

            {rowError && (
              <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                {rowError}
              </div>
            )}

            <form onSubmit={handleSaveRowEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Description */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Description</label>
                  <input
                    type="text"
                    required
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  />
                </div>

                {/* Currency */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Currency</label>
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

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  />
                </div>

                {/* Payer mapping */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Map Payer (CSV: "{editingRow.normalizedExpense?.payerName}")
                  </label>
                  <select
                    value={editPayer}
                    onChange={(e) => setEditPayer(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  >
                    <option value="">-- Match Member --</option>
                    {group?.memberships.map(m => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name || m.user.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Split Type */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Split Type</label>
                  <select
                    value={editSplitType}
                    onChange={(e) => setEditSplitType(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-850 focus:border-violet-500/70 outline-none text-sm text-slate-100"
                  >
                    <option value="EQUAL">Equally</option>
                    <option value="UNEQUAL">Unequally (Exact amounts)</option>
                    <option value="PERCENTAGE">By Percentages (%)</option>
                    <option value="SHARES">By Share count weights</option>
                  </select>
                </div>
              </div>

              {/* Splits roster */}
              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Split Participants</label>
                
                <div className="max-h-40 overflow-y-auto border border-slate-850 rounded-xl divide-y divide-slate-950 bg-slate-950/40 p-2 space-y-1.5">
                  {group?.memberships.map((membership) => {
                    const uid = membership.userId;
                    const userShare = editParts[uid] || { checked: false, value: '' };

                    return (
                      <div key={uid} className="flex items-center justify-between p-1">
                        <label className="flex items-center space-x-3 text-xs text-slate-200 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={userShare.checked}
                            onChange={(e) => {
                              setEditParts(prev => ({
                                ...prev,
                                [uid]: { ...prev[uid], checked: e.target.checked }
                              }));
                            }}
                            className="rounded border-slate-800 text-violet-600 focus:ring-violet-500/20"
                          />
                          <span>{membership.user.name || membership.user.email}</span>
                        </label>

                        {userShare.checked && editSplitType !== 'EQUAL' && (
                          <div className="relative flex items-center">
                            {editSplitType === 'UNEQUAL' && (
                              <span className="absolute left-2.5 text-[9px] font-bold text-slate-500">{editCurrency}</span>
                            )}
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="0"
                              value={userShare.value}
                              onChange={(e) => {
                                setEditParts(prev => ({
                                  ...prev,
                                  [uid]: { ...prev[uid], value: e.target.value }
                                }));
                              }}
                              className={`w-20 px-2 py-1 text-xs text-right bg-slate-950 border border-slate-850 focus:border-violet-500/50 outline-none rounded-lg text-slate-100 ${
                                editSplitType === 'UNEQUAL' ? 'pl-7' : 'pr-5'
                              }`}
                            />
                            {editSplitType === 'PERCENTAGE' && (
                              <span className="absolute right-2.5 text-[9px] font-semibold text-slate-500">%</span>
                            )}
                            {editSplitType === 'SHARES' && (
                              <span className="absolute right-2 text-[8px] font-bold uppercase tracking-wider text-slate-550">sh</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-950 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-850 text-slate-400 hover:text-slate-350 hover:bg-slate-800/40 transition-all text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rowSaveLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {rowSaveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Save Row Changes</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
