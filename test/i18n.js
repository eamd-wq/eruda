describe('i18n', function () {
  let devTools = eruda.get()
  let originalLang

  function $tabTitle(name) {
    return $('.eruda-tab .luna-tab-item[data-id="' + name + '"] .luna-tab-title')
  }

  /** 设置分区标题由 appendTitle 渲染，顺序会随面板结构变化，因此只校验内容。 */
  function settingTitles() {
    return $('.eruda-settings .luna-setting-item-title')
      .map(function () {
        return $(this).text()
      })
      .get()
  }

  function selectOptionTexts(index) {
    return $('.eruda-settings select')
      .eq(index)
      .find('option')
      .map(function () {
        return $(this).text()
      })
      .get()
  }

  /** 语言下拉由 luna-setting 直接监听原生 change 事件。 */
  function selectLang(lang) {
    const select = $('.eruda-settings select').get(0)

    select.value = lang
    select.dispatchEvent(new Event('change'))
  }

  beforeEach(function () {
    /** 设置用例会清空面板，这里按已注册的分区整体重建。 */
    eruda.get('settings').renderAll()
    eruda.show('console')
    originalLang = devTools.config.get('lang')
  })

  afterEach(function () {
    /** 语言是全局状态，用例结束后必须还原，避免影响其他测试。 */
    devTools.config.set('lang', originalLang)
  })

  it('defaults to Chinese', function () {
    expect(devTools.config.get('lang')).toBe('zh')
    expect($tabTitle('console')).toHaveText('控制台')
    expect($tabTitle('network')).toHaveText('网络')
    expect($tabTitle('settings')).toHaveText('设置')
    expect(settingTitles()).toContain('控制台')
  })

  it('keeps the language list itself untranslated', function () {
    expect(selectOptionTexts(0)).toEqual(['中文', 'English'])
    /** 主题下拉的第一项是“跟随系统”，需要随语言变化。 */
    expect(selectOptionTexts(1)[0]).toBe('跟随系统')
  })

  it('switches labels of every panel to English', function () {
    selectLang('en')

    expect(devTools.config.get('lang')).toBe('en')
    expect($tabTitle('console')).toHaveText('console')
    expect($tabTitle('settings')).toHaveText('settings')
    expect(settingTitles()).toContain('Console')

    expect(selectOptionTexts(1)[0]).toBe('System preference')
    expect($('.eruda-requests th').eq(0)).toHaveText('Name')
    expect($('.eruda-local-storage .eruda-title')).toContainText('Local Storage')
    expect($('.eruda-local-storage .luna-data-grid th').eq(0)).toHaveText('Key')
  })

  it('switches back to Chinese', function () {
    selectLang('en')
    selectLang('zh')

    expect($tabTitle('console')).toHaveText('控制台')
    expect($('.eruda-requests th').eq(0)).toHaveText('名称')
    expect($('.eruda-local-storage .luna-data-grid th').eq(0)).toHaveText('键')
  })

  it('falls back to the default language for unknown values', function () {
    devTools.config.set('lang', 'fr')

    expect(devTools.config.get('lang')).toBe('zh')
    expect($('.eruda-settings select').eq(0).val()).toBe('zh')
    expect($tabTitle('console')).toHaveText('控制台')
  })

  it('keeps the name of a plugin registered snippet', function () {
    const snippets = eruda.get('snippets')

    snippets.add('My Snippet', function () {}, 'My description')
    expect($('.eruda-snippets .eruda-name')).toContainText('My Snippet')
    expect($('.eruda-snippets .eruda-description')).toContainText(
      'My description'
    )

    snippets.remove('My Snippet')
  })
})
