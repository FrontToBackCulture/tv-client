import type { NodeTypes } from "@xyflow/react";
import { DepNode, DepCenterNode, DepGroupNode } from "./DepNodeComponent";

export const depNodeTypes: NodeTypes = {
  depNode: DepNode,
  depCenter: DepCenterNode,
  depGroup: DepGroupNode,
};
