import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Search, User, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PatientResult {
  id: string;
  name: string;
  nhs_number: string | null;
  phone_number: string;
}

export function GlobalPatientSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Search patients
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number')
        .or(`name.ilike.%${query}%,nhs_number.ilike.%${query}%,phone_number.ilike.%${query}%`)
        .limit(8);
      setResults(data ?? []);
      setSelectedIndex(0);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  const selectPatient = useCallback((patient: PatientResult) => {
    setOpen(false);
    setQuery('');
    navigate(`/patients?highlight=${patient.id}`);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      selectPatient(results[selectedIndex]);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search patients...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => { setOpen(false); setQuery(''); }}>
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 border-b border-border">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by name, NHS number, or phone..."
                className="border-0 shadow-none focus-visible:ring-0 text-base py-4"
              />
              {query && (
                <button onClick={() => setQuery('')}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            
            {query.length >= 2 && (
              <div className="max-h-72 overflow-y-auto p-2">
                {loading ? (
                  <p className="text-center text-sm text-muted-foreground py-6">Searching...</p>
                ) : results.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">No patients found</p>
                ) : (
                  results.map((patient, idx) => (
                    <button
                      key={patient.id}
                      onClick={() => selectPatient(patient)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                        idx === selectedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{patient.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {patient.nhs_number && `NHS: ${patient.nhs_number} · `}{patient.phone_number}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {query.length < 2 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
