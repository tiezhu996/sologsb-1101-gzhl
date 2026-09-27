/** 病害记录：某彩画层位上的一处病害现状 */
export type DecayType = '起甲' | '剥落' | '空鼓' | '粉化' | '龟裂'
export type Severity = '轻度' | '中度' | '重度'
/** 档位来源：auto 按面积自动落档；manual 师傅现场人工定档，面积再变也不顶掉 */
export type SeveritySource = 'auto' | 'manual'

export interface Decay {
  id: string
  layerId: string
  type: DecayType
  severity: Severity
  /** 档位来源：面积自动落档 / 现场人工定档 */
  severitySource: SeveritySource
  /** 人工定档的现场依据；自动落档时为 null */
  severityReason: string | null
  /** 病害面积（平方厘米） */
  areaCm2: number
  /** 病害成因初判 */
  causeGuess: string
  /** 由修复工序完成后回写 */
  repaired: boolean
  repairedAt: number | null
  createdAt: number
  updatedAt: number
}

export const DECAY_TYPES: DecayType[] = ['起甲', '剥落', '空鼓', '粉化', '龟裂']
export const SEVERITIES: Severity[] = ['轻度', '中度', '重度']

/** 病害档案台的组合筛选条件 */
export interface DecayFilterState {
  keyword: string
  halls: string[]
  elementPositions: string[]
  types: DecayType[]
  severities: Severity[]
  pigments: string[]
  onlyUnrepaired: boolean
}

export function createEmptyDecayFilter(): DecayFilterState {
  return {
    keyword: '',
    halls: [],
    elementPositions: [],
    types: [],
    severities: [],
    pigments: [],
    onlyUnrepaired: false
  }
}
