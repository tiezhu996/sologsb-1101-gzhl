<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus'
import { Delete, Edit, Plus, Tools } from '@element-plus/icons-vue'
import EmptyPanel from '@/components/common/EmptyPanel.vue'
import FilterBar, { type FilterModel } from '@/components/common/FilterBar.vue'
import SeverityTag from '@/components/common/SeverityTag.vue'
import StatBadge from '@/components/common/StatBadge.vue'
import { useDecayFilter } from '@/hooks/useDecayFilter'
import {
  followArea,
  keepSeverity,
  pickSeverity,
  resetToArea,
  useSeverityGrade,
  type SeverityGradeState
} from '@/hooks/useSeverityGrade'
import { useHallStore } from '@/stores/hallStore'
import { useDecayStore } from '@/stores/decayStore'
import { useRepairStore } from '@/stores/repairStore'
import { DECAY_TYPES, type Decay, type DecayType, type Severity } from '@/types/decay'
import { SEVERITIES } from '@/types/decay'
import { formatArea, SEVERITY_COLOR, severityByArea } from '@/utils/severity'

const router = useRouter()
const hallStore = useHallStore()
const decayStore = useDecayStore()
const repairStore = useRepairStore()

const {
  filter,
  positionOptions,
  typeOptions,
  severityOptions,
  pigmentOptions,
  hallOptions,
  sortedRows,
  severityCounts,
  filteredCount,
  filteredArea,
  hasFilter,
  patch,
  reset
} = useDecayFilter()

const batchSeverity = ref<Severity>('中度')
const batchType = ref<DecayType>('起甲')
const editDialogVisible = ref(false)
const editingDecay = ref<Decay | null>(null)
const editForm = ref<{
  type: DecayType
  areaCm2: number
  causeGuess: string
}>({ type: '起甲', areaCm2: 10, causeGuess: '' })

/** 编辑弹窗的档位编排 */
let editGrade: SeverityGradeState | null = null
/** 改面积确认前的面积，取消时回退 */
let editAreaBeforeChange = 0
const editReasonError = ref('')

const filterModel = computed<FilterModel>(() => ({
  keyword: filter.value.keyword,
  halls: filter.value.halls,
  pos: filter.value.elementPositions,
  types: filter.value.types,
  sev: filter.value.severities,
  pig: filter.value.pigments
}))

const filterSelects = computed(() => [
  { key: 'halls', label: '殿宇', options: hallOptions.value },
  { key: 'pos', label: '部位', options: positionOptions.map((item) => ({ label: item, value: item })) },
  { key: 'types', label: '病害类型', options: typeOptions.map((item) => ({ label: item, value: item })) },
  { key: 'sev', label: '严重程度', options: severityOptions.map((item) => ({ label: item, value: item })) },
  { key: 'pig', label: '主色颜料', options: pigmentOptions.map((item) => ({ label: item, value: item })) }
])

const selectedRows = computed(() =>
  sortedRows.value.filter((row) => decayStore.selectedIds.has(row.decay.id))
)

watch(
  () => sortedRows.value.map((row) => row.decay.id).join(','),
  () => {
    const visible = new Set(sortedRows.value.map((row) => row.decay.id))
    Array.from(decayStore.selectedIds).forEach((id) => {
      if (!visible.has(id)) decayStore.selectedIds.delete(id)
    })
  }
)

const tableRef = ref<TableInstance | null>(null)

function handleFilterChange(value: FilterModel): void {
  patch({
    keyword: value.keyword,
    halls: Array.isArray(value.halls) ? value.halls : [],
    elementPositions: Array.isArray(value.pos) ? value.pos : [],
    types: (Array.isArray(value.types) ? value.types : []) as DecayType[],
    severities: (Array.isArray(value.sev) ? value.sev : []) as Severity[],
    pigments: Array.isArray(value.pig) ? value.pig : []
  })
}

function handleSwitch(value: boolean): void {
  patch({ onlyUnrepaired: value })
}

function handleSelectionChange(rows: Array<{ decay: Decay }>): void {
  decayStore.setSelection(rows.map((row) => row.decay.id))
}

function layerLabel(layerId: string): string {
  const layer = decayStore.layers.find((item) => item.id === layerId)
  if (!layer) return '层位已删除'
  return `第 ${layer.level} 层 · ${layer.patternName} · ${layer.pigment}`
}

function elementLabel(layerId: string): string {
  const layer = decayStore.layers.find((item) => item.id === layerId)
  if (!layer) return '-'
  const element = decayStore.elements.find((item) => item.id === layer.elementId)
  if (!element) return '-'
  return `${element.name}（${element.position}）`
}

function hallLabel(layerId: string): string {
  const layer = decayStore.layers.find((item) => item.id === layerId)
  if (!layer) return '-'
  const element = decayStore.elements.find((item) => item.id === layer.elementId)
  if (!element) return '-'
  return hallStore.hallById(element.hallId)?.name ?? '殿宇已删除'
}

function repairProgress(decayId: string): { done: number; total: number } {
  const steps = repairStore.steps.filter((step) => step.decayId === decayId)
  return { done: steps.filter((step) => step.state === '已完成').length, total: steps.length }
}

async function applyBatchSeverity(): Promise<void> {
  const ids = Array.from(decayStore.selectedIds)
  if (ids.length === 0) {
    ElMessage.warning('请先勾选需要修改的病害记录')
    return
  }
  // 找出目标档与面积档不一致的记录：这些必须写明人工定档依据
  const selectedRows = decayStore.decays.filter((decay) => ids.includes(decay.id))
  const needManual = selectedRows.some(
    (decay) => severityByArea(decay.areaCm2) !== batchSeverity.value
  )
  let reason = ''
  if (needManual) {
    const { value } = await ElMessageBox.prompt(
      `有记录的面积档不是「${batchSeverity.value}」，改为该档将记为人工定档，请写明现场依据`,
      '人工定档依据',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '人工定档必须写明依据'
      }
    ).catch(() => ({ value: '' }))
    if (!value?.trim()) return
    reason = value.trim()
  }
  await decayStore.bulkSetSeverity(ids, batchSeverity.value, reason)
  ElMessage.success(`已将 ${ids.length} 条病害的严重程度改为「${batchSeverity.value}」`)
}

async function applyBatchType(): Promise<void> {
  const ids = Array.from(decayStore.selectedIds)
  if (ids.length === 0) {
    ElMessage.warning('请先勾选需要修改的病害记录')
    return
  }
  await decayStore.bulkSetType(ids, batchType.value)
  ElMessage.success(`已将 ${ids.length} 条病害的类型改为「${batchType.value}」`)
}

function openEdit(row: { decay: Decay }): void {
  editingDecay.value = row.decay
  editForm.value = {
    type: row.decay.type,
    areaCm2: row.decay.areaCm2,
    causeGuess: row.decay.causeGuess
  }
  editReasonError.value = ''
  editAreaBeforeChange = row.decay.areaCm2
  editGrade = useSeverityGrade({
    areaCm2: computed(() => editForm.value.areaCm2),
    initialSeverity: row.decay.severity,
    initialSource: row.decay.severitySource,
    initialReason: row.decay.severityReason
  })
  editDialogVisible.value = true
}

/** 编辑弹窗里师傅改选档位：与面积档一致回自动，否则转人工 */
function handleEditSeverityPick(next: Severity): void {
  if (!editGrade) return
  pickSeverity(editGrade, next)
  if (editGrade.source.value === 'auto') editReasonError.value = ''
}

/**
 * 编辑时改面积：
 * 只要面积档与当前档位不一致，先问师傅要不要保留原档位
 * （无论原档位是面积自动落的还是人工定的）。
 */
async function handleEditAreaChange(value: number | undefined): Promise<void> {
  if (!editGrade) return
  const nextArea = typeof value === 'number' && Number.isFinite(value) ? value : editAreaBeforeChange
  const suggested = severityByArea(nextArea)
  if (suggested !== editGrade.severity.value) {
    const keep = await ElMessageBox.confirm(
      `面积改为 ${formatArea(nextArea)} 后，按面积应落「${suggested}」。是否保留原档位「${editGrade.severity.value}」？`,
      '面积档位发生变化',
      {
        confirmButtonText: '保留原档位（记为人工定档）',
        cancelButtonText: '按面积重算',
        distinguishCancelAndClose: true,
        type: 'warning'
      }
    )
      .then(() => true)
      .catch((action: string) => action)
    // 关闭确认框：面积回退，什么都不改
    if (keep === 'close') {
      editForm.value.areaCm2 = editAreaBeforeChange
      return
    }
    if (keep === true) {
      let basis = editGrade.reason.value
      if (!basis.trim()) {
        const { value } = await ElMessageBox.prompt('请写明保留该档位的现场依据', '人工定档依据', {
          confirmButtonText: '确定',
          cancelButtonText: '按面积重算',
          inputPattern: /\S+/,
          inputErrorMessage: '人工定档必须写明依据'
        }).catch(() => ({ value: '' }))
        if (!value?.trim()) {
          editForm.value.areaCm2 = nextArea
          followArea(editGrade)
          editAreaBeforeChange = nextArea
          return
        }
        basis = value
      }
      editForm.value.areaCm2 = nextArea
      keepSeverity(editGrade, basis)
    } else {
      editForm.value.areaCm2 = nextArea
      followArea(editGrade)
    }
  } else {
    editForm.value.areaCm2 = nextArea
    // 面积档未变：原人工定档保持不动，自动档跟随
    if (editGrade.source.value === 'auto') followArea(editGrade)
  }
  editAreaBeforeChange = editForm.value.areaCm2
  editReasonError.value = ''
}

/** 放弃人工定档，回到面积档 */
function resetEditGradeToArea(): void {
  if (!editGrade) return
  resetToArea(editGrade)
  editReasonError.value = ''
}

async function submitEdit(): Promise<void> {
  if (!editingDecay.value || !editGrade) return
  if (editGrade.source.value === 'manual' && !editGrade.reason.value.trim()) {
    editReasonError.value = '人工定档必须写明依据'
    return
  }
  await decayStore.updateDecay(editingDecay.value.id, {
    type: editForm.value.type,
    severity: editGrade.severity.value,
    severitySource: editGrade.source.value,
    severityReason: editGrade.source.value === 'manual' ? editGrade.reason.value.trim() : null,
    areaCm2: editForm.value.areaCm2,
    causeGuess: editForm.value.causeGuess.trim() || '待现场复核'
  })
  editDialogVisible.value = false
  ElMessage.success('病害记录已更新')
}

async function removeRow(row: { decay: Decay }): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    `删除「${row.decay.type}」病害记录及其关联修复工序？`,
    '删除确认',
    { type: 'warning' }
  ).catch(() => false)
  if (!confirmed) return
  await decayStore.removeDecay(row.decay.id)
  ElMessage.success('病害记录已删除')
}

async function toggleRepaired(row: { decay: Decay }): Promise<void> {
  await decayStore.setRepaired(row.decay.id, !row.decay.repaired)
  ElMessage.success(row.decay.repaired ? '已标记为未修复' : '已标记为已修复')
}

async function bulkMarkRepaired(repaired: boolean): Promise<void> {
  const ids = Array.from(decayStore.selectedIds)
  if (ids.length === 0) {
    ElMessage.warning('请先勾选需要处理的病害记录')
    return
  }
  for (const id of ids) {
    await decayStore.setRepaired(id, repaired)
  }
  ElMessage.success(`已批量标记 ${ids.length} 条为${repaired ? '已修复' : '未修复'}`)
}

function goRepair(row: { decay: Decay }): void {
  repairStore.setActiveDecay(row.decay.id)
  void router.push('/repair')
}

function goElements(row: { decay: Decay }): void {
  const layer = decayStore.layers.find((item) => item.id === row.decay.layerId)
  const element = layer ? decayStore.elements.find((item) => item.id === layer.elementId) : undefined
  if (!element) {
    ElMessage.warning('层位或构件已被删除')
    return
  }
  hallStore.setCurrentHall(element.hallId)
  void router.push(`/halls/${element.hallId}/elements`)
}

function rowKey(row: { decay: Decay }): string {
  return row.decay.id
}

const typeOptionsForEdit = DECAY_TYPES
const severityOptionsForEdit = SEVERITIES
const severityPalette = SEVERITY_COLOR
</script>

<template>
  <div>
    <div class="page-title">
      <div>
        <h2>病害档案台</h2>
        <p>
          共 {{ decayStore.rows.length }} 条病害，当前筛选命中 {{ filteredCount }} 条，涉及面积
          {{ formatArea(filteredArea) }}
        </p>
      </div>
      <el-button :icon="Tools" @click="router.push('/repair')">前往修复工序</el-button>
    </div>

    <div class="stat-row">
      <StatBadge
        label="重度病害"
        :value="severityCounts.重度"
        suffix="条"
        icon="CircleCloseFilled"
        tone="danger"
        :percent="decayStore.rows.length ? Math.round((severityCounts.重度 / decayStore.rows.length) * 100) : 0"
      />
      <StatBadge
        label="中度病害"
        :value="severityCounts.中度"
        suffix="条"
        icon="WarningFilled"
        tone="warning"
        :percent="decayStore.rows.length ? Math.round((severityCounts.中度 / decayStore.rows.length) * 100) : 0"
      />
      <StatBadge
        label="轻度病害"
        :value="severityCounts.轻度"
        suffix="条"
        icon="SuccessFilled"
        tone="success"
        :percent="decayStore.rows.length ? Math.round((severityCounts.轻度 / decayStore.rows.length) * 100) : 0"
      />
      <StatBadge label="未修复" :value="decayStore.unrepairedCount" suffix="条" icon="Histogram" tone="info" />
      <StatBadge
        label="修复完成率"
        :value="decayStore.repairedPercent"
        suffix="%"
        icon="TrendCharts"
        tone="primary"
        show-percent
        :percent="decayStore.repairedPercent"
      />
      <StatBadge label="病害总面积" :value="formatArea(decayStore.totalArea)" icon="PieChart" tone="default" />
    </div>

    <FilterBar
      :model-value="filterModel"
      :selects="filterSelects"
      has-switch
      switch-label="仅未修复"
      :switch-value="filter.onlyUnrepaired"      keyword-placeholder="按类型 / 颜料 / 成因 / 构件 搜索"
      @change="handleFilterChange"
      @update:switch-value="handleSwitch"
      @reset="reset"
    >
      <template #actions>
        <el-tag v-if="selectedRows.length > 0" type="primary" effect="plain" round>
          已选 {{ selectedRows.length }} 条
        </el-tag>
      </template>
    </FilterBar>

    <div class="section-card batch-bar">
      <span class="batch-bar__label">批量改严重程度</span>
      <el-select v-model="batchSeverity" class="batch-bar__select">
        <el-option v-for="item in severityOptionsForEdit" :key="item" :label="item" :value="item" />
      </el-select>
      <el-button type="primary" plain size="small" @click="applyBatchSeverity">应用</el-button>

      <span class="batch-bar__label">批量改类型</span>
      <el-select v-model="batchType" class="batch-bar__select">
        <el-option v-for="item in typeOptionsForEdit" :key="item" :label="item" :value="item" />
      </el-select>
      <el-button type="primary" plain size="small" @click="applyBatchType">应用</el-button>

      <el-button size="small" @click="bulkMarkRepaired(true)">标记已修复</el-button>
      <el-button size="small" @click="bulkMarkRepaired(false)">标记未修复</el-button>
    </div>

    <div class="section-card">
      <div class="section-card__head">
        <h3>病害清单</h3>
        <span class="muted">按严重程度与面积排序</span>
      </div>

      <el-table
        v-if="sortedRows.length > 0"
        ref="tableRef"
        :data="sortedRows"
        :row-key="rowKey"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="46" reserve-selection />
        <el-table-column label="病害类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.decay.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="严重程度" width="210">
          <template #default="{ row }">
            <div class="severity-cell">
              <SeverityTag :severity="row.decay.severity" :area-cm2="row.decay.areaCm2" size="small" />
              <el-tooltip
                v-if="row.decay.severitySource === 'manual'"
                :content="`人工定档依据：${row.decay.severityReason ?? '未写明依据'}`"
                placement="top"
              >
                <el-tag size="small" type="warning" effect="dark" class="manual-flag">人工定档</el-tag>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="殿宇" width="150">
          <template #default="{ row }">{{ hallLabel(row.decay.layerId) }}</template>
        </el-table-column>
        <el-table-column label="构件（部位）" min-width="190">
          <template #default="{ row }">{{ elementLabel(row.decay.layerId) }}</template>
        </el-table-column>
        <el-table-column label="彩画层位" min-width="180">
          <template #default="{ row }">{{ layerLabel(row.decay.layerId) }}</template>
        </el-table-column>
        <el-table-column label="成因初判" prop="decay.causeGuess" min-width="200" show-overflow-tooltip />
        <el-table-column label="修复" width="150">
          <template #default="{ row }">
            <el-tag size="small" :type="row.decay.repaired ? 'success' : 'info'" effect="plain">
              {{ row.decay.repaired ? '已修复' : '未修复' }}
            </el-tag>
            <span class="mono muted repair-progress">
              {{ repairProgress(row.decay.id).done }}/{{ repairProgress(row.decay.id).total }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text :icon="Tools" @click="goRepair(row)">排工序</el-button>
            <el-button size="small" text type="primary" @click="goElements(row)">看层位</el-button>
            <el-button size="small" text @click="toggleRepaired(row)">
              {{ row.decay.repaired ? '撤销修复' : '标记修复' }}
            </el-button>
            <el-button size="small" text type="danger" :icon="Delete" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <EmptyPanel
        v-else
        :title="hasFilter ? '没有符合筛选条件的病害' : '尚未记录病害'"
        :description="
          hasFilter
            ? '可放宽筛选条件，或在构件与层位页为具体层位挂接病害记录。'
            : '先在殿宇总览建立殿宇、在构件与层位页圈定彩画层位，再为本页挂接病害记录。'
        "
        :action-text="hasFilter ? '' : '前往殿宇总览'"
        :secondary-text="hasFilter ? '重置筛选条件' : ''"
        @action="router.push('/halls')"
        @secondary="reset"
      >
        <template #actions>
          <el-button v-if="hasFilter" size="small" @click="reset">重置筛选</el-button>
        </template>
      </EmptyPanel>
    </div>

    <el-dialog v-model="editDialogVisible" title="编辑病害记录" width="540px">
      <el-form :model="editForm" label-width="110px">
        <el-form-item label="病害类型">
          <el-select v-model="editForm.type" class="full-width">
            <el-option v-for="item in typeOptionsForEdit" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="严重程度">
          <el-radio-group
            :model-value="editGrade?.severity.value"
            @update:model-value="handleEditSeverityPick"
          >
            <el-radio v-for="item in severityOptionsForEdit" :key="item" :value="item">
              <span :style="{ color: severityPalette[item] }">{{ item }}</span>
            </el-radio>
          </el-radio-group>
          <p v-if="editGrade && editGrade.source.value === 'auto'" class="grade-hint">
            当前按面积自动落档为「{{ editGrade.areaSeverity.value }}」
          </p>
        </el-form-item>
        <el-form-item v-if="editGrade && editGrade.source.value === 'manual'" label=" ">
          <el-alert type="warning" :closable="false" show-icon class="full-width">
            <div class="grade-alert">
              <span>
                人工定档：师傅现场定为「{{ editGrade.severity.value }}」，面积档为
                「{{ editGrade.areaSeverity.value }}」，面积再变也不覆盖此档。
              </span>
              <el-button size="small" text type="primary" @click="resetEditGradeToArea">
                恢复按面积落档
              </el-button>
            </div>
          </el-alert>
        </el-form-item>
        <el-form-item
          v-if="editGrade && editGrade.needReason.value"
          label="定档依据"
          :error="editReasonError"
          required
        >
          <el-input
            v-model="editGrade.reason.value"
            placeholder="写明师傅现场判定依据"
            @input="editReasonError = ''"
          />
        </el-form-item>
        <el-form-item label="面积（cm²）">
          <el-input-number
            v-model="editForm.areaCm2"
            :min="0.1"
            :max="1000000"
            :step="10"
            :precision="1"
            @change="handleEditAreaChange"
          />
          <span class="grade-hint">＜200 轻度，200～800 中度，＞800 重度；改面积会先确认是否保留原档</span>
        </el-form-item>
        <el-form-item label="成因初判">
          <el-input v-model="editForm.causeGuess" type="textarea" :rows="3" maxlength="120" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="Plus" @click="submitEdit">保存修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.batch-bar__label {
  font-size: 13px;
  color: #6b6257;
}

.batch-bar__select {
  width: 140px;
}

.full-width {
  width: 100%;
}

.repair-progress {
  margin-left: 6px;
  font-size: 12px;
}

.severity-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.manual-flag {
  cursor: help;
}

.grade-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a7f72;
}

.grade-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
