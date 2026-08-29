/**
 * Фирменные inline-клавиатуры для модерации и управления пайплайном KinoPeek.
 */

export function buildApprovalKeyboard(runId: string) {
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
        { text: "📸 Загрузить свой кадр на обложку", callback_data: `upload_cover:${runId}` },
        { text: "✏️ Редактировать текст", callback_data: `edit_text:${runId}` },
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
        { text: "🎬 Запуск KinoPeek", callback_data: "cmd:daily_cinema" },
        { text: "🔥 Тренды дня", callback_data: "cmd:trends" },
      ],
      [
        { text: "🧪 Тест пайплайна", callback_data: "cmd:test_pipeline" },
        { text: "📋 Статус прогонов", callback_data: "cmd:status" },
      ],
      [
        { text: "📜 Журнал логов", callback_data: "cmd:logs" },
        { text: "📊 Очереди задач", callback_data: "cmd:queues" },
      ],
    ],
  };
}
