import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import TrayPopup from './components/tray-popup/TrayPopup'

document.addEventListener('contextmenu', (e) => {
  // 放行 xterm 终端区域的右键菜单
  if ((e.target as HTMLElement).closest('.xterm')) return;
  e.preventDefault();
})

const windowLabel = getCurrentWindow().label;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {windowLabel === 'tray-popup' ? <TrayPopup /> : <App />}
  </StrictMode>,
)
