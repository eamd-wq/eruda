import LunaDomViewer from 'luna-dom-viewer'
import theme from 'licia/theme'

/**
 * Luna DOMViewer overrides Component.destroy without releasing its theme listener.
 * Pair each instance (including dynamically added children) with that cleanup so
 * rebuilding the visible tree cannot retain detached viewers through the emitter.
 */
function manageLifecycle(viewer) {
  if (viewer._erudaLifecycleManaged) return
  viewer._erudaLifecycleManaged = true
  viewer.on('destroy', () => theme.off('change', viewer.onThemeChange))

  const addSubComponent = viewer.addSubComponent
  viewer.addSubComponent = function (component) {
    manageLifecycle(component)
    return addSubComponent.call(this, component)
  }
}

export default function createDomViewer(container, options) {
  const viewer = new LunaDomViewer(container, options)
  manageLifecycle(viewer)
  return viewer
}
