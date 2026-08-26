'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Flame, Clock, Target, TrendingUp, BookOpen,
  AlertCircle, ChevronRight, Plus, Zap, Play
} from 'lucide-react';
import { subjectsApi, sessionsApi, profileApi } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { cn, cleanMaterialTitle, difficultyColor, difficultyLabel, formatDuration, isOverdue } from '@/lib/utils';
import type { Subject, SessionStats, TodayPlan } from '@/types';

export default function DashboardPage() {
  const user = getStoredUser();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [today, setToday] = useState<TodayPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      subjectsApi.list(),
      sessionsApi.stats(),
      profileApi.today(),
    ]).then(([s, st, t]) => {
      setSubjects(s);
      setStats(st);
      setToday(t);
    }).finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting}, {user?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {today?.dueReviews.length
              ? `${today.dueReviews.length} revisão(ões) pendente(s) para hoje`
              : 'Nenhuma revisão pendente — ótimo trabalho!'}
          </p>
        </div>
        <Link href="/upload" className="btn-primary hidden sm:flex">
          <Plus className="w-4 h-4" />
          Novo material
        </Link>
      </div>

      {/* ─── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Flame,
            label: 'Sequência',
            value: `${today?.streakDays ?? 0} dias`,
            color: 'text-orange-500',
            bg: 'bg-orange-50',
          },
          {
            icon: Clock,
            label: 'Tempo total',
            value: formatDuration((stats?.totalMinsStudied ?? 0) * 60),
            color: 'text-brand-600',
            bg: 'bg-brand-50',
          },
          {
            icon: Target,
            label: 'Sessões',
            value: stats?.totalSessions ?? 0,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            icon: TrendingUp,
            label: 'Taxa de acerto',
            value: stats?.avgScore ? `${stats.avgScore}%` : '—',
            color: 'text-violet-600',
            bg: 'bg-violet-50',
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-4 flex items-center gap-4"
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">{s.label}</p>
              <p className="text-xl font-bold text-slate-900 leading-tight">{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── Study next (guided trail) ─────────────────────────────────────── */}
      {today?.nextTopics && today.nextTopics.length > 0 && (
        <div className="card p-5 border-brand-100 bg-gradient-to-r from-brand-50/60 to-white">
          <div className="flex items-center gap-2 mb-4">
            <Play className="w-4 h-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Continue sua trilha</h2>
            <span className="text-xs text-slate-400">— próximos tópicos com pré-requisitos já dominados</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {today.nextTopics.map((t) => (
              <Link
                key={t.id}
                href={`/study/${t.id}`}
                className="card p-4 hover:shadow-md hover:border-brand-200 transition-all group bg-white"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.subject.color }} />
                  <span className="text-[11px] text-slate-400 truncate">{t.subject.name}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-700 line-clamp-2">{t.title}</p>
                {t.materialTitle && (
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{cleanMaterialTitle(t.materialTitle)}</p>
                )}
                <span className={cn('badge text-[10px] mt-2 inline-block', difficultyColor[t.difficulty])}>
                  {difficultyLabel[t.difficulty]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ─── Due reviews ──────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Revisões para hoje
            </h2>
            <Link href="/reviews" className="text-xs text-brand-600 hover:underline">Ver todas</Link>
          </div>

          {today?.dueReviews.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">Tudo em dia! 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              {today?.dueReviews.map((r) => (
                <Link
                  key={r.id}
                  href={`/study/${r.topicId}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.topic.subject.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.topic.title}</p>
                    <p className="text-xs text-slate-400">{r.topic.subject.name}</p>
                  </div>
                  {isOverdue(r.nextReviewDate) && (
                    <span className="badge bg-red-50 text-red-600 text-[10px]">Atrasada</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ─── Weak topics ──────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Tópicos difíceis</h2>
          </div>

          {today?.weakTopics.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">Nenhum ponto crítico detectado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {today?.weakTopics.map((t) => (
                <Link
                  key={t.id}
                  href={`/study/${t.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.subject.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                    <p className="text-xs text-slate-400">{t.subject.name}</p>
                  </div>
                  <span className={cn('badge text-[10px]', difficultyColor[t.difficulty])}>
                    {difficultyLabel[t.difficulty]}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ─── Subjects overview ────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-600" />
              Disciplinas
            </h2>
            <Link href="/subjects" className="text-xs text-brand-600 hover:underline">Ver todas</Link>
          </div>

          {subjects.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400 mb-3">Nenhuma disciplina ainda</p>
              <Link href="/subjects" className="btn-primary text-xs px-3 py-1.5">
                Adicionar disciplina
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.slice(0, 4).map((s) => (
                <Link key={s.id} href={`/subjects/${s.id}`} className="block group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-sm font-medium text-slate-900 truncate group-hover:text-brand-600 transition-colors">
                        {s.name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{s.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-4">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${s.progress}%`, background: s.color }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 h-20 animate-pulse bg-slate-100" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-5 h-48 animate-pulse bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
