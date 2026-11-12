import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import type { ContentItem } from '@/types/database';
import { Database, Trash2, Filter, UploadCloud, AlertCircle } from 'lucide-react';

export const AdminContentPage: React.FC = () => {
  const { profile } = useAuthStore();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [counts, setCounts] = useState<{ [game: string]: number }>({});
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = profile?.is_admin === true;

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('content_items').select('*').order('created_at', { ascending: false });

      if (selectedGame !== 'all') {
        query = query.eq('game', selectedGame);
      }
      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      const { data } = await query.limit(100);
      setItems((data as ContentItem[]) || []);

      // Fetch counts per game
      const games = ['quiz', 'pictionary', 'charades', 'typing'];
      const countsMap: { [game: string]: number } = {};

      for (const g of games) {
        const { count } = await supabase
          .from('content_items')
          .select('*', { count: 'exact', head: true })
          .eq('game', g);
        countsMap[g] = count || 0;
      }
      setCounts(countsMap);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedGame, selectedCategory]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleDeleteItem = async (id: string) => {
    if (!isAdmin) return;
    try {
      await supabase.from('content_items').delete().eq('id', id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedGame in counts) {
        setCounts((prev) => ({ ...prev, [selectedGame]: Math.max(0, prev[selectedGame] - 1) }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-black font-heading text-text flex items-center gap-2">
            <Database className="w-8 h-8 text-primary" />
            Content Bank Browser
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Browse, inspect, and manage bank content items used during gameplay.
          </p>
        </div>

        <a href="/admin/import" className="inline-flex items-center">
          <Button size="sm" variant="primary">
            <UploadCloud className="w-4 h-4 mr-1.5" />
            Import Batch
          </Button>
        </a>
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-card bg-warn/15 border border-warn/30 text-warn text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="block font-heading">Viewing in Read-Only Mode</strong>
            Admin accounts can delete and modify content.
          </div>
        </div>
      )}

      {/* Counts Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-card bg-surface border-2 border-line">
          <span className="text-2xl">💡</span>
          <div className="font-heading font-black text-2xl text-game-quiz mt-1">
            {counts.quiz ?? 0}
          </div>
          <span className="text-xs text-text-muted font-semibold">Quiz Questions</span>
        </div>

        <div className="p-4 rounded-card bg-surface border-2 border-line">
          <span className="text-2xl">🎨</span>
          <div className="font-heading font-black text-2xl text-game-pictionary mt-1">
            {counts.pictionary ?? 0}
          </div>
          <span className="text-xs text-text-muted font-semibold">Pictionary Words</span>
        </div>

        <div className="p-4 rounded-card bg-surface border-2 border-line">
          <span className="text-2xl">🎭</span>
          <div className="font-heading font-black text-2xl text-game-charades mt-1">
            {counts.charades ?? 0}
          </div>
          <span className="text-xs text-text-muted font-semibold">Charades Prompts</span>
        </div>

        <div className="p-4 rounded-card bg-surface border-2 border-line">
          <span className="text-2xl">🏁</span>
          <div className="font-heading font-black text-2xl text-game-typing mt-1">
            {counts.typing ?? 0}
          </div>
          <span className="text-xs text-text-muted font-semibold">Typing Passages</span>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-card bg-surface border-2 border-line flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold uppercase text-text-muted">Filter Game:</span>
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-raised border border-line text-xs font-semibold text-text focus:outline-none focus:border-primary"
          >
            <option value="all">All Games</option>
            <option value="quiz">Quiz</option>
            <option value="pictionary">Pictionary</option>
            <option value="charades">Charades</option>
            <option value="typing">Typing</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-text-muted">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-raised border border-line text-xs font-semibold text-text focus:outline-none focus:border-primary"
          >
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="science">Science</option>
            <option value="technology">Technology</option>
            <option value="office">Office</option>
            <option value="humour">Humour</option>
            <option value="movies">Movies</option>
            <option value="sports">Sports</option>
            <option value="food">Food</option>
            <option value="nature">Nature</option>
            <option value="animals">Animals</option>
            <option value="places">Places</option>
            <option value="actions">Actions</option>
          </select>
        </div>

        <Button size="sm" variant="surface" onClick={fetchContent}>
          Refresh List
        </Button>
      </div>

      {/* Content Table / Cards */}
      <div className="bg-surface rounded-card border-2 border-line overflow-hidden shadow-lg">
        {isLoading ? (
          <div className="p-10 text-center text-text-muted">Loading content items…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="font-heading font-bold text-text">No items found in this filter.</p>
            <p className="text-xs text-text-muted">Import a seed pack or paste JSON on the import page.</p>
          </div>
        ) : (
          <div className="divide-y divide-line/40 max-h-[500px] overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-surface-raised/40 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      {item.game}
                    </span>
                    <span className="text-xs font-semibold text-text-muted">
                      Category: {item.category} • Diff: {item.difficulty}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-text">
                    {item.game === 'quiz' && (item.payload.question as string)}
                    {item.game === 'pictionary' && (item.payload.word as string)}
                    {item.game === 'charades' && (item.payload.prompt as string)}
                    {item.game === 'typing' && (item.payload.text as string)}
                  </p>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 text-text-muted hover:text-danger rounded-lg transition-colors"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
