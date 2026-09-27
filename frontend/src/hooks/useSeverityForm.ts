import { computed, nextTick, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { Severity, SeveritySource } from '@/types/decay'
import { severityByArea } from '@/utils/severity'

export interface SeverityFormState {
  /** 当前选中的严重程度 */
  severity: Severity
  /** 面积（平方厘米） */
  areaCm2: number
  /** 档位来源 */
  source: SeveritySource
  /** 人工定档依据 */
  reason: string
}

export interface UseSeverityFormOptions {
  /**
   * 面积变化导致自动档位与原档位不一致时，是否需要先问一句「是否保留原档位」。
   * 编辑已有自动档档案时为 true；新建草稿为 false（直接自动落档）。
   */
  askOnAreaChange: () => boolean
}

/**
 * 病害档位表单逻辑（新建病害对话框与档案台编辑对话框共用）：
 * - 面积一改立即按阈值重算；
 * - 编辑已有自动档档案时，改面积跨档先询问是否保留原档位，
 *   选「保留」转人工定档并要求写明依据，此后面积再变也不动；
 * - 人工选成与面积档不一致，一律记为人工定档；
 * - 人工定档可手动恢复为按面积自动落档。
 */
export function useSeverityForm(options: UseSeverityFormOptions) {
  const severity = ref<Severity>('轻度')
  const areaCm2 = ref<number>(10)
  const source = ref<SeveritySource>('auto')
  const reason = ref('')

  const autoSeverity = computed<Severity>(() => severityByArea(areaCm2.value))
  const isManual = computed(() => source.value === 'manual')
  const mismatch = computed(() => severity.value !== autoSeverity.value)
  /** 人工定档必须写明依据 */
  const reasonMissing = computed(() => source.value === 'manual' && reason.value.trim().length === 0)

  /** 表单初始化时暂停监听，避免回填面积触发跨档询问 */
  let armed = false
  let asking = false

  function arm(): void {
    armed = false
    void nextTick(() => {
      armed = true
    })
  }

  function reset(next?: Partial<SeverityFormState>): void {
    armed = false
    areaCm2.value = next?.areaCm2 ?? 10
    severity.value = next?.severity ?? severityByArea(areaCm2.value)
    source.value = next?.source ?? 'auto'
    reason.value = next?.reason ?? ''
    arm()
  }

  /** 恢复为按当前面积自动落档 */
  function followArea(): void {
    source.value = 'auto'
    reason.value = ''
    severity.value = severityByArea(areaCm2.value)
  }

  watch(areaCm2, (next, prev) => {
    if (!armed || asking || next === prev) return
    if (source.value === 'manual') return // 人工定档：面积再变也不动
    const nextSeverity = severityByArea(next)
    severity.value = nextSeverity
    if (!options.askOnAreaChange()) return
    const prevSeverity = severityByArea(prev)
    if (nextSeverity === prevSeverity) return
    asking = true
    ElMessageBox.confirm(
      `面积已从 ${prev} cm² 改为 ${next} cm²，按面积应落「${nextSeverity}」。是否保留师傅现场定的「${prevSeverity}」？`,
      '面积跨档，是否保留原档位',
      {
        confirmButtonText: '保留原档位（记为人工定档）',
        cancelButtonText: '按面积落档',
        distinguishCancelAndClose: true,
        type: 'warning'
      }
    )
      .then(() => {
        // 保留原档位：记成人工定档并写明依据，面积再变也不动
        severity.value = prevSeverity
        source.value = 'manual'
      })
      .catch((action: string) => {
        if (action === 'cancel') {
          // 明确选择按面积落档
          severity.value = nextSeverity
          source.value = 'auto'
          reason.value = ''
        } else {
          // 关闭按钮（close）：放弃本次面积修改，回退面积与档位（asking 期间不会再触发询问）
          areaCm2.value = prev
          severity.value = prevSeverity
        }
      })
      .finally(() => {
        asking = false
      })
  })

  watch(severity, (next) => {
    if (!armed || asking) return
    // 师傅手选且与面积档不一致 → 人工定档；一致时仍保留当前来源（人工可继续填依据）
    if (next !== severityByArea(areaCm2.value)) {
      source.value = 'manual'
    }
  })

  return {
    severity,
    areaCm2,
    source,
    reason,
    autoSeverity,
    isManual,
    mismatch,
    reasonMissing,
    reset,
    arm,
    followArea
  }
}
