'use client';

import React, { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Coins, FileSpreadsheet, Loader2, 
  UploadCloud, AlertCircle, Info, CheckCircle 
} from 'lucide-react';
import Link from 'next/link';

export default function ImportCsvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);
  const { status } = useSession();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [groupName, setGroupName] = useState('');

  // Fetch group name for UI breadcrumbs
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    
    fetch(`/api/groups/${groupId}`)
      .then(res => res.json())
      .then(data => {
        if (data.group) setGroupName(data.group.name);
      })
      .catch(console.error);
  }, [status, groupId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setError('');
      } else {
        setError('Invalid file type. Please upload a .csv file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Invalid file type. Please upload a .csv file.');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Read file content as text
      const reader = new FileReader();
      
      const fileText = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
      });

      // Send to import staging API
      const res = await fetch(`/api/groups/${groupId}/imports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: fileText,
          fileName: file.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload CSV.');

      // Redirect to Review Queue UI
      router.push(`/groups/${groupId}/import/${data.jobId}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred during file parsing.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="backdrop-blur-md bg-slate-950/40 border-b border-slate-900/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href={`/groups/${groupId}`} className="text-slate-400 hover:text-slate-200 transition-colors p-1 bg-slate-950 border border-slate-900 rounded-lg">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="text-xs text-slate-400 font-medium">
              Back to {groupName || 'Group'}
            </span>
          </div>
          <span className="font-extrabold tracking-tight text-lg bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
            FairShare
          </span>
        </div>
      </header>

      {/* Upload layout */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        <div className="max-w-xl w-full backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center mx-auto shadow-md">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
              Import CSV Ledger
            </h2>
            <p className="text-xs text-slate-450 max-w-sm mx-auto">
              Upload spreadsheets representing historical group records. System resolves column names dynamically and identifies anomalies.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/30 text-red-300 text-xs flex items-start space-x-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Drag & Drop Box */}
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all relative cursor-pointer ${
              dragActive 
                ? 'border-violet-500 bg-violet-950/10' 
                : file 
                  ? 'border-emerald-800 bg-emerald-950/5' 
                  : 'border-slate-800 bg-slate-950/20 hover:border-slate-700'
            }`}
          >
            <input
              type="file"
              id="file-upload"
              accept=".csv"
              disabled={loading}
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            
            <div className="space-y-4">
              {file ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-950 flex items-center justify-center mx-auto border border-emerald-900">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{file.name}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center mx-auto border border-slate-850">
                    <UploadCloud className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-300">Drag & drop your CSV file here</p>
                    <p className="text-xs text-slate-500 mt-1">or click to browse local files</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-850 text-[10px] text-slate-400 flex items-start space-x-3">
            <Info className="w-4 h-4 shrink-0 text-violet-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-350">CSV File Guidelines:</p>
              <p>1. Must contain columns mapping to: Date, Description, Amount, and Payer (Paid By).</p>
              <p>2. Splits can be customized using percentage, share, or exact amount columns.</p>
              <p>3. Do not modify the spreadsheet manually; our system flags errors and prompts correction.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex space-x-4">
            <Link
              href={`/groups/${groupId}`}
              className="flex-1 py-3.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300 transition-all font-semibold text-xs flex items-center justify-center cursor-pointer"
            >
              Cancel
            </Link>
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-indigo-600/15 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Staging File...</span>
                </>
              ) : (
                <span>Stage & Validate</span>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
