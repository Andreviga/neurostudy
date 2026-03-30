/**
 * Seed script — populates the DB with demo data for local development.
 * Run: npm run db:seed (from apps/api)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Demo user ──────────────────────────────────────────────────────────────
  const password = await bcrypt.hash('demo1234', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@neurostudy.app' },
    update: {},
    create: {
      name: 'Ana Oliveira',
      email: 'demo@neurostudy.app',
      password,
      course: 'Engenharia de Computação',
      semester: 4,
      dailyGoalMinutes: 45,
    },
  });
  console.log(`  ✓ User: ${user.email}`);

  // ─── Learning profile ────────────────────────────────────────────────────────
  await prisma.learningProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      preferredFormats: ['QUIZ', 'SUMMARY_SHORT', 'FLASHCARD'],
      weakTopics: [],
      peakHour: 'evening',
      avgSessionMins: 25,
      streakDays: 3,
    },
  });

  // ─── Subjects ────────────────────────────────────────────────────────────────
  const calculus = await prisma.subject.upsert({
    where: { id: 'seed-subject-calc' },
    update: {},
    create: {
      id: 'seed-subject-calc',
      userId: user.id,
      name: 'Cálculo II',
      description: 'Integrais, séries e equações diferenciais',
      color: '#6366f1',
      priority: 'URGENT',
    },
  });

  const algorithms = await prisma.subject.upsert({
    where: { id: 'seed-subject-algo' },
    update: {},
    create: {
      id: 'seed-subject-algo',
      userId: user.id,
      name: 'Algoritmos e Estruturas de Dados',
      description: 'Ordenação, busca, grafos e complexidade',
      color: '#10b981',
      priority: 'HIGH',
    },
  });

  const physics = await prisma.subject.upsert({
    where: { id: 'seed-subject-phys' },
    update: {},
    create: {
      id: 'seed-subject-phys',
      userId: user.id,
      name: 'Física II',
      description: 'Eletromagnetismo e ondas',
      color: '#f59e0b',
      priority: 'MEDIUM',
    },
  });
  console.log(`  ✓ Subjects: ${calculus.name}, ${algorithms.name}, ${physics.name}`);

  // ─── Topics for Cálculo II ───────────────────────────────────────────────────
  const calcTopics = [
    { title: 'Integral Definida', summary: 'Conceito de integral como área sob a curva e Teorema Fundamental do Cálculo.', difficulty: 'MEDIUM', order: 1 },
    { title: 'Técnicas de Integração', summary: 'Substituição, integração por partes, frações parciais.', difficulty: 'HARD', order: 2 },
    { title: 'Séries de Taylor', summary: 'Expansão de funções em séries de potências ao redor de um ponto.', difficulty: 'HARD', order: 3 },
    { title: 'EDOs de 1ª Ordem', summary: 'Equações diferenciais ordinárias separáveis e lineares.', difficulty: 'MEDIUM', order: 4 },
  ];

  for (const t of calcTopics) {
    await prisma.topic.upsert({
      where: { id: `seed-topic-calc-${t.order}` },
      update: {},
      create: { id: `seed-topic-calc-${t.order}`, subjectId: calculus.id, ...t } as never,
    });
  }

  // ─── Topics for Algoritmos ───────────────────────────────────────────────────
  const algoTopics = [
    { title: 'Complexidade de Algoritmos (Big-O)', summary: 'Análise de eficiência temporal e espacial de algoritmos.', difficulty: 'MEDIUM', order: 1 },
    { title: 'Ordenação', summary: 'QuickSort, MergeSort, HeapSort — análise e comparação.', difficulty: 'MEDIUM', order: 2 },
    { title: 'Árvores Binárias de Busca', summary: 'Inserção, remoção, balanceamento e travessias.', difficulty: 'HARD', order: 3 },
    { title: 'Grafos e BFS/DFS', summary: 'Representação de grafos e algoritmos de busca em largura e profundidade.', difficulty: 'HARD', order: 4 },
  ];

  for (const t of algoTopics) {
    await prisma.topic.upsert({
      where: { id: `seed-topic-algo-${t.order}` },
      update: {},
      create: { id: `seed-topic-algo-${t.order}`, subjectId: algorithms.id, ...t } as never,
    });
  }

  // ─── Quiz items for "Complexidade de Algoritmos" ──────────────────────────
  const algoTopic1 = await prisma.topic.findUnique({ where: { id: 'seed-topic-algo-1' } });
  if (algoTopic1) {
    await prisma.quizItem.upsert({
      where: { id: 'seed-quiz-1' },
      update: {},
      create: {
        id: 'seed-quiz-1',
        topicId: algoTopic1.id,
        question: 'Qual é a complexidade de tempo do algoritmo QuickSort no caso médio?',
        options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
        correctIndex: 1,
        explanation: 'O QuickSort tem complexidade O(n log n) no caso médio, pois a cada recursão divide o array aproximadamente ao meio.',
      },
    });

    await prisma.quizItem.upsert({
      where: { id: 'seed-quiz-2' },
      update: {},
      create: {
        id: 'seed-quiz-2',
        topicId: algoTopic1.id,
        question: 'O que significa dizer que um algoritmo é O(1)?',
        options: [
          'Executa em 1 segundo',
          'Tempo de execução cresce linearmente',
          'Tempo de execução é constante, independente do tamanho da entrada',
          'O algoritmo usa apenas 1 unidade de memória',
        ],
        correctIndex: 2,
        explanation: 'O(1) indica tempo constante: não importa o tamanho da entrada, o algoritmo sempre realiza o mesmo número de operações.',
      },
    });
  }

  // ─── Flashcards ───────────────────────────────────────────────────────────────
  const calcTopic1 = await prisma.topic.findUnique({ where: { id: 'seed-topic-calc-1' } });
  if (calcTopic1) {
    const flashcards = [
      { front: 'O que é o Teorema Fundamental do Cálculo?', back: 'Relaciona derivação e integração: se F é primitiva de f, então ∫[a,b] f(x)dx = F(b) - F(a).' },
      { front: 'Integral de x^n (n ≠ -1)', back: '∫ x^n dx = x^(n+1)/(n+1) + C' },
      { front: 'Integral de 1/x', back: '∫ 1/x dx = ln|x| + C' },
      { front: 'Integral de e^x', back: '∫ e^x dx = e^x + C' },
    ];
    for (let i = 0; i < flashcards.length; i++) {
      await prisma.flashcard.upsert({
        where: { id: `seed-flash-${i}` },
        update: {},
        create: { id: `seed-flash-${i}`, topicId: calcTopic1.id, ...flashcards[i] },
      });
    }
  }

  // ─── Study sessions ───────────────────────────────────────────────────────────
  const sessions = [
    { topicId: 'seed-topic-algo-1', format: 'QUIZ', durationSecs: 840, completionRate: 1.0, score: 0.8 },
    { topicId: 'seed-topic-calc-1', format: 'SUMMARY_SHORT', durationSecs: 600, completionRate: 1.0, score: null },
    { topicId: 'seed-topic-algo-2', format: 'FLASHCARD', durationSecs: 480, completionRate: 0.75, score: 0.6 },
    { topicId: 'seed-topic-calc-2', format: 'STEP_BY_STEP', durationSecs: 1200, completionRate: 0.9, score: 0.5 },
    { topicId: 'seed-topic-algo-3', format: 'QUIZ', durationSecs: 720, completionRate: 1.0, score: 0.4 },
  ];

  for (const s of sessions) {
    await prisma.studySession.create({ data: { userId: user.id, ...s } as never });
  }
  console.log(`  ✓ Study sessions: ${sessions.length}`);

  // ─── Reviews ──────────────────────────────────────────────────────────────────
  const tomorrow = new Date(Date.now() + 86400000);
  const threeDays = new Date(Date.now() + 3 * 86400000);
  const overdue = new Date(Date.now() - 86400000);

  await prisma.review.upsert({
    where: { userId_topicId: { userId: user.id, topicId: 'seed-topic-calc-1' } },
    update: {},
    create: { userId: user.id, topicId: 'seed-topic-calc-1', nextReviewDate: overdue, retentionScore: 0.6, reviewCount: 2 },
  });
  await prisma.review.upsert({
    where: { userId_topicId: { userId: user.id, topicId: 'seed-topic-algo-1' } },
    update: {},
    create: { userId: user.id, topicId: 'seed-topic-algo-1', nextReviewDate: tomorrow, retentionScore: 0.8, reviewCount: 3 },
  });
  await prisma.review.upsert({
    where: { userId_topicId: { userId: user.id, topicId: 'seed-topic-algo-3' } },
    update: {},
    create: { userId: user.id, topicId: 'seed-topic-algo-3', nextReviewDate: overdue, retentionScore: 0.4, reviewCount: 1 },
  });
  console.log(`  ✓ Reviews scheduled`);

  console.log('\n✅ Seed complete!');
  console.log('   Login: demo@neurostudy.app / demo1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
