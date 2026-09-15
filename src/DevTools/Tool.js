import Class from 'licia/Class'

export default Class({
  init($el) {
    this._$el = $el
  },
  show() {
    this._$el.show()

    return this
  },
  hide() {
    this._$el.hide()

    return this
  },
  /** 切换语言后重绘面板自身的静态文案，没有静态文案的面板无需实现。 */
  refreshLang() {},
  destroy() {
    this._$el.remove()
  },
})
