export default function AboutPage() {
  return (
    <main className="min-h-screen bg-brand-bg text-brand-text pb-20 pt-32">
      <div className="max-w-4xl mx-auto px-6">
        <h1 className="text-4xl md:text-6xl font-bold mb-8 text-center">
          Освобождаем бизнес от <br/>
          <span className="text-gray-900">
            рутины создания контента
          </span>
        </h1>

        <div className="prose prose-lg max-w-none text-brand-text">
          <p className="text-gray-600 leading-relaxed text-xl mb-12 text-center max-w-3xl mx-auto">
            Наша миссия — дать возможность фаундерам и командам фокусироваться на разработке продукта и общении с клиентами, а не на написании постов.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
            <div>
              <h2 className="text-2xl font-bold mb-4">Как родилась идея</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Мы сами столкнулись с проблемой: чтобы вести экспертный блог на LinkedIn, нужно было тратить по 3-4 часа на один качественный пост. Поиск темы, проверка фактов, написание, редактура, создание картинки.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed">
                Обычный ChatGPT не справлялся — тексты получались водянистыми и "пластиковыми". Тогда мы решили построить пайплайн из узкоспециализированных агентов, каждый из которых делает только свою часть работы, но делает её идеально.
              </p>
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-4">Наши технологии</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Мы не просто "обертка над LLM". Сердце продукта — это <strong>OpenClaw</strong>, наш собственный оркестратор агентов.
              </p>
              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-brand-blue">▹</span>
                  <span><strong>Многоагентная архитектура:</strong> 6 микросервисов на Node.js общаются через шину данных (Redis/BullMQ).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-blue">▹</span>
                  <span><strong>Fallback-модели:</strong> Мы умно роутим запросы между OpenAI, Anthropic и локальными моделями через OpenRouter.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-blue">▹</span>
                  <span><strong>Строгий Quality Loop:</strong> Агент контроля качества проверяет факты и SEO до того, как пост попадет к вам на стол.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
