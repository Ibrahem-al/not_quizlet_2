import { useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Upload, Camera, Trash2, Plus, Loader2 } from 'lucide-react';
import { parseOCRText } from '@/lib/ocrParser';

interface PhotoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCards: (cards: { term: string; definition: string }[]) => void;
}

type Step = 'upload' | 'processing' | 'preview';

export function PhotoImportModal({ isOpen, onClose, onImportCards }: PhotoImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing OCR...');
  const [rawText, setRawText] = useState('');
  const [pairs, setPairs] = useState<{ term: string; definition: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setImageFile(null);
    setImagePreview(null);
    setProgress(0);
    setStatusText('Initializing OCR...');
    setRawText('');
    setPairs([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const processImage = useCallback(async () => {
    if (!imageFile) return;
    setStep('processing');
    setProgress(0);
    setStatusText('Loading OCR engine...');

    try {
      // @ts-ignore - tesseract.js types loaded at runtime
      const Tesseract = await import(/* @vite-ignore */ 'tesseract.js');
      setStatusText('Recognizing text...');

      const result = await Tesseract.recognize(imageFile, 'eng', {
        logger: (m: { status: string; progress: number }) => {
          setProgress(m.progress);
          setStatusText(m.status);
        },
      });

      const text = result.data.text;
      setRawText(text);
      setPairs(parseOCRText(text));
      setStep('preview');
    } catch (err) {
      console.error('OCR failed:', err);
      setStatusText('OCR failed. Please try again.');
      setStep('upload');
    }
  }, [imageFile]);

  const handleRawTextChange = useCallback((text: string) => {
    setRawText(text);
    setPairs(parseOCRText(text));
  }, []);

  const updatePair = useCallback((index: number, field: 'term' | 'definition', value: string) => {
    setPairs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }, []);

  const deletePair = useCallback((index: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addPair = useCallback(() => {
    setPairs((prev) => [...prev, { term: '', definition: '' }]);
  }, []);

  const handleConfirm = useCallback(() => {
    const valid = pairs.filter((p) => p.term.trim() && p.definition.trim());
    if (valid.length > 0) {
      onImportCards(valid);
      handleClose();
    }
  }, [pairs, onImportCards, handleClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import from Photo" size="lg">
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: dragOver ? 'var(--color-primary-light, rgba(99,102,241,0.05))' : 'var(--color-muted)',
            }}
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-48 rounded-lg object-contain"
              />
            ) : (
              <>
                <Upload size={32} style={{ color: 'var(--color-text-secondary)' }} />
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  Drag & drop an image or click to browse
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Supports JPG, PNG, WEBP
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          {imagePreview && (
            <div className="flex gap-2 justify-end">
              <button
                onClick={reset}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                }}
              >
                Clear
              </button>
              <button
                onClick={processImage}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                }}
              >
                <Camera size={16} />
                Extract Text
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 'processing' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 size={40} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {statusText}
          </p>
          <div className="w-full max-w-xs">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: 'var(--color-muted)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  background: 'var(--color-primary)',
                }}
              />
            </div>
            <p className="text-xs text-center mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              {Math.round(progress * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Edit */}
      {step === 'preview' && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Raw text */}
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Raw OCR Text
            </label>
            <textarea
              value={rawText}
              onChange={(e) => handleRawTextChange(e.target.value)}
              rows={4}
              className="w-full rounded-lg p-3 text-sm resize-y"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                fontFamily: 'monospace',
              }}
            />
          </div>

          {/* Parsed pairs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                className="text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Parsed Cards ({pairs.length})
              </label>
              <button
                onClick={addPair}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-primary)',
                  border: 'none',
                }}
              >
                <Plus size={14} />
                Add Pair
              </button>
            </div>

            <div className="space-y-2">
              {pairs.map((pair, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: 'var(--color-muted)' }}
                >
                  <input
                    value={pair.term}
                    onChange={(e) => updatePair(i, 'term', e.target.value)}
                    placeholder="Term"
                    className="flex-1 px-2 py-1 rounded text-sm"
                    style={{
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                  <input
                    value={pair.definition}
                    onChange={(e) => updatePair(i, 'definition', e.target.value)}
                    placeholder="Definition"
                    className="flex-1 px-2 py-1 rounded text-sm"
                    style={{
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                  <button
                    onClick={() => deletePair(i)}
                    className="p-1 rounded cursor-pointer"
                    style={{ color: 'var(--color-danger)', background: 'transparent', border: 'none' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {pairs.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>
                  No pairs detected. Edit the raw text above or add pairs manually.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text)',
                border: 'none',
              }}
            >
              Start Over
            </button>
            <button
              onClick={handleConfirm}
              disabled={pairs.filter((p) => p.term.trim() && p.definition.trim()).length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                opacity: pairs.filter((p) => p.term.trim() && p.definition.trim()).length === 0 ? 0.5 : 1,
              }}
            >
              Import {pairs.filter((p) => p.term.trim() && p.definition.trim()).length} Cards
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
