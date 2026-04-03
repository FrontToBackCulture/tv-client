import type { NodeTypes } from "@xyflow/react";
import { TriggerNode } from "./TriggerNode";
import { DataSourceNode } from "./DataSourceNode";
import { AiProcessNode } from "./AiProcessNode";
import { OutputNode } from "./OutputNode";

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  data_source: DataSourceNode,
  ai_process: AiProcessNode,
  output: OutputNode,
};
