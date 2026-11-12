import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import { SEED_QUIZ, SEED_PICTIONARY, SEED_CHARADES, SEED_TYPING } from '@/data/seed-content';
import { z } from 'zod';
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Sparkles, Database } from 'lucide-react';

// Appendix B Schemas
const QuizItemSchema = z.object({
  question: z.string().min(10).max(120),
  options: z.array(z.string().min(1).max(40)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  category: z.string().min(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  explanation: z.string().max(140).optional(),
});

const PictionaryItemSchema = z.object({
  word: z.string().min(2).max(24).regex(/^[a-zA-Z\s-]+$/, 'Letters, spaces, and hyphens only'),
  category: z.string().min(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const CharadesItemSchema = z.object({
  prompt: z.string().min(2).max(40),
  category: z.string().min(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  hint: z.string().max(20).optional(),
});

const TypingItemSchema = z.object({
  text: z.string().min(120).max(220),
  category: z.string().min(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const AdminImportPage: React.FC = () => {
  const { profile } = useAuthStore();
  const [jsonInput, setJsonInput] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<{ game: string; count: number; items: unknown[] } | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = profile?.is_admin === true;

  const validateJson = (rawText: string) => {
    setValidationErrors([]);
    setPreviewData(null);
    setImportResult(null);

    if (!rawText.trim()) return;

    try {
      const parsed = JSON.parse(rawText);
      const errors: string[] = [];

      if (!parsed.game || !parsed.items || !Array.isArray(parsed.items)) {
        errors.push("Invalid envelope. Expected: { game: 'quiz'|'pictionary'|'charades'|'typing', version: 1, items: [...] }");
        setValidationErrors(errors);
        return;
      }

      if (parsed.items.length > 200) {
        errors.push("Maximum 200 items per import allowed (Appendix B).");
      }

      const game = parsed.game;
      let schema: z.ZodSchema;

      if (game === 'quiz') schema = QuizItemSchema;
      else if (game === 'pictionary') schema = PictionaryItemSchema;
      else if (game === 'charades') schema = CharadesItemSchema;
      else if (game === 'typing') schema = TypingItemSchema;
      else {
        errors.push(`Unknown game type: '${game}'. Allowed: quiz, pictionary, charades, typing`);
        setValidationErrors(errors);
        return;
      }

      parsed.items.forEach((item: unknown, idx: number) => {
        const res = schema.safeParse(item);
        if (!res.success) {
          res.error.errors.forEach((err) => {
            errors.push(`Item #${idx + 1} (${err.path.join('.') || 'root'}): ${err.message}`);
          });
        }
      });

      if (errors.length > 0) {
        setValidationErrors(errors.slice(0, 20)); // show up to 20 errors
      } else {
        setPreviewData({
          game,
          count: parsed.items.length,
          items: parsed.items,
        });
      }
    } catch (e: unknown) {
      setValidationErrors([`Invalid JSON syntax: ${(e as Error).message}`]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonInput(text);
    validateJson(text);
  };

  const loadSeedPack = (game: 'quiz' | 'pictionary' | 'charades' | 'typing') => {
    let payload;
    if (game === 'quiz') payload = { game: 'quiz', version: 1, items: SEED_QUIZ };
    else if (game === 'pictionary') payload = { game: 'pictionary', version: 1, items: SEED_PICTIONARY };
    else if (game === 'charades') payload = { game: 'charades', version: 1, items: SEED_CHARADES };
    else payload = { game: 'typing', version: 1, items: SEED_TYPING };

    const formatted = JSON.stringify(payload, null, 2);
    setJsonInput(formatted);
    validateJson(formatted);
  };

  const handleImport = async () => {
    if (!previewData) return;
    setIsLoading(true);

    try {
      const payload = JSON.parse(jsonInput);
      const { data, error } = await supabase.rpc('import_content', {
        p_payload: payload,
      });

      if (error) {
        setValidationErrors([error.message]);
        return;
      }

      setImportResult({
        inserted: data.inserted,
        skipped: data.skipped,
      });
      setPreviewData(null);
      setJsonInput('');
    } catch (err: unknown) {
      setValidationErrors([`Import failed: ${(err as Error).message}`]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-black font-heading text-text flex items-center gap-2">
            <UploadCloud className="w-8 h-8 text-primary" />
            Content Bank Importer
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Import AI-generated JSON batches for Quiz, Pictionary, Charades, and Typing.
          </p>
        </div>

        <a href="/admin/content" className="inline-flex items-center text-sm font-bold text-primary hover:underline">
          <Database className="w-4 h-4 mr-1.5" />
          Browse Bank & Counts →
        </a>
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-card bg-warn/15 border border-warn/30 text-warn text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="block font-heading">Admin Access Required</strong>
            To import content, set <code>is_admin = true</code> on your account in Supabase (see SETUP.md Step 9).
          </div>
        </div>
      )}

      {/* Quick Seed Loaders (CB-5) */}
      <div className="p-4 rounded-card bg-surface border-2 border-line space-y-3">
        <span className="text-xs uppercase font-bold text-text-muted flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-warn" />
          Pre-built Day 1 Seed Packs (Appendix B Compliant)
        </span>
        <div className="flex flex-wrap gap-2.5">
          <Button size="sm" variant="surface" onClick={() => loadSeedPack('quiz')}>
            💡 Seed Quiz (60 Items)
          </Button>
          <Button size="sm" variant="surface" onClick={() => loadSeedPack('pictionary')}>
            🎨 Seed Pictionary (150 Words)
          </Button>
          <Button size="sm" variant="surface" onClick={() => loadSeedPack('charades')}>
            🎭 Seed Charades (80 Prompts)
          </Button>
          <Button size="sm" variant="surface" onClick={() => loadSeedPack('typing')}>
            🏁 Seed Typing (40 Passages)
          </Button>
        </div>
      </div>

      {/* JSON Paste Area */}
      <div className="space-y-2">
        <label htmlFor="json-paste" className="text-sm font-semibold text-text flex items-center justify-between">
          <span>Paste AI Generated JSON</span>
          <span className="text-xs text-text-muted">Appendix B Schema Validated</span>
        </label>
        <textarea
          id="json-paste"
          rows={10}
          value={jsonInput}
          onChange={handleInputChange}
          placeholder='{"game": "quiz", "version": 1, "items": [ ... ]}'
          className="w-full p-4 rounded-input bg-surface border-2 border-line font-mono text-xs text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 leading-relaxed"
        />
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="p-4 rounded-card bg-danger/10 border-2 border-danger/30 text-danger text-sm space-y-2">
          <div className="font-heading font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            Validation Errors Detected ({validationErrors.length})
          </div>
          <ul className="list-disc list-inside text-xs space-y-1 font-mono max-h-48 overflow-y-auto">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Validated Preview */}
      {previewData && (
        <div className="p-4 rounded-card bg-success/10 border-2 border-success/30 text-text space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span className="font-heading font-bold text-success">
                Schema Valid! {previewData.count} items ready for '{previewData.game}'
              </span>
            </div>
            <span className="text-xs text-text-muted">Duplicates will be skipped automatically</span>
          </div>

          <Button
            variant="primary"
            size="lg"
            disabled={!isAdmin || isLoading}
            isLoading={isLoading}
            onClick={handleImport}
            fullWidth
          >
            <FileText className="w-5 h-5 mr-2" />
            Confirm & Import {previewData.count} Items
          </Button>
        </div>
      )}

      {/* Import Result Notification */}
      {importResult && (
        <div className="p-5 rounded-card bg-surface-raised border-2 border-primary text-text flex items-center justify-between shadow-lg">
          <div>
            <h3 className="font-heading font-bold text-lg text-primary">Import Completed Successfully!</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Added <strong>{importResult.inserted}</strong> new items • Skipped <strong>{importResult.skipped}</strong> duplicates.
            </p>
          </div>
          <a href="/admin/content">
            <Button size="sm" variant="surface">View Bank</Button>
          </a>
        </div>
      )}
    </div>
  );
};

