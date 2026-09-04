import type { Queue } from "bullmq";
import { PipelineStage, type AgentJob } from "@pipeline/shared";

export interface BotQueues {
  [PipelineStage.TREND]: Queue<AgentJob>;
  [PipelineStage.WRITING]: Queue<AgentJob>;
  [PipelineStage.DESIGN]: Queue<AgentJob>;
  [PipelineStage.PUBLISHING]: Queue<AgentJob>;
}

export interface BotContext {
  token: string;
  adminChatId?: string;
  openclawUrl: string;
}
