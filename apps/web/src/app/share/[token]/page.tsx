'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Brain, BookOpen, Zap } from 'lucide-react';
import Link from 'next/link';
import { cn, difficultyColor, difficultyLabel } from '@/lib/utils';

interface SharedTopic {
  title: string;
  subject: string;
  summary: string | null;
  difficulty: string;
  flashcards: { id: string; front: string; back: string }[];
  quizItems: { id: string; question: string; options: string[]; explanation?: string }[];
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    fetch(`${API_BASE}/api/share/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('Conteúdo não encontrado');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, API_BASE]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-500">
      <Brain className="w-12 h-12 text-slate-300" />
      <p>{error || 'Conteúdo não encontrado'}</p>
      <Link href="/" className="text-brand-600 hover:underline text-sm">Ir para o NeuroStudy</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">NeuroStudy</span>
          </Link>
          <div className="card p-6">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{data.subject}</p>
            <h1 className="text-2xl font-bold text-slate-900">{data.title}</h1>
            {data.summary && <p className="text-slate-500 text-sm mt-2">{data.summary}</p>}
            <span className={cn('badge text-xs mt-3 inline-block', difficultyColor[data.difficulty as keyof typeof difficultyColor])}>
              {difficultyLabel[data.difficulty as keyof typeof difficultyLabel]}
            </span>
          </div>
        </div>

        {/* Flashcards */}
        {data.flashcards.length > 0 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-600" />
              Flashcards ({data.flashcards.length})
            </h2>
            <div className="space-y-3">
              {data.flashcards.map((fc) => (
                <button
                  key={fc.id}
                  onClick={() => setFlipped((p) => ({ ...p, [fc.id]: !p[fc.id] }))}
                  className="card p-4 w-full text-left hover:shadow-md transition-all"
                >
                  <p className="text-xs text-slate-400 mb-1">{flipped[fc.id] ? 'Resposta' : 'Pergunta'}</p>
                  <p className="text-sm font-medium text-slate-900">
                    {flipped[fc.id] ? fc.back : fc.front}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2">Clique para {flipped[fc.id] ? 'ver pergunta' : 'revelar'}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quiz */}
        {data.quizItems.length > 0 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-600" />
              Quiz ({data.quizItems.length} questões)
            </h2>
            <div className="space-y-4">
              {data.quizItems.map((q, i) => (
                <div key={q.id} className="card p-4">
                  <p className="text-sm font-medium text-slate-900 mb-3">{i + 1}. {q.question}</p>
                  <div className="space-y-1">
                    {q.options.map((opt, idx) => (
                      <div key={idx} className="text-sm text-slate-600 px-3 py-2 bg-slate-50 rounded-lg">
                        {String.fromCharCode(65 + idx)}) {opt}
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className="text-xs text-slate-400 mt-2 italic">{q.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="text-center">
          <p className="text-sm text-slate-500 mb-3">Quer estudar mais com IA adaptativa?</p>
          <Link href="/signup" className="btn-primary">
            Criar conta grátis no NeuroStudy
          </Link>
        </div>
      </div>
    </div>
  );
}
