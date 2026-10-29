import each from 'licia/each'
import isUndef from 'licia/isUndef'
import replaceAll from 'licia/replaceAll'

/** 默认语言，未配置时生效。 */
export const DEFAULT_LANG = 'zh'

/** 可选语言：语言代码 → 该语言自身的名称，语言列表本身不做翻译。 */
export const LANGS = {
  zh: '中文',
  en: 'English',
}

/**
 * 中文词条，key 为界面上的英文原文。
 * 英文原文即 key，因此只有中英文文案不同的界面才需要词条；
 * 品牌名（Eruda、Vue）、协议字段（User-Agent、Cookie）等保持原样。
 */
const messages = {
  zh: {
    // 面板名，同时用于顶部标签页与设置分区标题
    console: '控制台',
    elements: '元素',
    network: '网络',
    resources: '资源',
    sources: '源码',
    info: '信息',
    snippets: '代码片段',
    settings: '设置',

    // 通用设置
    Language: '语言',
    Theme: '主题',
    'System preference': '跟随系统',
    Transparency: '透明度',
    'Display Size': '显示高度',
    'Restore defaults and reload': '恢复默认设置并刷新',
    'Open Eruda': '打开 Eruda',
    'Close Eruda': '关闭 Eruda',
    'Remember Entry Button Position': '记住入口按钮位置',
    Refreshed: '已刷新',
    Filter: '过滤',
    Empty: '暂无',

    // Console
    All: '全部',
    Info: '信息',
    Warning: '警告',
    Error: '错误',
    Cancel: '取消',
    Execute: '执行',
    'Asynchronous Rendering': '异步渲染',
    'Enable JavaScript Execution': '启用 JavaScript 执行',
    'Catch Global Errors': '捕获全局错误',
    'Override Console': '覆盖 console',
    'Auto Display If Error Occurs': '出现错误时自动显示',
    'Display Extra Information': '显示附加信息',
    'Display Unenumerable Properties': '显示不可枚举属性',
    'Access Getter Value': '读取 getter 值',
    'Lazy Evaluation': '惰性求值',
    'Max Log Number': '最大日志数量',
    infinite: '不限',

    // Elements
    Attributes: '属性',
    Styles: '样式',
    'Computed Style': '计算样式',
    'Event Listeners': '事件监听',
    'Catch Event Listeners': '捕获事件监听',

    // Network
    Name: '名称',
    Method: '方法',
    Status: '状态',
    Size: '大小',
    Time: '耗时',
    'Request Headers': '请求头',
    'Response Headers': '响应头',
    'Copy options': '复制选项',
    'Copy All': '复制全部',
    'Request URL': '请求地址',
    'Query Parameters': '查询参数',
    'Request Body': '请求体',
    'Response Body': '响应体',
    'Find in details': '在详情中查找',
    'Find in network details': '在 Network 详情中查找',
    'Previous match': '上一个匹配项',
    'Next match': '下一个匹配项',
    'Showing the first {0} of {1} matches':
      '共 {1} 处匹配，当前仅展示前 {0} 处',

    // Network mock
    'Mock rules': 'Mock 管理',
    'Mock this interface': '模拟此接口',
    'Request data': '入参',
    Back: '返回',
    Save: '保存',
    Edit: '编辑',
    Delete: '删除',
    Format: '格式化',
    Clear: '清空',
    Copy: '复制',
    Paste: '粘贴',
    Copied: '已复制',
    'Replace with clipboard content': '替换为剪贴板内容',
    'Clipboard is empty': '剪贴板为空',
    'Copy failed. Select the text and copy manually.':
      '复制失败，请选中文本后手动复制。',
    'Use Paste in the input menu or your keyboard shortcut.':
      '请在输入框长按粘贴，或使用粘贴快捷键。',
    'Content changed. Paste again to replace it.':
      '内容已变化，请再次点击粘贴。',
    Active: '生效中',
    Paused: '已停用',
    'New rule': '新建规则',
    'Edit mock rule': '编辑 Mock 规则',
    'Enable interface': '启用该接口',
    'Enable this part': '启用此项',
    'Mock content': 'Mock 内容',
    'Response delay (ms)': '响应延迟（毫秒）',
    'Mock rule saved': 'Mock 规则已保存',
    'Mock failed: {0}': 'Mock 执行失败：{0}',
    'Filter by interface URL': '按接口地址筛选',
    'No mock rules yet': '还没有 Mock 规则',
    'No matching rules': '没有匹配的规则',
    'Open a request and tap the mock icon to get started.':
      '在请求详情点击扳手图标，即可开始配置。',
    'Match method and URL path; query values may vary.':
      '按请求方法和接口路径匹配，查询参数变化也可命中。',
    'Match URL path': '按路径匹配',
    'Merge by name; null removes a header.': '同名覆盖；null 删除字段',
    'Replace query parameters': '替换查询参数',
    'Replace request body': '替换请求体',
    'Send real request': '发送真实请求',
    'Real request': '真实请求',
    'Local response': '本地响应',
    'Script variables': '脚本变量',
    Variable: '变量',
    Description: '说明',
    'Return a value synchronously': '同步返回结果',
    'Original query parameters': '原始查询参数',
    'Original request body': '原始请求体',
    'Original request headers': '原始请求头',
    'Original response headers': '原始响应头',
    'Original server response body': '服务端原始响应体',
    'null (local response)': 'null（本地模拟）',
    'null (before response)': 'null（请求阶段）',
    'Discard unsaved mock changes?': '放弃尚未保存的 Mock 修改？',
    'Delete mock rule for {0}?': '删除 {0} 的 Mock 规则？',
    'Delete unreadable local rules': '手动删除无法读取的本地规则',
    'Delete unreadable local rules? This cannot be undone.':
      '删除无法读取的本地规则？此操作无法撤销。',
    'Cannot read saved rules. Existing data has not been overwritten.':
      '无法读取已保存的规则，原有数据未被覆盖。',
    'Local storage is full. The rule was not saved.':
      '本地存储空间不足，规则尚未保存。',
    'Local storage is unavailable. The rule was not saved.':
      '当前页面无法使用本地存储，规则尚未保存。',
    'JavaScript is blocked by this page. Use JSON instead.':
      '当前页面限制执行 JavaScript，请使用 JSON 模式。',
    'Mock URL is required': '请填写接口地址',
    'Only HTTP and HTTPS URLs are supported': '仅支持 HTTP 和 HTTPS 接口地址',
    'Invalid request method': '请求方法不合法',
    'Invalid mock content': 'Mock 内容格式不合法',
    'Headers and query parameters must be a JSON object':
      '头部和查询参数必须填写 JSON 对象',
    'Delay must be an integer between 0 and 600000 ms':
      '延迟必须是 0～600000 毫秒之间的整数',
    'Status must be between 200 and 599':
      'HTTP 状态码必须是 200～599 之间的整数',
    'A mock rule already exists for this interface':
      '该接口已存在 Mock 规则，请编辑已有规则',
    'JavaScript mock must return a value':
      'JavaScript 必须通过 return 或表达式返回结果',
    'JavaScript mock cannot be empty': 'JavaScript 内容不能为空',
    'JavaScript mock must return synchronously':
      'JavaScript 需同步返回结果；模拟延迟请使用延迟设置',
    'Synchronous XHR cannot use a mock delay':
      '同步 XHR 无法设置模拟延迟，请将延迟设为 0',
    'Mock must return serializable data': 'Mock 必须返回可序列化的数据',
    'Headers must be an object': '头部必须返回一个对象',
    'Query parameters and form data must be an object':
      '查询参数和表单数据必须返回一个对象',
    'Cannot mock opaque response headers': '无法修改浏览器不允许读取的响应头',

    // Resources
    'Local Storage': '本地存储',
    'Session Storage': '会话存储',
    Key: '键',
    Value: '值',
    Script: '脚本',
    Stylesheet: '样式表',
    Iframe: '内联框架',
    Image: '图片',
    'Hide Eruda Setting': '在列表中隐藏 Eruda 配置项',
    'Auto Refresh Elements': '自动刷新元素列表',

    // Sources
    'Find in JSON': '在 JSON 中查找',
    'Find in JSON source': '在 JSON 数据中查找',
    'Search stopped at the safe result limit': '已达到结果安全上限，搜索提前结束',
    'Show Line Numbers': '显示行号',
    'Sorry, unable to fetch source code:(': '抱歉，无法获取源码 :(',

    // Info
    Location: '页面地址',
    Device: '设备',
    System: '系统',
    'Sponsor this Project': '赞助本项目',
    About: '关于',
    screen: '屏幕',
    viewport: '视口',
    'pixel ratio': '像素比',
    os: '操作系统',
    browser: '浏览器',

    // Snippets
    'Border All': '元素描边',
    'Add color borders to all elements': '为所有元素添加彩色边框',
    'Refresh Page': '刷新页面',
    'Add timestamp to url and refresh': '在 URL 中加入时间戳并刷新',
    'Search Text': '搜索文本',
    'Highlight given text on page': '高亮页面中的指定文本',
    'Enter the text': '输入要查找的文本',
    'Edit Page': '编辑页面',
    'Toggle body contentEditable': '切换 body 的可编辑状态',
    'Fit Screen': '适应屏幕',
    'Scale down the whole page to fit screen': '缩放整个页面以适应屏幕',
    'Load Vue Plugin': '加载 Vue 插件',
    'Vue devtools': 'Vue 开发者工具',
    'Load Monitor Plugin': '加载 Monitor 插件',
    'Display page fps, memory and dom nodes': '展示页面帧率、内存与 DOM 节点数',
    'Load Features Plugin': '加载 Features 插件',
    'Browser feature detections': '浏览器特性检测',
    'Load Timing Plugin': '加载 Timing 插件',
    'Show performance and resource timing': '展示性能与资源加载耗时',
    'Load Code Plugin': '加载 Code 插件',
    'Edit and run JavaScript': '编辑并运行 JavaScript',
    'Load Benchmark Plugin': '加载 Benchmark 插件',
    'Run JavaScript benchmarks': '运行 JavaScript 性能测试',
    'Load Geolocation Plugin': '加载 Geolocation 插件',
    'Test geolocation': '测试地理定位接口',
    'Load Orientation Plugin': '加载 Orientation 插件',
    'Test orientation api': '测试方向感应接口',
    'Load Touches Plugin': '加载 Touches 插件',
    'Visualize screen touches': '可视化屏幕触控事件',
  },
}

let lang = DEFAULT_LANG

export function getLang() {
  return lang
}

/** 切换语言，非法语言保持原值。 */
export function setLang(newLang) {
  if (isUndef(LANGS[newLang]) || newLang === lang) return lang

  lang = newLang

  return lang
}

/**
 * 取词条，未命中的原文直接返回，因此插件注册的自定义文案不会被改写。
 * 支持 {0}、{1} 形式的占位符替换。
 */
export function t(str, ...args) {
  const dict = messages[lang]
  let ret = dict && !isUndef(dict[str]) ? dict[str] : str

  each(args, (val, i) => {
    ret = replaceAll(ret, `{${i}}`, val)
  })

  return ret
}
