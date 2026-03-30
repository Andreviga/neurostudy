'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, BookOpen, FileText, Play, AlertCircle } from 'lucide-react';
import { subjectsApi, topicsApi } from '@/lib/api';
import { cn, difficultyColor, difficultyLabel } from '@/lib/utils';
import type { Subject, Topic } from '@/types';

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([subjectsApi.get(id), topicsApi.list(id)])
      .then(([s, t]) => { setSubject(s as unknown as Subject); setTopics(t); })
      .finally(() => setLoading(false));
  }, [id]);

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
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand-600" />
          Tópicos ({topics.length})
        </h2>

        {topics.length === 0 ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-3">Nenhum tópico ainda</p>
            <p className="text-xs text-slate-400">Faça upload de um material para gerar os tópicos automaticamente</p>
            <Link href="/upload" className="btn-primary mt-4 mx-auto">Upload de material</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((t, i) => (
              <div key={t.id} className="card p-4 flex items-center gap-4 hover:shadow-sm transition-all group">
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
                  className="btn-primary text-xs px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  <Play className="w-3 h-3" />
                  Estudar
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
