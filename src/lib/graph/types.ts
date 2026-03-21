export interface MVReference {
  mvName: string
  usageContext: 'select' | 'where' | 'group_by' | 'join' | 'order_by'
}

export interface DictDependency {
  sourceTable: string
  keyColumns: string[]
}

export interface PolicyDependency {
  table: string
  columns: string[]
}

export interface DependencyGraph {
  // MV dependencies
  mvSources: Map<string, string[]>
  mvTargets: Map<string, string | null>
  columnToMVs: Map<string, MVReference[]>

  // Table internal dependencies
  orderByColumns: Map<string, string[]>
  partitionByColumns: Map<string, string[]>
  ttlExprColumns: Map<string, string[]>
  sampleByColumn: Map<string, string | null>
  projectionColumns: Map<string, string[]>
  indexColumns: Map<string, string[]>
  defaultExprDeps: Map<string, string[]>
  constraintColumns: Map<string, string[]>

  // External dependencies
  dictSources: Map<string, DictDependency>
  columnGrants: Map<string, string[]>
  rowPolicies: Map<string, PolicyDependency>
  distributedTables: Map<string, string>
  bufferTables: Map<string, string>
}

export function emptyDependencyGraph(): DependencyGraph {
  return {
    mvSources: new Map(),
    mvTargets: new Map(),
    columnToMVs: new Map(),
    orderByColumns: new Map(),
    partitionByColumns: new Map(),
    ttlExprColumns: new Map(),
    sampleByColumn: new Map(),
    projectionColumns: new Map(),
    indexColumns: new Map(),
    defaultExprDeps: new Map(),
    constraintColumns: new Map(),
    dictSources: new Map(),
    columnGrants: new Map(),
    rowPolicies: new Map(),
    distributedTables: new Map(),
    bufferTables: new Map(),
  }
}
