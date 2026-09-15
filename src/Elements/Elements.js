import Tool from '../DevTools/Tool'
import $ from 'licia/$'
import isEl from 'licia/isEl'
import nextTick from 'licia/nextTick'
import Emitter from 'licia/Emitter'
import map from 'licia/map'
import MediaQuery from 'licia/MediaQuery'
import isEmpty from 'licia/isEmpty'
import toNum from 'licia/toNum'
import copy from 'licia/copy'
import isMobile from 'licia/isMobile'
import isShadowRoot from 'licia/isShadowRoot'
import createDomViewer from './DomViewer'
import {
  isErudaEl,
  classPrefix as c,
  isChobitsuEl,
  showCopySuccess,
} from '../lib/util'
import evalCss from '../lib/evalCss'
import Detail from './Detail'
import chobitsu from '../lib/chobitsu'
import emitter from '../lib/emitter'
import { formatNodeName } from './util'

export default class Elements extends Tool {
  constructor() {
    super()

    this._style = evalCss(require('./Elements.scss'))

    this.name = 'elements'
    this._selectElement = false
    this._observeElement = true
    this._history = []
    this._domViewer = null
    this._isShow = false
    this._destroyed = false

    Emitter.mixin(this)
  }
  init($el, container) {
    super.init($el)

    this._container = container

    this._initTpl()
    this._htmlEl = document.documentElement
    this._detail = new Detail(this._$detail, container)
    this.config = this._detail.config
    this._splitMediaQuery = new MediaQuery('screen and (min-width: 680px)')
    this._splitMode = this._splitMediaQuery.isMatch()
    this._bindEvent()
    chobitsu.domain('Overlay').enable()

    nextTick(() => this._updateHistory())
  }
  show() {
    super.show()
    if (this._container._isShow) this._startDomViewer()
  }
  hide() {
    super.hide()
    this._stopDomViewer()
  }
  select(node) {
    if (!node) return this
    this._setNode(node)
    if (this._domViewer) this._selectInDomViewer(node)
    this.emit('change', node)
    return this
  }
  destroy() {
    this._destroyed = true
    this._container.off('show', this._handleContainerShow)
    this._container.off('hide', this._handleContainerHide)
    this._stopDomViewer()
    super.destroy()

    emitter.off(emitter.SCALE, this._updateScale)
    evalCss.remove(this._style)
    this._detail.destroy()
    chobitsu
      .domain('Overlay')
      .off('inspectNodeRequested', this._inspectNodeRequested)
    /** Overlay.disable only releases highlights; explicitly release picker clicks. */
    chobitsu.domain('Overlay').setInspectMode({ mode: 'none' })
    this._selectElement = false
    chobitsu.domain('Overlay').disable()
    this._splitMediaQuery._mql.removeListener(this._splitMediaQuery._listener)
    this._splitMediaQuery.removeAllListeners()
  }
  /** Build the live tree only while both the tool and its container are visible. */
  _startDomViewer() {
    if (this._domViewer) return

    this._isShow = true
    this._domViewer = createDomViewer(this._$domViewer.get(0), {
      node: this._htmlEl,
      ignore: (node) => isErudaEl(node) || isChobitsuEl(node),
    })
    this._domViewer.on('select', this._setNode).on('deselect', this._back)
    this._domViewer.expand()
    const node = isNodeInDocument(this._curNode)
      ? this._curNode
      : this._existingParent()
    /** A surviving selection may have moved while hidden; refresh its ancestor path. */
    this._setNode(node, true)
    this.select(node)
  }
  /** Hidden tools must not process host-page mutations or retain live observers. */
  _stopDomViewer() {
    this._isShow = false
    this._detail.hide()
    const viewer = this._domViewer
    if (!viewer) return

    this._domViewer = null
    /** Teardown emits deselect for selected descendants; it is not a page deletion. */
    viewer.off('select', this._setNode).off('deselect', this._back)
    viewer.destroy()
  }
  _handleContainerShow = () => {
    if (this.active) this._startDomViewer()
  }
  _handleContainerHide = () => {
    /** Keep Overlay inspect mode alive while the picker temporarily hides Eruda. */
    this._stopDomViewer()
  }
  /** Luna's root select uses parentElement, so restore shadow/text nodes explicitly. */
  _selectInDomViewer(node) {
    const path = []
    let current = node
    while (current && current !== this._htmlEl) {
      path.unshift(current)
      current = parentNodeOrHost(current)
    }
    if (current !== this._htmlEl) return

    let viewer = this._domViewer
    for (const child of path) {
      viewer.expand()
      const index = viewer.childNodes.indexOf(child)
      if (index === -1) return
      viewer = viewer.childNodeDomViewers[index]
    }
    viewer.select()
  }
  /** A detached subtree may have no surviving parent; never spin on an empty queue. */
  _existingParent() {
    for (const parent of this._curParentQueue || []) {
      if (isNodeInDocument(parent)) return parent
    }
    return document.body || this._htmlEl
  }
  _updateButtons() {
    const $control = this._$control
    const $showDetail = $control.find(c('.show-detail'))
    const $copyNode = $control.find(c('.copy-node'))
    const $deleteNode = $control.find(c('.delete-node'))
    const iconDisabled = c('icon-disabled')

    $showDetail.addClass(iconDisabled)
    $copyNode.addClass(iconDisabled)
    $deleteNode.addClass(iconDisabled)

    const node = this._curNode

    if (!node || isShadowRoot(node)) {
      return
    }

    if (node !== document.documentElement && node !== document.body) {
      $deleteNode.rmClass(iconDisabled)
    }
    $copyNode.rmClass(iconDisabled)

    if (node.nodeType === Node.ELEMENT_NODE) {
      $showDetail.rmClass(iconDisabled)
    }
  }
  _showDetail = () => {
    if (!this._isShow || !this._curNode) {
      return
    }
    let element = this._curNode
    while (element && element.nodeType !== Node.ELEMENT_NODE) {
      element = parentNodeOrHost(element)
    }
    if (element) this._detail.show(element)
  }
  /** 面板自身的文案都在详情里，可见时重绘一次即可。 */
  refreshLang() {
    this._showDetail()
  }
  _initTpl() {
    const $el = this._$el

    $el.html(
      c(`<div class="elements">
        <div class="control">
          <span class="icon icon-select select"></span>
          <span class="icon icon-eye show-detail"></span>
          <span class="icon icon-copy copy-node"></span>
          <span class="icon icon-delete delete-node"></span>
        </div>
        <div class="dom-viewer-container">
          <div class="dom-viewer"></div>
        </div>
        <div class="crumbs"></div>
      </div>
      <div class="detail"></div>`)
    )

    this._$detail = $el.find(c('.detail'))
    this._$domViewer = $el.find(c('.dom-viewer'))
    this._$control = $el.find(c('.control'))
    this._$crumbs = $el.find(c('.crumbs'))
  }
  _renderCrumbs() {
    const crumbs = getCrumbs(this._curNode)
    let html = ''
    if (!isEmpty(crumbs)) {
      html = map(crumbs, ({ text, idx }) => {
        return `<li class="${c('crumb')}" data-idx="${idx}">${text}</div></li>`
      }).join('')
    }
    this._$crumbs.html(html)
  }
  _back = () => {
    if (this._curNode === this._htmlEl) return
    this.select(this._existingParent())
  }
  _bindEvent() {
    const self = this

    this._$el.on('click', c('.crumb'), function () {
      let idx = toNum($(this).data('idx'))
      let node = self._curNode

      while (idx-- && node.parentElement) {
        node = node.parentElement
      }

      if (isElExist(node)) {
        self.select(node)
      }
    })

    this._$control
      .on('click', c('.select'), this._toggleSelect)
      .on('click', c('.show-detail'), this._showDetail)
      .on('click', c('.copy-node'), this._copyNode)
      .on('click', c('.delete-node'), this._deleteNode)

    this._container.on('show', this._handleContainerShow)
    this._container.on('hide', this._handleContainerHide)

    chobitsu
      .domain('Overlay')
      .on('inspectNodeRequested', this._inspectNodeRequested)

    this._splitMediaQuery.on('match', () => {
      this._splitMode = true
      this._showDetail()
    })
    this._splitMediaQuery.on('unmatch', () => {
      this._splitMode = false
      this._detail.hide()
    })

    emitter.on(emitter.SCALE, this._updateScale)
  }
  _updateScale = (scale) => {
    this._splitMediaQuery.setQuery(`screen and (min-width: ${680 * scale}px)`)
  }
  _deleteNode = () => {
    const node = this._curNode

    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
  }
  _copyNode = () => {
    const node = this._curNode

    if (node.nodeType === Node.ELEMENT_NODE) {
      copy(node.outerHTML)
    } else {
      copy(node.nodeValue)
    }

    showCopySuccess(this._$control.find(c('.copy-node')).get(0))
  }
  _toggleSelect = () => {
    this._$el.find(c('.select')).toggleClass(c('active'))
    this._selectElement = !this._selectElement

    if (this._selectElement) {
      chobitsu.domain('Overlay').setInspectMode({
        mode: 'searchForNode',
        highlightConfig: {
          showInfo: !isMobile(),
          showRulers: false,
          showAccessibilityInfo: !isMobile(),
          showExtensionLines: false,
          contrastAlgorithm: 'aa',
          contentColor: 'rgba(111, 168, 220, .66)',
          paddingColor: 'rgba(147, 196, 125, .55)',
          borderColor: 'rgba(255, 229, 153, .66)',
          marginColor: 'rgba(246, 178, 107, .66)',
        },
      })
      this._container.hide()
    } else {
      chobitsu.domain('Overlay').setInspectMode({
        mode: 'none',
      })
      chobitsu.domain('Overlay').hideHighlight()
    }
  }
  _inspectNodeRequested = ({ backendNodeId }) => {
    this._container.show()
    this._toggleSelect()
    try {
      const { node } = chobitsu.domain('DOM').getNode({ nodeId: backendNodeId })
      this.select(node)
    } catch {
      // No op
    }
  }
  _setNode = (node, refresh = false) => {
    const changed = node !== this._curNode
    if (!changed && !refresh) return

    this._curNode = node
    this._renderCrumbs()

    const parentQueue = []

    let parent = parentNodeOrHost(node)
    while (parent && parent !== document) {
      parentQueue.push(parent)
      parent = parentNodeOrHost(parent)
    }
    this._curParentQueue = parentQueue

    if (this._splitMode) {
      this._showDetail()
    }
    this._updateButtons()
    if (changed) this._updateHistory()
  }
  _updateHistory() {
    if (this._destroyed) return
    const console = this._container.get('console')
    if (!console) return

    const history = this._history
    history.unshift(this._curNode)
    if (history.length > 5) history.pop()
    for (let i = 0; i < 5; i++) {
      console.setGlobal(`$${i}`, history[i])
    }
  }
}

const isElExist = (val) => isEl(val) && val.parentNode

const parentNodeOrHost = (node) =>
  node.parentNode || (isShadowRoot(node) ? node.host : null)

/** Include shadow-tree ancestors when checking whether a saved selection survives. */
function isNodeInDocument(node) {
  while (node) {
    if (node === document) return true
    node = parentNodeOrHost(node)
  }
  return false
}

function getCrumbs(el) {
  const ret = []
  let i = 0

  while (el) {
    ret.push({
      text: formatNodeName(el, { noAttr: true }),
      idx: i++,
    })

    if (isShadowRoot(el)) {
      el = el.host
    }
    if (!el.parentElement && isShadowRoot(el.parentNode)) {
      el = el.parentNode
    } else {
      el = el.parentElement
    }
  }

  return ret.reverse()
}
