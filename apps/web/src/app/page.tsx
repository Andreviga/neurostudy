'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Brain, BookOpen, BarChart2, Zap, CheckCircle2, ArrowRight,
  Upload, Target, RefreshCcw, Sparkles
} from 'lucide-react';

const features = [
  { icon: Upload, title: 'Upload de materiais', desc: 'PDF, DOCX, texto colado — o tutor lê e estrutura tudo automaticamente.' },
  { icon: Brain, title: 'Diagnóstico de dificuldade', desc: 'Identifica onde você trava e detecta lacunas de pré-requisito.' },
  { icon: Zap, title: 'Ensino adaptativo', desc: 'Resumos, quizzes, flashcards, analogias — o formato muda até você entender.' },
  { icon: RefreshCcw, title: 'Revisão espaçada', desc: 'Algoritmo SM-2 agenda revisões no momento certo para maximizar retenção.' },
  { icon: Target, title: 'Trilha personalizada', desc: 'Plano de estudo diário baseado no seu ritmo, urgências e desempenho.' },
  { icon: BarChart2, title: 'Painel de progresso', desc: 'Veja sua evolução por disciplina, pontos fracos e tempo estudado.' },
];

const steps = [
  { n: '01', title: 'Crie sua conta', desc: 'Informe seu curso e as matérias que precisa recuperar.' },
  { n: '02', title: 'Envie seus materiais', desc: 'Faça upload dos PDFs das aulas ou cole o texto diretamente.' },
  { n: '03', title: 'Estude com o tutor', desc: 'A IA gera resumos, quizzes e flashcards. Você estuda, ela se adapta.' },
  { n: '04', title: 'Acompanhe a evolução', desc: 'Dashboard mostra seu progresso real e sugere o próximo passo.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-hidden">
      {/* ─── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">NeuroStudy</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Entrar
            </Link>
            <Link href="/signup" className="btn-primary text-sm px-4 py-2">
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-indigo-50 -z-10" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-brand-200/30 rounded-full blur-3xl -z-10" />

        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-sm font-medium mb-6 border border-brand-100">
              <Sparkles className="w-3.5 h-3.5" />
              Tutor IA adaptativo para universitários
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6 text-slate-900">
              Recupere matérias{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-500">
                com IA que aprende
              </span>{' '}
              como você aprende
            </h1>

            <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Envie seus PDFs e materiais. O NeuroStudy identifica suas dificuldades,
              adapta o método de ensino e monta uma trilha de recuperação personalizada.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup" className="btn-primary px-7 py-3 text-base">
                Começar agora — grátis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login" className="btn-secondary px-7 py-3 text-base">
                Já tenho conta
              </Link>
            </div>

            <p className="text-xs text-slate-400 mt-4">Sem cartão de crédito · Comece em 2 minutos</p>
          </motion.div>

          {/* Dashboard preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-16 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="bg-slate-800 h-8 flex items-center gap-1.5 px-4">
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50 p-8 grid grid-cols-3 gap-4">
              {[
                { label: 'Sessões', value: '48', delta: '+12 essa semana' },
                { label: 'Minutos estudados', value: '1.240', delta: 'Meta: 45min/dia' },
                { label: 'Taxa de acerto', value: '74%', delta: '+8% vs semana passada' },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-left">
                  <p className="text-xs text-slate-400 font-medium">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
                  <p className="text-xs text-emerald-600 mt-1">{s.delta}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Tudo que você precisa para não ficar para trás</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Diferente de apps genéricos, o NeuroStudy entende o seu conteúdo e se adapta ao seu jeito de aprender.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card p-6 hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Como funciona</h2>
          </div>
          <div className="space-y-6">
            {steps.map((s) => (
              <div key={s.n} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-brand-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg">
                  {s.n}
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-900">{s.title}</h3>
                  <p className="text-slate-500 mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-brand-600 to-indigo-600 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold mb-4">Pronto para virar o jogo?</h2>
          <p className="text-brand-100 text-lg mb-8">
            Junte-se a estudantes que usam IA real para recuperar e avançar.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-3 bg-white text-brand-700 font-bold rounded-xl hover:bg-brand-50 transition-colors text-base">
            Criar conta grátis
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-slate-100 text-center text-sm text-slate-400">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 bg-brand-600 rounded-md flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-700">NeuroStudy</span>
        </div>
        <p>Tutor IA adaptativo · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
