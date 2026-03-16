/**
 * TEMPORARY FEATURE: Import backup from previous StudyFlow version.
 *
 * To remove this feature, see structure/features/import-backup.md
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { useSetStore } from '@/stores/useSetStore';
import { useToastStore } from '@/stores/useToastStore';
import { parseBackupFile, type ImportResult } from '@/lib/importBackup';

interface ImportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'select' | 'importing' | 'done';

export default function ImportBackupModal({ isOpen, onClose }: ImportBackupModalProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addSet = useSetStore((s) => s.addSet);
  const addToast = useToastStore((s) => s.addToast);

  const reset = useCallback(() => {
    setPhase('select');
    setResult(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      processFile(file);
    },
    [processFile],
  );

  const processFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setPhase('importing');

      try {
        const text = await file.text();
        const { sets, result: importResult } = parseBackupFile(text);

        for (const set of sets) {
          await addSet(set);
        }

        setResult(importResult);
        setPhase('done');

        if (importResult.imported > 0) {
          addToast('success', `Imported ${importResult.imported} study set${importResult.imported !== 1 ? 's' : ''}`);
        }
      } catch {
        setResult({
          total: 0,
          imported: 0,
          skipped: 0,
          errors: ['Failed to read file'],
        });
        setPhase('done');
        addToast('error', 'Failed to import backup');
      }
    },
    [addSet, addToast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.json')) {
        processFile(file);
      }
    },
    [processFile],
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && handleClose()}
          >
            <div
              className="w-full max-w-md rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-modal)',
                border: '1px solid var(--color-border)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                  Import Backup
                </h2>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg transition-colors cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-muted)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-5">
                {phase === 'select' && (
                  <div>
                    <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                      Import a <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--color-muted)' }}>studyflow-backup.json</code> file from the previous version of StudyFlow. Your existing sets will not be affected — duplicates are updated with the imported version.
                    </p>

                    {/* Drop zone */}
                    <div
                      className="relative flex flex-col items-center justify-center gap-3 py-10 rounded-lg cursor-pointer transition-colors"
                      style={{
                        border: '2px dashed var(--color-border)',
                        background: 'var(--color-surface-raised)',
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                        e.currentTarget.style.background = 'var(--color-primary-light)';
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.background = 'var(--color-surface-raised)';
                      }}
                      onDrop={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.background = 'var(--color-surface-raised)';
                        handleDrop(e);
                      }}
                    >
                      <Upload size={32} style={{ color: 'var(--color-text-tertiary)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Drop your backup file here or click to browse
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        .json files only
                      </span>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                )}

                {phase === 'importing' && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center animate-spin"
                      style={{ border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)' }}
                    />
                    <div className="flex items-center gap-2">
                      <FileText size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Importing {fileName}...
                      </span>
                    </div>
                  </div>
                )}

                {phase === 'done' && result && (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div
                      className="flex items-start gap-3 p-4 rounded-lg"
                      style={{
                        background: result.imported > 0 ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                      }}
                    >
                      {result.imported > 0 ? (
                        <CheckCircle size={20} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 1 }} />
                      ) : (
                        <AlertCircle size={20} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: 1 }} />
                      )}
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                          {result.imported > 0
                            ? `Successfully imported ${result.imported} of ${result.total} set${result.total !== 1 ? 's' : ''}`
                            : 'No sets were imported'}
                        </p>
                        {result.skipped > 0 && (
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                            {result.skipped} set{result.skipped !== 1 ? 's' : ''} skipped due to invalid data
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Errors */}
                    {result.errors.length > 0 && (
                      <div
                        className="p-3 rounded-lg max-h-32 overflow-y-auto"
                        style={{ background: 'var(--color-muted)' }}
                      >
                        <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                          Details:
                        </p>
                        {result.errors.map((err, i) => (
                          <p key={i} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {err}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                className="flex justify-end gap-2 px-5 py-3"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                {phase === 'done' ? (
                  <Button variant="primary" onClick={handleClose}>
                    Done
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={handleClose}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
