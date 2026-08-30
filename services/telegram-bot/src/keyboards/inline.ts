/**
 * Фирменные inline-клавиатуры для модерации и управления пайплайном KinoPeek.
 */

export function buildApprovalKeyboard(
  runId: string,
  tenantId: string = "cinema-media",
  dashboardBaseUrl: string = process.env.DASHBOARD_PUBLIC_URL || "http://localhost:3005"
) {
  const dashboardEditUrl = `${dashboardBaseUrl}/${tenantId}/dashboard/runs/${runId}`;

  return {
    inline_keyboard: [
      [
        { text: "🚀 Опубликовать в канал", callback_data: `approve_run:${runId}` },
        { text: "❌ Отклонить", callback_data: `reject_run:${runId}` },
      ],
      [
        { text: "🖼 Показать всю карусель (альбом)", callback_data: `view_carousel:${runId}` },
      ],
      [
        { text: "📝 Читать весь текст поста", callback_data: `view_full_text:${runId}` },
      ],
      [
        { text: "📸 Загрузить свой кадр на обложку", callback_data: `upload_cover:${runId}` },
        { text: "✏️ Редактировать в Dashboard", url: dashboardEditUrl },
      ],
      [
        { text: "🔄 Регенерация текста", callback_data: `regenerate_writing:${runId}` },
        { text: "🎨 Сменить дизайн", callback_data: `regenerate_design:${runId}` },
      ],
      [
        { text: "📜 Логи прогона", callback_data: `view_logs:${runId}` },
      ],
    ],
  };
}

export function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🎬 Кино-медиа (KinoPeek)", callback_data: "cmd:daily_cinema" },
      ],
      [
        { text: "💻 IT & Tech (Dev / GitHub)", callback_data: "cmd:daily_tech" },
        { text: "🏭 Testo (B2B / Промышленность)", callback_data: "cmd:daily_testo" },
      ],
      [
        { text: "🔥 Тренды кино", callback_data: "cmd:trends" },
        { text: "📋 Статус прогонов", callback_data: "cmd:status" },
      ],
      [
        { text: "📜 Журнал логов", callback_data: "cmd:logs" },
        { text: "📊 Очереди задач", callback_data: "cmd:queues" },
      ],
    ],
  };
}
