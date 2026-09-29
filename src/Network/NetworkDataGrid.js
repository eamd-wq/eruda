import LunaDataGrid from 'luna-data-grid'
import isOdd from 'licia/isOdd'
import throttle from 'licia/throttle'
import { pxToNum } from '../lib/util'

export const NETWORK_ROW_HEIGHT = 32

/**
 * LunaDataGrid currently fixes its virtual row height at 20px. Network needs a
 * larger touch target, so this adapter keeps the rendered row height and both
 * virtual-scroll calculations on the same value.
 */
export default class NetworkDataGrid extends LunaDataGrid {
  constructor(container, options) {
    super(container, options)

    this.renderData = throttle(
      ({ topTolerance = 500, bottomTolerance = 500 } = {}) => {
        if (this.sortId && !this.sorted) {
          this.sortNodes(this.sortId, this.isAscending)
        }

        const { dataContainer, displayNodes, tableBody } = this
        const { scrollTop, clientHeight } = dataContainer
        const top = scrollTop - topTolerance
        const bottom = scrollTop + clientHeight + bottomTolerance
        let topSpaceHeight = 0
        let currentHeight = 0
        const renderNodes = []

        for (let i = 0, len = displayNodes.length; i < len; i++) {
          const node = displayNodes[i]
          if (currentHeight <= bottom) {
            if (currentHeight + NETWORK_ROW_HEIGHT > top) {
              if (renderNodes.length === 0 && isOdd(i)) {
                renderNodes.push(displayNodes[i - 1])
                topSpaceHeight -= NETWORK_ROW_HEIGHT
              }
              renderNodes.push(node)
            } else if (currentHeight < top) {
              topSpaceHeight += NETWORK_ROW_HEIGHT
            }
          }
          currentHeight += NETWORK_ROW_HEIGHT
        }

        this.updateSpace(currentHeight)
        this.updateTopSpace(topSpaceHeight)

        const fragment = document.createDocumentFragment()
        for (let i = 0, len = renderNodes.length; i < len; i++) {
          fragment.appendChild(renderNodes[i].container)
        }
        fragment.appendChild(this.fillerRow)
        tableBody.textContent = ''
        tableBody.appendChild(fragment)
      },
      16,
    )

    /** Replace the initial render created with LunaDataGrid's default height. */
    this.renderData()
    this.updateHeight()
  }
  /**
   * Luna 的 fit 只判断容器是否隐藏，父容器尚未布局（高度为 0）时会写入 0 或负值，
   * 负的 maxHeight 会让高度计算失效并把列表交回内容撑开，因此先确认父容器已布局。
   */
  fit() {
    const parent = this.$container.parent().get(0)
    if (!parent || parent.clientHeight <= 0) return

    /** Luna 会把 minHeight 一起设成面板高度，列表不足一屏时会被撑成一大片空白。 */
    const minHeight = this.options.minHeight
    super.fit()
    if (this.options.minHeight !== minHeight) {
      this.setOption('minHeight', minHeight)
    }
  }
  updateHeight() {
    const { $fillerRow, $container } = this

    /**
     * fit 生效前 maxHeight 仍是 Luna 的初始值 Infinity，此时按行数计算高度会让列表
     * 随请求数线性变高；补一次测量，仍不可测量则保持现有高度。
     */
    if (this.options.maxHeight === Infinity) {
      this.fit()
      if (this.options.maxHeight === Infinity) return
    }

    let { maxHeight, minHeight } = this.options
    const headerHeight = this.$headerRow.offset().height
    const borderTopWidth = pxToNum($container.css('border-top-width'))
    const borderBottomWidth = pxToNum($container.css('border-bottom-width'))
    const minusHeight = headerHeight + borderTopWidth + borderBottomWidth

    minHeight = Math.max(0, minHeight - minusHeight)
    maxHeight -= minusHeight

    let height = NETWORK_ROW_HEIGHT * this.displayNodes.length
    if (height > minHeight) {
      $fillerRow.hide()
    } else {
      $fillerRow.show()
    }

    if (height < minHeight) {
      height = minHeight
    } else if (height >= maxHeight) {
      height = maxHeight
    }
    this.$dataContainer.css({ height })
  }
}
