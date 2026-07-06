export default function BlogPage() {
  const posts = [
    {
      id: 1,
      category: "LinkedIn Strategy",
      title: "Как SMM-агентству увеличить выпуск контента в 5 раз",
      desc: "Разбираем кейс использования AI Content Pipeline для масштабирования контент-маркетинга B2B стартапа.",
      date: "12 Июля 2026",
      readTime: "5 мин",
    },
    {
      id: 2,
      category: "AI in Marketing",
      title: "AI Content Pipeline vs ChatGPT для бизнеса",
      desc: "Почему простой промпт больше не работает и зачем вам нужна многоагентная система с Quality Loop.",
      date: "5 Июля 2026",
      readTime: "8 мин",
    },
    {
      id: 3,
      category: "Growth Hacks",
      title: "Как экономить время на SMM в B2B",
      desc: "Пошаговый гайд по автоматизации поиска трендов и генерации идей для постов на основе HackerNews.",
      date: "28 Июня 2026",
      readTime: "6 мин",
    }
  ];

  return (
    <main className="min-h-screen bg-brand-bg text-brand-text pb-20 pt-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Блог & Ресурсы</h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Стратегии, growth hacks и обновления продукта для тех, кто хочет автоматизировать свой рост.
          </p>
        </div>

        <div className="flex gap-4 mb-12 overflow-x-auto pb-4 hide-scrollbar">
          {["Все статьи", "Growth Hacks", "LinkedIn Strategy", "AI in Marketing", "Product Updates"].map((tag, i) => (
            <button key={i} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${i === 0 ? "bg-[#111827] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <article key={post.id} className="group cursor-pointer">
              <div className="w-full aspect-[16/9] bg-gray-50 rounded-2xl mb-4 overflow-hidden relative border border-gray-200 group-hover:border-gray-300 group-hover:shadow-sm transition-all">
                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md border border-gray-200 px-3 py-1 rounded-full text-xs font-medium text-brand-text shadow-sm">
                  {post.category}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <span>{post.date}</span>
                <span>•</span>
                <span>{post.readTime} чтения</span>
              </div>
              <h3 className="text-xl font-bold mb-2 group-hover:text-brand-blue transition-colors text-brand-text">
                {post.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                {post.desc}
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
