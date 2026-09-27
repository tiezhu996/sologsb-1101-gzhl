import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Severity, SeveritySource } from '@/types/decay'
import { severityByArea } from '@/utils/severity'

export interface SeverityGradeState {
  /** 当前选定档位 */
  severity: Ref<Severity>
  /** 当前档位来源 */
  source: Ref<SeveritySource>
  /** 人工定档依据 */
  reason: Ref<string>
  /** 当前面积对应的面积档 */
  areaSeverity: ComputedRef<Severity>
  /** 所选档位是否与面积档一致 */
  matchesArea: ComputedRef<boolean>
  /** 是否需要展示定档依据输入（人工定档时） */
  needReason: ComputedRef<boolean>
}

export interface UseSeverityGradeOptions {
  /** 面积引用：面积一变，面积档随之重算 */
  areaCm2: Ref<number>
  /** 初始档位（编辑旧档案时传入当前值） */
  initialSeverity?: Severity
  /** 初始来源（编辑旧档案时传入当前值） */
  initialSource?: SeveritySource
  /** 初始定档依据 */
  initialReason?: string | null
}

/**
 * 病害档位编排：面积自动落档 + 师傅人工定档两条路径。
 *
 * 面积变化只负责重算「面积档」，是否顶掉当前档位由调用方决定
 * （新增时直接跟随，编辑时先问师傅要不要保留）。人工定档一旦确立，
 * 面积再变也不会被覆盖。
 */
export function useSeverityGrade(options: UseSeverityGradeOptions): SeverityGradeState {
  const { areaCm2 } = options
  const severity = ref<Severity>(options.initialSeverity ?? severityByArea(areaCm2.value))
  const source = ref<SeveritySource>(options.initialSource ?? 'auto')
  const reason = ref<string>(options.initialReason ?? '')

  const areaSeverity = computed(() => severityByArea(areaCm2.value))
  const matchesArea = computed(() => severity.value === areaSeverity.value)
  const needReason = computed(() => source.value === 'manual')

  return {
    severity,
    source,
    reason,
    areaSeverity,
    matchesArea,
    needReason
  }
}

/**
 * 师傅在单选框里主动选档：
 * 与面积档一致视为恢复自动落档，不一致记为人工定档并要求写明依据。
 */
export function pickSeverity(state: SeverityGradeState, next: Severity): void {
  state.severity.value = next
  if (next === state.areaSeverity.value) {
    state.source.value = 'auto'
    state.reason.value = ''
  } else {
    state.source.value = 'manual'
  }
}

/** 面积变化且师傅不保留旧档：跟随面积重新落档 */
export function followArea(state: SeverityGradeState): void {
  state.severity.value = state.areaSeverity.value
  state.source.value = 'auto'
  state.reason.value = ''
}

/**
 * 面积变化但师傅要求保留原档位：记为人工定档，需写明依据。
 * 返回保留后的档位。
 */
export function keepSeverity(state: SeverityGradeState, keepReason: string): Severity {
  state.source.value = 'manual'
  state.reason.value = keepReason.trim()
  return state.severity.value
}

/** 放弃人工定档，回到按面积落档 */
export function resetToArea(state: SeverityGradeState): void {
  followArea(state)
}
