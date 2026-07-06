"use client";

import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage("Вы успешно добавлены в список ожидания!");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Произошла ошибка");
      }
    } catch (error) {
      setStatus("error");
      setMessage("Ошибка соединения с сервером");
    }
  };

  return (
    <main className="min-h-screen bg-brand-bg text-brand-text selection:bg-brand-blue selection:text-white pb-20">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 max-w-6xl mx-auto text-center flex flex-col items-center">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-blue/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-600 mb-8 shadow-sm">
          🚀 Сейчас доступно для LinkedIn. <span className="text-gray-400 hidden sm:inline">Скоро: Instagram, Telegram, YouTube.</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
          Контент для бизнеса.<br/>
          <span className="text-gray-900">С вашим финальным утверждением.</span>
        </h1>

        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-12 leading-relaxed">
          Наша AI-команда из 6 агентов находит тренды, пишет посты, рисует карусели и проверяет SEO. Вам остается только нажать «Опубликовать». Экономьте 20+ часов в неделю.
        </p>

        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto relative z-10 flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="founder@yourcompany.com"
            className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-brand-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all shadow-sm"
            disabled={status === "loading" || status === "success"}
          />
          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className="bg-brand-blue hover:bg-[#0077b5] text-white font-medium px-6 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:shadow-brand-blue/20 hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:transform-none flex-shrink-0 min-w-[240px]"
          >
            {status === "loading" ? "Отправка..." : status === "success" ? "Готово ✓" : "Получить ранний доступ"}
          </button>
        </form>
        {message && (
          <p className={`mt-4 text-sm font-medium ${status === "success" ? "text-emerald-600" : "text-red-500"}`}>
            {message}
          </p>
        )}
      </section>

      {/* How it works (Pipeline) */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Как работает пайплайн</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">Визуализация полного цикла создания контента от идеи до публикации.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Trend Agent", desc: "Слушает пульс интернета (HackerNews, Reddit). Вы всегда в теме." },
            { step: "2", title: "Positioning Agent", desc: "Адаптирует тренды под уникальный голос и позиционирование вашего бренда." },
            { step: "3", title: "Strategy Agent", desc: "Создает контент-план и прописывает структуру будущего поста." },
            { step: "4", title: "Writing Agent", desc: "Пишет вовлекающий текст, не похожий на стандартную генерацию ИИ." },
            { step: "5", title: "Design Agent", desc: "Генерирует стильные карусели и иллюстрации к вашим постам." },
            { step: "6", title: "Quality Control", desc: "Внутренний редактор. Если пост скучный — агент отправит его на переделку сам." },
          ].map((agent, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-gray-300 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center font-bold mb-4 group-hover:scale-110 transition-transform">
                {agent.step}
              </div>
              <h3 className="text-xl font-semibold mb-2 text-brand-text">{agent.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{agent.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6 max-w-6xl mx-auto bg-white rounded-3xl border border-gray-200 my-12 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
          <div>
            <div className="w-12 h-12 bg-gray-100 text-gray-800 rounded-xl flex items-center justify-center mb-6 mx-auto md:mx-0 shadow-sm border border-gray-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Вы не тратите время на рутину</h3>
            <p className="text-gray-600 text-sm leading-relaxed">Система сама находит, о чем говорят на GitHub, Reddit и HackerNews, собирая актуальные темы для вашей аудитории.</p>
          </div>
          <div>
            <div className="w-12 h-12 bg-gray-100 text-gray-800 rounded-xl flex items-center justify-center mb-6 mx-auto md:mx-0 shadow-sm border border-gray-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Контент, который не выглядит как AI</h3>
            <p className="text-gray-600 text-sm leading-relaxed">Благодаря многоагентной системе и строгому Quality Loop мы добиваемся естественного, экспертного звучания текста.</p>
          </div>
          <div>
            <div className="w-12 h-12 bg-gray-100 text-gray-800 rounded-xl flex items-center justify-center mb-6 mx-auto md:mx-0 shadow-sm border border-gray-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Человек в центре</h3>
            <p className="text-gray-600 text-sm leading-relaxed">Human-in-the-loop подход. Мы готовим и проверяем контент — вы утверждаете его одним кликом перед публикацией.</p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-6 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-6">Будьте в числе первых, кто автоматизирует свой рост</h2>
        <p className="text-gray-500 mb-8">Оставьте email, и мы пришлем приглашение, как только откроем доступ для новых пользователей.</p>

        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto relative z-10 flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="founder@yourcompany.com"
            className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-brand-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all shadow-sm"
            disabled={status === "loading" || status === "success"}
          />
          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className="bg-[#111827] text-white hover:bg-black font-semibold px-6 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:transform-none flex-shrink-0 min-w-[240px]"
          >
            {status === "loading" ? "Отправка..." : status === "success" ? "Готово ✓" : "Забронировать место"}
          </button>
        </form>
      </section>
    </main>
  );
}
