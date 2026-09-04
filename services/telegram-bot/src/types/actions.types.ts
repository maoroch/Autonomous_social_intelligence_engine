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
  TESTO_MEDIA_PICK = "testo_media_pick",
  TESTO_MEDIA_REFRESH = "testo_media_refresh",
  TESTO_CASES_PICK = "testo_cases_pick",
  TESTO_CASES_REFRESH = "testo_cases_refresh",
  TREND_PICK = "trend_pick",
  REVOKE_TESTO = "revoke_testo",
  REVOKE_ROLE = "revoke_role",
}

export enum UserRole {
  SUPERADMIN = "superadmin",
  TESTO_ADMIN = "testo_admin",
  TECH_ADMIN = "tech_admin",
  CINEMA_ADMIN = "cinema_admin",
  GUEST = "guest",
}

export type PortalTenant = "testo" | "software-development-default" | "cinema-media";

export type MenuCommand =
  | "daily_cinema"
  | "daily_tech"
  | "daily_testo"
  | "trends"
  | "main_menu"
  | "status"
  | "logs"
  | "queues"
  | "my_role"
  | "manage_testo"
  | "add_testo_prompt";

export interface ParsedCallback {
  action: CallbackAction;
  param: string;
  raw: string;
}

