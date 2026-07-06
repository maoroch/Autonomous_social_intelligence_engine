export default function PricingPage() {
  return (
    <main className="min-h-screen bg-brand-bg text-brand-text pb-20 pt-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Простые и прозрачные тарифы</h1>
          <p className="text-gray-500 text-lg">Начните бесплатно, платите по мере роста вашего бизнеса.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Tier 1 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 hover:border-gray-300 transition-colors shadow-sm">
            <h3 className="text-xl font-semibold mb-2">Solo / Starter</h3>
            <p className="text-gray-500 text-sm mb-6 h-10">Для соло-фаундеров и фрилансеров.</p>
            <div className="text-3xl font-bold mb-6">$29<span className="text-lg text-gray-400 font-normal">/мес</span></div>
            <ul className="space-y-4 mb-8 text-sm text-gray-600">
              <li className="flex items-center gap-2">✓ 1 профиль автора</li>
              <li className="flex items-center gap-2">✓ 15 генераций в месяц</li>
              <li className="flex items-center gap-2">✓ Базовая аналитика</li>
              <li className="flex items-center gap-2">✓ Только LinkedIn</li>
            </ul>
            <button className="w-full bg-gray-100 hover:bg-gray-200 text-brand-text font-medium py-3 rounded-xl transition-colors">
              Выбрать Solo
            </button>
          </div>

          {/* Tier 2 */}
          <div className="bg-blue-50 border border-brand-blue/30 rounded-2xl p-8 relative transform md:-translate-y-4 shadow-xl shadow-brand-blue/5">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-brand-blue text-white text-xs font-bold px-3 py-1 rounded-full">
              ПОПУЛЯРНЫЙ
            </div>
            <h3 className="text-xl font-semibold mb-2">Business / Pro</h3>
            <p className="text-gray-600 text-sm mb-6 h-10">Для малого бизнеса и стартапов.</p>
            <div className="text-3xl font-bold mb-6">$99<span className="text-lg text-brand-blue/70 font-normal">/мес</span></div>
            <ul className="space-y-4 mb-8 text-sm text-gray-700">
              <li className="flex items-center gap-2">✓ До 5 профилей авторов</li>
              <li className="flex items-center gap-2">✓ Неограниченные генерации</li>
              <li className="flex items-center gap-2">✓ Приоритетная очередь</li>
              <li className="flex items-center gap-2">✓ Продвинутая аналитика SEO</li>
              <li className="flex items-center gap-2">✓ Кросс-постинг (скоро)</li>
            </ul>
            <button className="w-full bg-brand-blue hover:bg-[#0077b5] text-white font-medium py-3 rounded-xl transition-colors shadow-lg shadow-brand-blue/20">
              Выбрать Pro
            </button>
          </div>

          {/* Tier 3 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 hover:border-gray-300 transition-colors shadow-sm">
            <h3 className="text-xl font-semibold mb-2">Agency</h3>
            <p className="text-gray-500 text-sm mb-6 h-10">Для маркетинговых агентств.</p>
            <div className="text-3xl font-bold mb-6">$299<span className="text-lg text-gray-400 font-normal">/мес</span></div>
            <ul className="space-y-4 mb-8 text-sm text-gray-600">
              <li className="flex items-center gap-2">✓ Неограниченные профили</li>
              <li className="flex items-center gap-2">✓ White-label дашборд</li>
              <li className="flex items-center gap-2">✓ Доступ к API</li>
              <li className="flex items-center gap-2">✓ Персональный менеджер</li>
            </ul>
            <button className="w-full bg-[#111827] text-white hover:bg-black font-medium py-3 rounded-xl transition-colors">
              Связаться с нами
            </button>
          </div>
        </div>

        {/* FAQ Preview */}
        <div className="mt-32 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-8 text-center">Частые вопросы</h2>
          <div className="space-y-4">
            {[
              { q: "Как работает SEO-агент?", a: "Агент анализирует поисковые запросы внутри LinkedIn и оптимизирует текст, хэштеги и структуру поста для максимального охвата алгоритмами." },
              { q: "Откуда берутся тренды?", a: "Мы непрерывно парсим HackerNews, Reddit, GitHub Trending и тематические медиа, чтобы находить зарождающиеся темы до того, как они станут мейнстримом." },
              { q: "Могу ли я редактировать посты?", a: "Да. Вы всегда имеете последнее слово. Перед публикацией вы можете отредактировать текст или попросить агента переписать его в другом тоне." }
            ].map((faq, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h4 className="text-lg font-semibold mb-2">{faq.q}</h4>
                <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
