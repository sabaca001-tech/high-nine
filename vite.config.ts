import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  /**
   * 配信するパス。
   *
   * GitHub Pages のプロジェクトページは `https://ユーザー名.github.io/リポジトリ名/`
   * のように**サブパス**で配信されるので、アセットの参照先を合わせる必要がある。
   * ワークフローから `BASE_PATH=/リポジトリ名/` を渡す。
   * Cloudflare Pages や Netlify のようにルート配信なら指定しなくてよい。
   */
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      // CLAUDE.md のルール: import は絶対パス '@/core/...' を使う
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 同じWi-Fi内のスマホ実機から動作確認できるようにする
    host: true,
  },
})
