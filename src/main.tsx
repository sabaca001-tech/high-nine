import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/ui/theme/tokens.css'
import App from '@/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// オフラインで遊べるようにする。開発中は登録しない（HMRと衝突するため）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // BASE_URL はビルド時の base。サブパス配信でも正しい場所を指す
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.error('Service Worker の登録に失敗しました', error)
    })
  })
}
