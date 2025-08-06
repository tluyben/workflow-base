export type TriggerType = 'cron' | 'rest' | 'interval' | 'workflow';

export interface CronTriggerOptions {
  cron: string;
}

export interface RestTriggerOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path?: string;
}

export interface IntervalTriggerOptions {
  interval: number; // milliseconds
}

export interface WorkflowTriggerOptions {
  // No specific options needed for workflow triggers
}

export type TriggerOptions = 
  | CronTriggerOptions 
  | RestTriggerOptions 
  | IntervalTriggerOptions 
  | WorkflowTriggerOptions;

export interface NodeInput {
  [key: string]: any;
  headers?: { [key: string]: string };
  query?: { [key: string]: any };
  body?: any;
}

export interface NextFunction {
  (nodeName: string, output?: any): Promise<void>;
  SUCCESS: string;
  ERROR: string;
}

export type NodeFunction = (input: NodeInput, next: NextFunction) => Promise<void>;

export interface WorkflowNode {
  name: string;
  trigger: TriggerType;
  triggerOptions?: TriggerOptions;
  function: NodeFunction;
}

export interface WorkflowDefinition {
  name: string;
  nodes: WorkflowNode[];
}

export interface ServeOptions {
  host?: string;
  port?: number;
}

export interface ExecutionContext {
  workflowName: string;
  nodeId: string;
  startTime: Date;
  input: NodeInput;
}

export interface WorkflowResult {
  success: boolean;
  result?: any;
  error?: string;
  executionPath?: string[];
}