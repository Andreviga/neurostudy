'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCcw, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { reviewsApi } from '@/lib/api';
import { cn, isOverdue, relativeDate } from '@/lib/utils';
import type { Review } from '@/types';

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reviewsApi.all().then(setReviews).finally(() => setLoading(false));
  }, []);

  const due = reviews.filter((r) => isOverdue(r.nextReviewDate));
  const upcoming = reviews.filter((r) => !isOverdue(r.nextReviewDate));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Revisões</h1>
        <p className="text-slate-500 text-sm mt-0.5">Revisão espaçada (SM-2) — estude no momento certo para reter mais</p>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-slate-100" />)}</div>
      ) : (
        <>
          {due.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h2 className="font-semibold text-slate-900">Pendentes ({due.length})</h2>
              </div>
              <div className="space-y-2">
                {due.map((r) => <ReviewCard key={r.id} review={r} overdue />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <RefreshCcw className="w-4 h-4 text-brand-600" />
                <h2 className="font-semibold text-slate-900">Próximas revisões</h2>
              </div>
              <div className="space-y-2">
                {upcoming.map((r) => <ReviewCard key={r.id} review={r} />)}
              </div>
            </section>
          )}

          {reviews.length === 0 && (
            <div className="card p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="font-medium text-slate-700">Nenhuma revisão agendada ainda</p>
              <p className="text-sm text-slate-400 mt-1">Complete sessões de estudo para agendar revisões automáticas</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewCard({ review, overdue }: { review: Review; overdue?: boolean }) {
  const score = Math.round(review.retentionScore * 100);
  return (
    <div className={cn('card p-4 flex items-center gap-4', overdue && 'border-red-100 bg-red-50/30')}>
      <div className="w-2.5 h-10 rounded-full flex-shrink-0" style={{ background: review.topic.subject.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{review.topic.title}</p>
        <p className="text-xs text-slate-400">{review.topic.subject.name}</p>
        <div className="flex items-center gap-3 mt-1">
          <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400')}
              style={{ width: `${score}%` }} />
          </div>
          <span className="text-[10px] text-slate-400">{score}% retenção · {review.reviewCount}x revisada</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn('text-xs font-medium', overdue ? 'text-red-600' : 'text-slate-500')}>
          {overdue ? 'Atrasada' : relativeDate(review.nextReviewDate)}
        </p>
        {overdue && (
          <Link href={`/study/${review.topicId}`} className="mt-2 btn-primary text-xs px-3 py-1 flex items-center gap-1">
            <Play className="w-3 h-3" />
            Revisar
          </Link>
        )}
      </div>
    </div>
  );
}
