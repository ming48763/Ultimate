import { StarChain } from '../components/StarChain'
import { api } from '../lib/api'
import { INTEL_GROUPS, INTEL_SEED } from '../lib/intel'

export function IntelPage() {
  return (
    <StarChain
      hubLabel="智能"
      hubSub="Craft"
      ariaLabel="智能星鏈"
      fallbackGroups={INTEL_GROUPS}
      alwaysGroups={INTEL_GROUPS}
      defaultGroup="圖像生成"
      modalTitle="送入傳送門"
      submitLabel="送進智能"
      groupPlaceholder="圖像生成、ICON 生成、音樂生成…"
      plainCats
      focusable
      load={async () => {
        try {
          return await api.intel()
        } catch {
          return INTEL_SEED
        }
      }}
      add={(body) => api.addIntel({ ...body, mark: '' })}
      patch={(id, body) => api.patchIntel(id, body)}
      remove={(id) => api.removeIntel(id)}
      open={(item) => void api.openIntel(item.id)}
    />
  )
}
