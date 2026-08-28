export const DEFAULT_PROFILE = {
  topics: ["Node.js", "Next.js", "AI", "SaaS", "Backend", "Automation", "Supabase"],
  forbidden_words: ["crypto", "web3", "nft"],
  cta_style: "Задайте открытый вопрос в конце для вовлечения",
  use_emoji: true,
  tone: 'профессиональный, но доступный, без лишней "воды"',
};

export const PRESET_CTAS_EN: Record<string, Record<string, string>> = {
  testo: {
    default: "Contact the official Testo distributor for certified equipment and calibration.",
  },
  "software-development-default": {
    "github-trending-repos": "Bookmark this roundup and share it with your dev colleagues!",
    "pet-projects-showcase": "Save these project ideas for your GitHub portfolio!",
    "tech-discussions-debates": "What approach do you use in your project? Share your thoughts in the comments!",
    default: "Share your thoughts in the comments below!",
  },
};

export const PRESET_CTAS_RU: Record<string, Record<string, string>> = {
  testo: {
    "pharma-compliance-explained":
      "Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии, Госреестра СИ и калибровки.",
    "pharma-cold-chain-story":
      "Обращайтесь к официальному дистрибьютору Testo за решениями непрерывного температурного мониторинга холодовой цепи.",
    "pharma-audit-ready":
      "Подготовьтесь к аудиту GxP с цифровыми системами Testo от официального дистрибьютора.",
    default:
      "Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии и калибровки.",
  },
  "software-development-default": {
    "github-trending-repos": "Сохраните подборку в закладки и поделитесь с коллегами-разработчиками!",
    "pet-projects-showcase": "Сохраните идеи для своего портфолио на GitHub!",
    "tech-discussions-debates":
      "А какой подход используете вы в своём проекте? Напишите свои аргументы в комментариях!",
    default: "Поделитесь вашим мнением в комментариях!",
  },
  "cinema-media": {
    "marvel-mcu-lore": "А какой ваш любимый проект Marvel? Делитесь мнением в комментариях!",
    "cinema-history-backstage": "Знали об этих деталях съемок? Напишите в комментариях!",
    "box-office-analytics": "Оправдал ли фильм кассовые ожидания? Обсуждаем в комментариях!",
    default: "Подписывайтесь и делитесь мыслями в комментариях!",
  },
};
