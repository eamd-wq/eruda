import each from 'licia/each'
import map from 'licia/map'
import extend from 'licia/extend'
import { t } from '../lib/i18n'
import { classPrefix as c, refreshDataGridTitles } from '../lib/util'

/** Storage 与 Cookie 表格共用两列，标题的英文原文同时作为词条 key。 */
const COLUMNS = [
  { id: 'key', title: 'Key', weight: 30 },
  { id: 'value', title: 'Value', weight: 90 },
]

export function getGridColumns() {
  return map(COLUMNS, (column) =>
    extend({}, column, { title: t(column.title) })
  )
}

/** 语言切换后按原顺序更新表头文本，保留表格自身状态。 */
export function refreshGridTitles(dataGrid) {
  const columns = dataGrid.getOption('columns')

  each(columns, (column, idx) => (column.title = t(COLUMNS[idx].title)))
  refreshDataGridTitles(dataGrid, columns)
}

export function setState($el, state) {
  $el
    .rmClass(c('ok'))
    .rmClass(c('danger'))
    .rmClass(c('warn'))
    .addClass(c(state))
}

export function getState(type, len) {
  if (len === 0) return ''

  let warn = 0
  let danger = 0

  switch (type) {
    case 'cookie':
      warn = 30
      danger = 60
      break
    case 'script':
      warn = 5
      danger = 10
      break
    case 'stylesheet':
      warn = 4
      danger = 8
      break
    case 'image':
      warn = 50
      danger = 100
      break
  }

  if (len >= danger) return 'danger'
  if (len >= warn) return 'warn'

  return 'ok'
}
