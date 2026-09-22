import { StarChain } from '../components/StarChain'
import { api } from '../lib/api'

export function PortalPage() {
  return (
    <StarChain
      hubLabel="通道"
      hubSub="Gates"
      ariaLabel="通道星鏈"
      fallbackGroups={['託管', '部署', '資料', '開發']}
      defaultGroup="開發"
      modalTitle="送入傳送門"
      submitLabel="送進通道"
      groupPlaceholder="託管、部署、資料、開發…"
      load={() => api.portals()}
      add={(body) => api.addPortal({ ...body, mark: '' })}
      patch={(id, body) => api.patchPortal(id, body)}
      remove={(id) => api.removePortal(id)}
      open={(item) => void api.openPortal(item.id)}
    />
  )
}
