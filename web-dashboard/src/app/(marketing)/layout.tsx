export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 py-4 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <strong className="text-lg tracking-tight text-brand-text font-bold">Pipeline</strong>
          </div>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-500">
            <a href="/" className="hover:text-brand-text transition-colors">Главная</a>
            <a href="/pricing" className="hover:text-brand-text transition-colors">Тарифы</a>
            <a href="/about" className="hover:text-brand-text transition-colors">О нас</a>
            <a href="/blog" className="hover:text-brand-text transition-colors">Блог</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-brand-text transition-colors hidden sm:block">
              Войти
            </a>
            <a href="/dashboard" className="bg-[#111827] hover:bg-black text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
              Dashboard
            </a>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-500">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-left mb-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-6 h-6 rounded bg-black flex items-center justify-center shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <strong className="text-brand-text font-bold">Pipeline</strong>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed">
              Модульная система генерации контента на базе специализированных AI-агентов. Ваша SMM-команда на автопилоте.
            </p>
          </div>
          <div>
            <h4 className="text-brand-text font-semibold mb-4">Продукт</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="/pricing" className="hover:text-brand-blue transition-colors">Тарифы</a></li>
              <li><a href="/dashboard" className="hover:text-brand-blue transition-colors">Дашборд</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-brand-text font-semibold mb-4">Компания</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="/about" className="hover:text-brand-blue transition-colors">О нас</a></li>
              <li><a href="/blog" className="hover:text-brand-blue transition-colors">Блог</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-brand-text font-semibold mb-4">Legal</h4>
            <ul className="flex flex-col gap-2">
              <li><a href="#" className="hover:text-brand-blue transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-brand-blue transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <p>© {new Date().getFullYear()} AI Content Pipeline. Все права защищены.</p>
      </footer>
    </>
  );
}
