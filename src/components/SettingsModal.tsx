import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Settings } from '../lib/types'

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (open) api.settings().then(setSettings).catch(() => undefined)
  }, [open])

  async function save() {
    if (!settings) return
    await api.saveSettings(settings)
    setToast('設定已儲存')
    onClose()
    window.setTimeout(() => setToast(''), 1800)
  }

  return (
    <>
      {open && settings && (
        <div className="modal-back" onClick={onClose}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>模型與金鑰</h2>
            <p className="hint">金鑰優先讀專案根目錄 `.env` 的 `GEMINI_API_KEY`，沒有再看本機設定。</p>
            <label>
              供應商
              <select
                value={settings.provider}
                onChange={(event) =>
                  setSettings({ ...settings, provider: event.target.value as Settings['provider'] })
                }
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI 相容</option>
              </select>
            </label>
            <label>
              模型
              <input
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              />
            </label>
            {settings.provider === 'openai' && (
              <label>
                API Base
                <input
                  value={settings.apiBase}
                  onChange={(event) => setSettings({ ...settings, apiBase: event.target.value })}
                />
              </label>
            )}
            <label>
              API Key {settings.hasKey ? '（已儲存）' : ''}
              <input
                type="password"
                value={settings.apiKey}
                placeholder={settings.hasKey ? '留空表示沿用舊金鑰' : '貼上金鑰'}
                onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
              />
            </label>
            <div className="row-end">
              <button className="ghost" onClick={onClose}>
                取消
              </button>
              <button className="solid" onClick={() => void save()}>
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
