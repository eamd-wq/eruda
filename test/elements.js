describe('elements', function () {
  let tool
  let fixture
  let originalSplitMode

  beforeEach(function () {
    eruda.hide()
    eruda.show('console')
    tool = eruda.get('elements')
    originalSplitMode = tool._splitMode
    tool._splitMode = false

    fixture = document.createElement('div')
    fixture.id = 'elements-lifecycle-fixture'
    fixture.innerHTML = '<section><button>Selected node</button></section>'
    document.body.appendChild(fixture)
  })

  afterEach(function () {
    if (tool._selectElement) tool._toggleSelect()
    eruda.hide()
    eruda.show('console')

    /** The removal test recreates only Elements, preserving other suites' tools. */
    if (!eruda.get('elements')) eruda.add(new eruda.Elements())
    const currentTool = eruda.get('elements')
    currentTool._splitMode = originalSplitMode
    currentTool.select(document.body)
    if (fixture.parentNode) fixture.parentNode.removeChild(fixture)
  })

  function showElements() {
    eruda.show('elements')
    eruda.show()
    return tool._domViewer
  }

  function collectViewers(viewer) {
    const viewers = [viewer]
    viewer.subComponents.forEach(function (child) {
      viewers.push.apply(viewers, collectViewers(child))
    })
    return viewers
  }

  function selectedNode(viewer) {
    const viewers = collectViewers(viewer)
    for (let i = 0; i < viewers.length; i++) {
      const current = viewers[i]
      if (current.$tag.hasClass(current.c('selected'))) {
        return current.getOption('node')
      }
    }
    return null
  }

  function observeDisconnects(viewer) {
    return collectViewers(viewer)
      .filter(function (current) {
        return !!current.observer
      })
      .map(function (current) {
        return spyOn(current.observer, 'disconnect').and.callThrough()
      })
  }

  describe('api', function () {
    it('select element', function () {
      showElements()
      tool.select(document.body)
      expect(tool._curNode).toBe(document.body)
      expect(selectedNode(tool._domViewer)).toBe(document.body)
    })

    it('updates hidden selection and $0 without constructing a live tree', function () {
      const node = fixture.querySelector('button')
      const consoleTool = eruda.get('console')
      spyOn(consoleTool, 'setGlobal').and.callThrough()

      tool.select(node)

      expect(tool._domViewer).toBeNull()
      expect(tool._curNode).toBe(node)
      expect(consoleTool.setGlobal).toHaveBeenCalledWith('$0', node)

      showElements()
      expect(selectedNode(tool._domViewer)).toBe(node)
    })

    it('accepts an empty selection without allocating observers', function () {
      expect(tool.select(null)).toBe(tool)
      expect(tool.select(void 0)).toBe(tool)
      expect(tool._domViewer).toBeNull()
    })
  })

  describe('visibility lifecycle', function () {
    it('creates the tree only when Elements and the container are both visible', function () {
      expect(tool._domViewer).toBeNull()
      eruda.show('elements')
      expect(tool.active).toBe(true)
      expect(tool._domViewer).toBeNull()

      eruda.show()
      const viewer = tool._domViewer
      expect(viewer).not.toBeNull()

      eruda.show()
      eruda.show('elements')
      expect(tool._domViewer).toBe(viewer)
    })

    it('disconnects every tree observer when switching tools', function () {
      const viewer = showElements()
      tool.select(fixture.querySelector('button'))
      const disconnects = observeDisconnects(viewer)
      expect(disconnects.length).toBeGreaterThan(2)

      eruda.show('console')

      expect(tool._domViewer).toBeNull()
      disconnects.forEach(function (disconnect) {
        expect(disconnect).toHaveBeenCalled()
      })
    })

    it('disconnects tree and detail observers when closing the whole console', function () {
      const viewer = showElements()
      tool.select(fixture.querySelector('button'))
      tool._showDetail()
      const disconnects = observeDisconnects(viewer)
      const detailDisconnect = spyOn(
        tool._detail._observer,
        'disconnect'
      ).and.callThrough()

      eruda.hide()

      expect(tool.active).toBe(true)
      expect(tool._domViewer).toBeNull()
      expect(tool._isShow).toBe(false)
      expect(detailDisconnect).toHaveBeenCalled()
      disconnects.forEach(function (disconnect) {
        expect(disconnect).toHaveBeenCalled()
      })
    })

    it('does not handle mutations while hidden and rebuilds the current DOM', function (done) {
      const viewer = showElements()
      tool.select(fixture.querySelector('button'))
      const handlers = collectViewers(viewer).map(function (current) {
        return spyOn(current, 'handleMutation').and.callThrough()
      })
      eruda.hide()
      fixture.setAttribute('data-hidden-update', 'latest')
      const added = document.createElement('p')
      added.textContent = 'Added while hidden'
      fixture.appendChild(added)

      /** Allow native MutationObserver delivery; detached viewers must stay idle. */
      setTimeout(function () {
        handlers.forEach(function (handler) {
          expect(handler).not.toHaveBeenCalled()
        })
        eruda.show()
        tool.select(added)
        expect(tool._domViewer).not.toBe(viewer)
        expect(selectedNode(tool._domViewer)).toBe(added)
        expect(tool._$domViewer.text()).toContain('data-hidden-update')
        done()
      }, 0)
    })

    it('restores selection without duplicating console history', function () {
      const node = fixture.querySelector('button')
      showElements()
      tool.select(node)
      const previousHistory = tool._history.slice()
      const consoleTool = eruda.get('console')
      spyOn(consoleTool, 'setGlobal').and.callThrough()

      eruda.hide()
      eruda.show()

      expect(tool._curNode).toBe(node)
      expect(selectedNode(tool._domViewer)).toBe(node)
      expect(tool._history).toEqual(previousHistory)
      expect(consoleTool.setGlobal).not.toHaveBeenCalled()
    })

    it('refreshes saved ancestors when the selected node moves while hidden', function () {
      const node = fixture.querySelector('button')
      showElements()
      tool.select(node)
      const previousHistory = tool._history.slice()
      eruda.hide()
      const newParent = document.createElement('article')
      newParent.id = 'elements-moved-parent'
      fixture.appendChild(newParent)
      newParent.appendChild(node)

      eruda.show()

      expect(selectedNode(tool._domViewer)).toBe(node)
      expect(tool._curParentQueue[0]).toBe(newParent)
      expect(tool._$crumbs.text()).toContain('elements-moved-parent')
      expect(tool._history).toEqual(previousHistory)
    })

    it('falls back to a surviving ancestor after the selected node is removed', function () {
      const node = fixture.querySelector('button')
      const parent = node.parentNode
      showElements()
      tool.select(node)
      eruda.hide()
      parent.removeChild(node)

      eruda.show()

      expect(tool._curNode).toBe(parent)
      expect(selectedNode(tool._domViewer)).toBe(parent)
    })

    it('terminates ancestor fallback when there are no surviving parents', function () {
      const detached = document.createElement('span')
      tool.select(detached)
      expect(tool._curParentQueue).toEqual([])
      tool._back()
      expect(tool._curNode).toBe(document.body)
      expect(tool._domViewer).toBeNull()
    })
  })

  describe('shadow and picker selection', function () {
    it('restores an open shadow root and its element and text selections', function () {
      const host = document.createElement('div')
      fixture.appendChild(host)
      const shadow = host.attachShadow({ mode: 'open' })
      const child = document.createElement('span')
      child.textContent = 'Shadow text'
      shadow.appendChild(child)
      showElements()

      const nodes = [shadow, child, child.firstChild]
      nodes.forEach(function (node) {
        tool.select(node)
        expect(selectedNode(tool._domViewer)).toBe(node)
        eruda.hide()
        eruda.show()
        expect(tool._curNode).toBe(node)
        expect(selectedNode(tool._domViewer)).toBe(node)
      })
    })

    it('keeps picker mode active while hidden and restores the picked node', function () {
      showElements()
      const overlay = eruda.chobitsu.domain('Overlay')
      const dom = eruda.chobitsu.domain('DOM')
      const node = fixture.querySelector('button')
      const nodeId = dom.getNodeId({ node: node }).nodeId
      spyOn(overlay, 'setInspectMode').and.callThrough()

      tool._toggleSelect()

      expect(tool._selectElement).toBe(true)
      expect(tool._container._isShow).toBe(false)
      expect(tool._domViewer).toBeNull()
      expect(overlay.setInspectMode.calls.mostRecent().args[0].mode).toBe(
        'searchForNode'
      )

      tool._inspectNodeRequested({ backendNodeId: nodeId })

      expect(tool._container._isShow).toBe(true)
      expect(tool._selectElement).toBe(false)
      expect(overlay.setInspectMode.calls.mostRecent().args[0].mode).toBe(
        'none'
      )
      expect(tool._curNode).toBe(node)
      expect(selectedNode(tool._domViewer)).toBe(node)
    })
  })

  describe('removal', function () {
    it('exits picker mode when Elements is removed and leaves host clicks usable', function () {
      showElements()
      const overlay = eruda.chobitsu.domain('Overlay')
      const node = fixture.querySelector('button')
      const hostClick = jasmine.createSpy('host click')
      node.addEventListener('click', hostClick)
      spyOn(overlay, 'setInspectMode').and.callThrough()

      tool._toggleSelect()
      expect(tool._selectElement).toBe(true)
      expect(tool._domViewer).toBeNull()

      eruda.remove('elements')

      expect(tool._selectElement).toBe(false)
      expect(overlay.setInspectMode.calls.mostRecent().args[0].mode).toBe(
        'none'
      )
      /** 销毁高亮层并不会自动取消选点状态，宿主点击不能继续被捕获监听吞掉。 */
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
      expect(node.dispatchEvent(click)).toBe(true)
      expect(hostClick).toHaveBeenCalled()
    })

    it('disconnects observers without treating teardown as a deleted selection', function () {
      const viewer = showElements()
      const node = fixture.querySelector('button')
      tool.select(node)
      const disconnects = observeDisconnects(viewer)
      const detailDisconnect = spyOn(
        tool._detail._observer,
        'disconnect'
      ).and.callThrough()
      spyOn(tool, 'select').and.callThrough()

      eruda.remove('elements')

      expect(eruda.get('elements')).not.toBeDefined()
      expect(tool._domViewer).toBeNull()
      expect(tool.select).not.toHaveBeenCalled()
      expect(detailDisconnect).toHaveBeenCalled()
      disconnects.forEach(function (disconnect) {
        expect(disconnect).toHaveBeenCalled()
      })

      eruda.hide()
      eruda.show()
      expect(tool._domViewer).toBeNull()
    })
  })
})
