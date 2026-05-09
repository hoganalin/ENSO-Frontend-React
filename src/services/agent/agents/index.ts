import type { AgentId, AgentPersona } from "../../../types/agent";
import { xiaohe } from "./xiaohe";
import { xiaoxiang } from "./xiaoxiang";
import { xiaoguan } from "./xiaoguan";

// Agent Registry
// 所有 agent 的集中定義，UI / router / adapter 都從這裡取用

export const AGENT_REGISTRY: Record<AgentId, AgentPersona> = {
  xiaohe,
  xiaoxiang,
  xiaoguan,
};

export const DEFAULT_AGENT_ID: AgentId = "xiaohe";

export const ALL_AGENT_IDS: AgentId[] = ["xiaohe", "xiaoxiang", "xiaoguan"];

export const getAgent = (id: AgentId): AgentPersona => AGENT_REGISTRY[id];

// 取得某個 agent 允許使用的 tool schemas 子集
export const getToolsForAgent = <T extends { name: string }>(
  id: AgentId,
  allTools: T[],
): T[] => {
  const persona = AGENT_REGISTRY[id];
  const allowed = new Set(persona.toolNames);
  return allTools.filter((t) => allowed.has(t.name));
};
