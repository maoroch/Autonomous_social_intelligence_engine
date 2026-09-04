export enum CallbackAction {
  APPROVE_RUN = "approve_run",
  REJECT_RUN = "reject_run",
  VIEW_CAROUSEL = "view_carousel",
  VIEW_FULL_TEXT = "view_full_text",
  UPLOAD_COVER = "upload_cover",
  EDIT_TEXT = "edit_text",
  REGENERATE_WRITING = "regenerate_writing",
  REGENERATE_DESIGN = "regenerate_design",
  VIEW_LOGS = "view_logs",
  CMD = "cmd",
  CINEMA_MODE = "cinema_mode",
  CINEMA_PICK = "cinema_pick",
  CINEMA_REFRESH = "cinema_refresh",
  TECH_MODE = "tech_mode",
  TECH_PICK = "tech_pick",
  TECH_REFRESH = "tech_refresh",
  TESTO_MODE = "testo_mode",
  TESTO_PICK = "testo_pick",
  TESTO_REFRESH = "testo_refresh",
  TREND_PICK = "trend_pick",
}

export type MenuCommand =
  | "daily_cinema"
  | "daily_tech"
  | "daily_testo"
  | "trends"
  | "main_menu"
  | "status"
  | "logs"
  | "queues";

export interface ParsedCallback {
  action: CallbackAction;
  param: string;
  raw: string;
}
