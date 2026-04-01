'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, BookOpen, Trash2, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { subjectsApi } from '@/lib/api';
import { cn, priorityLabel } from '@/lib/utils';
import type { Subject, Priority } from '@/types';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0], priority: 'MEDIUM' as Priority });

  useEffect(() => {
    subjectsApi.list().then(setSubjects).finally(() => setLoading(false));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const s = await subjectsApi.create(form);
      setSubjects((prev) => [{ ...s, progress: 0, _count: { materials: 0, topics: 0 } } as Subject, ...prev]);
      setShowForm(false);
      setForm({ name: '', description: '', color: COLORS[0], priority: 'MEDIUM' });
      toast.success('Disciplina criada!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar disciplina');
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover esta disciplina e todos os seus materiais?')) return;
    try {
      await subjectsApi.delete(id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      toast.success('Disciplina removida');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover disciplina');
    }
  }

  const priorityOrder: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...subjects].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Disciplinas</h1>
          <p className="text-slate-500 text-sm mt-0.5">{subjects.length} disciplina(s) cadastrada(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {/* ─── Add form modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95 }}
              className="card p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold">Nova disciplina</h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={create} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome *</label>
                  <input
                    className="input"
                    placeholder="Ex: Cálculo II"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição</label>
                  <input
                    className="input"
                    placeholder="Tópicos principais..."
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Prioridade</label>
                  <select
                    className="input"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                  >
                    {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => (
                      <option key={p} value={p}>{priorityLabel[p]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Cor</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all',
                          form.color === c ? 'border-slate-400 scale-110' : 'border-transparent'
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary flex-1">
                    Criar disciplina
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── List ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="font-medium text-slate-600 mb-1">Nenhuma disciplina ainda</h3>
          <p className="text-sm text-slate-400 mb-4">Adicione suas matérias para começar a estudar</p>
          <button onClick={() => setShowForm(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Adicionar disciplina
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card p-4 flex items-center gap-4 hover:shadow-md transition-all group"
            >
              <div className="w-3 h-12 rounded-full flex-shrink-0" style={{ background: s.color }} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900 truncate">{s.name}</h3>
                  <span className={cn(
                    'badge text-[10px] flex-shrink-0',
                    s.priority === 'URGENT' ? 'bg-red-50 text-red-600' :
                    s.priority === 'HIGH' ? 'bg-orange-50 text-orange-600' :
                    s.priority === 'MEDIUM' ? 'bg-amber-50 text-amber-600' :
                    'bg-slate-100 text-slate-500'
                  )}>
                    {priorityLabel[s.priority]}
                  </span>
                </div>
                {s.description && <p className="text-xs text-slate-400 truncate">{s.description}</p>}
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.progress}%`, background: s.color }} />
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{s.progress}% concluído</span>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-slate-400 mr-2 hidden sm:block">
                  {s._count.materials} mat. · {s._count.topics} tóp.
                </span>
                <button
                  onClick={() => remove(s.id)}
                  className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Link
                  href={`/subjects/${s.id}`}
                  className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
