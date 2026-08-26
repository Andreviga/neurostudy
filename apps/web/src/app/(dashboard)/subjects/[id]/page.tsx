'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronDown, BookOpen, FileText, Play, AlertCircle, Search } from 'lucide-react';
import { subjectsApi, topicsApi } from '@/lib/api';
import { cn, cleanMaterialTitle, difficultyColor, difficultyLabel } from '@/lib/utils';
import type { Subject, Topic } from '@/types';

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([subjectsApi.get(id), topicsApi.list(id)])
      .then(([s, t]) => { setSubject(s as unknown as Subject); setTopics(t); })
      .finally(() => setLoading(false));
  }, [id]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return topics;
    return topics.filter((t) =>
      `${t.title} ${t.summary ?? ''} ${t.material?.title ?? ''}`.toLowerCase().includes(normalizedQuery)
    );
  }, [topics, normalizedQuery]);

  // Group topics by source material (chapter)
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; topics: Topic[] }>();
    for (const t of filtered) {
      const key = t.material?.id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { title: t.material ? cleanMaterialTitle(t.material.title) : 'Sem material', topics: [] });
      }
      map.get(key)!.topics.push(t);
    }
    return [...map.entries()].map(([key, g]) => ({ key, ...g }));
  }, [filtered]);

  const searching = normalizedQuery.length > 0;

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="p-6"><div className="h-8 w-64 bg-slate-200 rounded animate-pulse" /></div>;
  if (!subject) return <div className="p-6 text-slate-400">Disciplina não encontrada</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/subjects" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all mt-0.5">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ background: subject.color }} />
            <h1 className="text-2xl font-bold text-slate-900">{subject.name}</h1>
          </div>
          {subject.description && <p className="text-slate-500 text-sm">{subject.description}</p>}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex-1 max-w-xs h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${subject.progress}%`, background: subject.color }} />
            </div>
            <span className="text-sm text-slate-500">{subject.progress}% concluído</span>
          </div>
        </div>
        <Link href="/upload" className="btn-primary flex-shrink-0">
          <FileText className="w-4 h-4" />
          Upload material
        </Link>
      </div>

      {/* Topics */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 flex-shrink-0">
            <BookOpen className="w-4 h-4 text-brand-600" />
            Tópicos ({filtered.length}{searching ? ` de ${topics.length}` : ''})
          </h2>
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              className="input pl-9 py-1.5 text-sm"
              placeholder="Buscar tópico ou capítulo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {topics.length === 0 ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-3">Nenhum tópico ainda</p>
            <p className="text-xs text-slate-400">Faça upload de um material para gerar os tópicos automaticamente</p>
            <Link href="/upload" className="btn-primary mt-4 mx-auto">Upload de material</Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-400">
            Nada encontrado para “{query}”
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const open = searching || openGroups.has(group.key) || groups.length === 1;
              return (
                <div key={group.key} className="card overflow-hidden">
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', !open && '-rotate-90')} />
                    <span className="font-medium text-slate-800 text-sm flex-1 min-w-0 truncate">{group.title}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{group.topics.length} tópico(s)</span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {group.topics.map((t, i) => (
                        <div key={t.id} className="p-4 pl-11 flex items-center gap-4 hover:bg-slate-50/50 transition-all group">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-900 truncate">{t.title}</h3>
                            {t.summary && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.summary}</p>}
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className={cn('badge text-[10px]', difficultyColor[t.difficulty])}>
                                {difficultyLabel[t.difficulty]}
                              </span>
                              {t._count && (
                                <span className="text-[10px] text-slate-400">
                                  {t._count.quizItems} quiz · {t._count.flashcards} flash · {t._count.studySessions} sessões
                                </span>
                              )}
                            </div>
                          </div>
                          <Link
                            href={`/study/${t.id}`}
                            className="btn-primary text-xs px-3 py-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
                          >
                            <Play className="w-3 h-3" />
                            Estudar
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
