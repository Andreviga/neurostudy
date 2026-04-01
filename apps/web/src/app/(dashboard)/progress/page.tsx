'use client';
import { useEffect, useState } from 'react';
import { BarChart2, Clock, Target, TrendingUp, BookOpen } from 'lucide-react';
import { sessionsApi, subjectsApi, profileApi } from '@/lib/api';
import { cn, formatDuration, formatScore, formatLabel } from '@/lib/utils';
import type { SessionStats, Subject, LearningProfile } from '@/types';

export default function ProgressPage() {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [sessions, setSessions] = useState<import('@/types').StudySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([sessionsApi.stats(), subjectsApi.list(), profileApi.get(), sessionsApi.list(8)])
      .then(([st, s, p, ss]) => { setStats(st); setSubjects(s); setProfile(p); setSessions(ss); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="card h-28 animate-pulse bg-slate-100" />)}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Seu progresso</h1>
        <p className="text-slate-500 text-sm mt-0.5">Acompanhe sua evolução e identifique onde melhorar</p>
      </div>

      {/* ─── Key metrics ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Target, label: 'Total de sessões', value: stats?.totalSessions ?? 0, color: 'text-brand-600', bg: 'bg-brand-50' },
          { icon: Clock, label: 'Horas estudadas', value: formatDuration((stats?.totalMinsStudied ?? 0) * 60), color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: TrendingUp, label: 'Taxa de acerto', value: stats?.avgScore ? `${stats.avgScore}%` : '—', color: 'text-violet-600', bg: 'bg-violet-50' },
          { icon: BarChart2, label: 'Sequência', value: `${profile?.streakDays ?? 0} dias`, color: 'text-orange-500', bg: 'bg-orange-50' },
        ].map((m) => (
          <div key={m.label} className="card p-4 flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', m.bg)}>
              <m.icon className={cn('w-4.5 h-4.5', m.color)} />
            </div>
            <div>
              <p className="text-xs text-slate-400">{m.label}</p>
              <p className="text-xl font-bold text-slate-900">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Subjects progress ────────────────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand-600" />
          Progresso por disciplina
        </h2>
        {subjects.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma disciplina ainda</p>
        ) : (
          <div className="space-y-4">
            {subjects.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-sm font-medium text-slate-900">{s.name}</span>
                  </div>
                  <span className="text-sm text-slate-500">{s.progress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${s.progress}%`, background: s.color }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{s._count.topics} tópicos · {s._count.materials} materiais</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Learning profile ─────────────────────────────────────────────── */}
      {profile && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Seu perfil de aprendizagem</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2">Formatos mais eficazes</p>
              <div className="space-y-2">
                {(profile.preferredFormats.length > 0 ? profile.preferredFormats : ['QUIZ', 'SUMMARY_SHORT'])
                  .slice(0, 4)
                  .map((fmt, i) => {
                    const labels: Record<string, string> = {
                      QUIZ: 'Quiz', FLASHCARD: 'Flashcards', SUMMARY_SHORT: 'Resumo rápido',
                      SUMMARY_MEDIUM: 'Resumo médio', STEP_BY_STEP: 'Passo a passo',
                      ANALOGY: 'Analogia', PRACTICAL_EXAMPLE: 'Exemplo prático',
                    };
                    const width = 100 - i * 18;
                    return (
                      <div key={fmt}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600">{labels[fmt] || fmt}</span>
                          <span className="text-slate-400">#{i + 1}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-400 rounded-full" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Melhor horário</span>
                <span className="font-medium text-slate-900 capitalize">{
                  { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', night: 'Madrugada' }[profile.peakHour] || profile.peakHour
                }</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Sessão média</span>
                <span className="font-medium text-slate-900">{profile.avgSessionMins} min</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total de sessões</span>
                <span className="font-medium text-slate-900">{profile.totalSessions}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Próximo formato recomendado</span>
                <span className="font-medium text-brand-600">
                  {formatLabel[profile.recommendedFormat] ?? profile.recommendedFormat}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Recent sessions ──────────────────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Últimas sessões</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma sessão registrada ainda</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-4 py-2 border-b border-slate-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {s.topic?.title ?? 'Tópico removido'}
                  </p>
                  <p className="text-xs text-slate-400">{s.topic?.subject?.name} · {s.format.replace(/_/g, ' ').toLowerCase()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {s.score != null && (
                    <span className={cn('text-sm font-semibold', s.score >= 0.7 ? 'text-emerald-600' : s.score >= 0.5 ? 'text-amber-600' : 'text-red-500')}>
                      {formatScore(s.score)}
                    </span>
                  )}
                  <p className="text-xs text-slate-400">{formatDuration(s.durationSecs)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
