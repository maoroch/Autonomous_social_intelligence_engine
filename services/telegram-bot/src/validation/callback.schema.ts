import { z } from "zod";
import { CallbackAction, type ParsedCallback } from "../types/actions.types.js";

const CallbackActionEnum = z.nativeEnum(CallbackAction);

export const CallbackDataSchema = z.string().min(1).refine(
  (data) => data.includes(":"),
  { message: "Callback data must follow format action:param" }
);

export function parseCallbackData(raw: string): { success: true; data: ParsedCallback } | { success: false; error: string } {
  if (!raw || typeof raw !== "string") {
    return { success: false, error: "Empty callback data" };
  }

  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) {
    return { success: false, error: `Invalid format: missing colon separator in "${raw}"` };
  }

  const actionStr = raw.substring(0, colonIdx);
  const param = raw.substring(colonIdx + 1);

  const parsedAction = CallbackActionEnum.safeParse(actionStr);
  if (!parsedAction.success) {
    return { success: false, error: `Unknown callback action: "${actionStr}"` };
  }

  return {
    success: true,
    data: {
      action: parsedAction.data,
      param,
      raw,
    },
  };
}
