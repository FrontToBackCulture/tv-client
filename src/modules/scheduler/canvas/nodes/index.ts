import type { NodeTypes } from "@xyflow/react";
import { TriggerNode } from "./TriggerNode";
import { DataSourceNode } from "./DataSourceNode";
import { SkillsNode } from "./SkillsNode";
import { ActionNode } from "./ActionNode";
import { AiProcessNode } from "./AiProcessNode";
import { OutputNode } from "./OutputNode";
import { LoopNode } from "./LoopNode";
import { LoopGroupNode } from "./LoopGroupNode";

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  data_source: DataSourceNode,
  skills: SkillsNode,
  action: ActionNode,
  ai_process: AiProcessNode,
  output: OutputNode,
  loop: LoopNode,
  loop_group: LoopGroupNode,
};
