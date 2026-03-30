'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Loader2, RefreshCw, CheckCircle2, XCircle,
  RotateCcw, ChevronRight, Lightbulb, BookOpen
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { topicsApi, sessionsApi } from '@/lib/api';
import { cn, formatLabel } from '@/lib/utils';
import type { Topic, StudyFormat, GeneratedContent, QuizItem, Flashcard } from '@/types';

const FORMAT_OPTIONS: { value: StudyFormat; label: string; emoji: string }[] = [
  { value: 'SUMMARY_SHORT', label: 'Resumo rápido', emoji: '⚡' },
  { value: 'SUMMARY_MEDIUM', label: 'Resumo médio', emoji: '📄' },
  { value: 'STEP_BY_STEP', label: 'Passo a passo', emoji: '🪜' },
  { value: 'ANALOGY', label: 'Analogia', emoji: '🧩' },
  { value: 'PRACTICAL_EXAMPLE', label: 'Exemplo prático', emoji: '🔬' },
  { value: 'QUIZ', label: 'Quiz', emoji: '🎯' },
  { value: 'FLASHCARD', label: 'Flashcards', emoji: '🃏' },
  { value: 'GUIDED_QUESTIONS', label: 'Perguntas guiadas', emoji: '💬' },
  { value: 'MIND_MAP', label: 'Mapa mental', emoji: '🗺️' },
];

export default function StudySessionPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const router = useRouter();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [format, setFormat] = useState<StudyFormat>('SUMMARY_SHORT');
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState<'pick' | 'study'>('pick');
  const startRef = useRef(Date.now());

  useEffect(() => {
    topicsApi.get(topicId).then(setTopic);
  }, [topicId]);

  async function generate(fmt: StudyFormat) {
    setFormat(fmt);
    setGenerating(true);
    setPhase('study');
    startRef.current = Date.now();
    try {
      const c = await topicsApi.generate(topicId, fmt);
      setContent(c);
    } catch {
      toast.error('Falha ao gerar conteúdo. Tente novamente.');
      setPhase('pick');
    } finally {
      setGenerating(false);
    }
  }

  async function finishSession(score?: number) {
    const durationSecs = Math.round((Date.now() - startRef.current) / 1000);
    await sessionsApi.record({
      topicId,
      format,
      durationSecs,
      completionRate: 1,
      score,
      aiProvider: content?.provider,
      aiModel: content?.model,
    }).catch(() => {});
    toast.success('Sessão registrada!');
    router.back();
  }

  if (!topic) return <div className="p-6 flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin w-4 h-4" /> Carregando...</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => phase === 'study' ? setPhase('pick') : router.back()}
          className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs text-slate-400 font-medium">{topic.subject?.name}</p>
          <h1 className="font-bold text-slate-900 text-lg leading-tight">{topic.title}</h1>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'pick' ? (
          <motion.div key="pick" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="text-sm text-slate-500 mb-4">Como você quer estudar este tópico?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FORMAT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => generate(f.value)}
                  className="card p-4 text-left hover:shadow-md hover:border-brand-200 transition-all group"
                >
                  <span className="text-2xl mb-2 block">{f.emoji}</span>
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">{f.label}</p>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="study" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <span className="badge bg-brand-50 text-brand-700">{formatLabel[format]}</span>
              <div className="flex gap-2">
                <button onClick={() => { setContent(null); generate(format); }}
                  className="btn-secondary text-xs px-3 py-1.5">
                  <RefreshCw className="w-3 h-3" />
                  Regenerar
                </button>
                <button onClick={() => setPhase('pick')} className="btn-secondary text-xs px-3 py-1.5">
                  Trocar formato
                </button>
              </div>
            </div>

            {generating ? (
              <div className="card p-16 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                <p className="text-sm text-slate-500">Gerando conteúdo com IA...</p>
                <p className="text-xs text-slate-400">Provedor: {content?.provider || '...'}</p>
              </div>
            ) : content ? (
              <>
                {format === 'QUIZ' && content.quizItems?.length ? (
                  <QuizView items={content.quizItems} onFinish={finishSession} />
                ) : format === 'FLASHCARD' && content.flashcards?.length ? (
                  <FlashcardView cards={content.flashcards} onFinish={finishSession} />
                ) : (
                  <ContentView content={content} onFinish={() => finishSession()} />
                )}
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Content view (summary, step-by-step, etc.) ──────────────────────────────

function ContentView({ content, onFinish }: { content: GeneratedContent; onFinish: () => void }) {
  return (
    <div className="space-y-4">
      <div className="card p-6 prose prose-slate max-w-none">
        <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
          {content.content}
        </pre>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>Gerado por {content.provider} ({content.model})</span>
      </div>
      <button onClick={onFinish} className="btn-primary w-full py-3">
        <CheckCircle2 className="w-4 h-4" />
        Concluir sessão
      </button>
    </div>
  );
}

// ─── Quiz view ────────────────────────────────────────────────────────────────

function QuizView({ items, onFinish }: { items: QuizItem[]; onFinish: (score: number) => void }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<boolean[]>([]);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const q = items[current];

  function answer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const isCorrect = idx === q.correctIndex;
    if (isCorrect) setCorrect((c) => c + 1);
    setAnswered((prev) => [...prev, isCorrect]);
  }

  function next() {
    if (current + 1 >= items.length) {
      setDone(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  }

  const score = correct / items.length;

  if (done) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className={cn('w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl',
          score >= 0.7 ? 'bg-emerald-100' : score >= 0.5 ? 'bg-amber-100' : 'bg-red-100')}>
          {score >= 0.7 ? '🎉' : score >= 0.5 ? '📚' : '💪'}
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          {correct}/{items.length} acertos
        </h2>
        <p className="text-slate-500">
          {score >= 0.7 ? 'Ótimo trabalho! Você domina este tópico.' :
           score >= 0.5 ? 'Bom progresso! Vale revisar alguns pontos.' :
           'Continue praticando — você vai melhorar!'}
        </p>
        <div className={cn('text-3xl font-bold', score >= 0.7 ? 'text-emerald-600' : score >= 0.5 ? 'text-amber-600' : 'text-red-500')}>
          {Math.round(score * 100)}%
        </div>
        <button onClick={() => onFinish(score)} className="btn-primary w-full py-3">
          <CheckCircle2 className="w-4 h-4" />
          Salvar resultado
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>Questão {current + 1} de {items.length}</span>
        <span>{correct} certo(s)</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full">
        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${((current) / items.length) * 100}%` }} />
      </div>

      <div className="card p-6">
        <p className="font-semibold text-slate-900 text-base mb-5">{q.question}</p>
        <div className="space-y-2">
          {q.options.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = i === q.correctIndex;
            let cls = 'border border-slate-200 hover:border-brand-300 hover:bg-brand-50';
            if (selected !== null) {
              if (isCorrect) cls = 'border-emerald-400 bg-emerald-50';
              else if (isSelected) cls = 'border-red-400 bg-red-50';
              else cls = 'border-slate-100 opacity-60';
            }
            return (
              <button key={i} onClick={() => answer(i)}
                className={cn('w-full text-left p-3.5 rounded-xl text-sm transition-all flex items-center gap-3', cls)}>
                <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
                {selected !== null && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                {selected !== null && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {selected !== null && q.explanation && (
          <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700 flex gap-2">
            <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {q.explanation}
          </div>
        )}
      </div>

      {selected !== null && (
        <button onClick={next} className="btn-primary w-full py-3">
          {current + 1 >= items.length ? 'Ver resultado' : 'Próxima questão'}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Flashcard view ───────────────────────────────────────────────────────────

function FlashcardView({ cards, onFinish }: { cards: Flashcard[]; onFinish: (score: number) => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);

  const card = cards[index];
  const done = index >= cards.length;

  function rate(knew: boolean) {
    setResults((r) => [...r, knew]);
    setFlipped(false);
    setTimeout(() => setIndex((i) => i + 1), 150);
  }

  if (done) {
    const score = results.filter(Boolean).length / cards.length;
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="text-4xl">{score >= 0.7 ? '🃏✨' : '📚'}</div>
        <h2 className="text-xl font-bold">{results.filter(Boolean).length}/{cards.length} conhecia</h2>
        <p className="text-slate-500 text-sm">
          {score >= 0.7 ? 'Excelente! Boa retenção.' : 'Revise os cartões que não sabia.'}
        </p>
        <button onClick={() => { setIndex(0); setResults([]); setFlipped(false); }} className="btn-secondary w-full">
          <RotateCcw className="w-4 h-4" />
          Repetir
        </button>
        <button onClick={() => onFinish(score)} className="btn-primary w-full">
          <CheckCircle2 className="w-4 h-4" />
          Salvar resultado
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>Cartão {index + 1} de {cards.length}</span>
        <span>✓ {results.filter(Boolean).length} · ✗ {results.filter((x) => !x).length}</span>
      </div>

      <div
        className="relative cursor-pointer"
        style={{ perspective: 1200 }}
        onClick={() => setFlipped((f) => !f)}
      >
        <motion.div
          className="relative w-full"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.4, type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Front */}
          <div className="card p-8 text-center min-h-[200px] flex flex-col items-center justify-center" style={{ backfaceVisibility: 'hidden' }}>
            <BookOpen className="w-6 h-6 text-brand-300 mb-3" />
            <p className="text-lg font-semibold text-slate-900">{card.front}</p>
            <p className="text-xs text-slate-400 mt-4">Toque para virar</p>
          </div>
          {/* Back */}
          <div className="card p-8 text-center min-h-[200px] flex flex-col items-center justify-center absolute inset-0 bg-brand-50 border-brand-200"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <p className="text-base text-slate-700 leading-relaxed">{card.back}</p>
          </div>
        </motion.div>
      </div>

      {flipped && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-3">
          <button onClick={() => rate(false)} className="btn-secondary py-3 border-red-200 text-red-600 hover:bg-red-50">
            <XCircle className="w-4 h-4" />
            Não sabia
          </button>
          <button onClick={() => rate(true)} className="btn-primary py-3 bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            Sabia!
          </button>
        </motion.div>
      )}
    </div>
  );
}
