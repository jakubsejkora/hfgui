// The app icon itself, so the in-app mark and the Dock icon can't drift apart.
import appIcon from '../../../../../build/icon.svg?url'
import { Omnibox } from './Omnibox'
import { SystemStats } from './SystemStats'

/**
 * Full-width chrome: brand lockup, the omnibox, and live system stats. The bar
 * is the window's drag handle, so the traffic-light gutter is reserved by the
 * left padding (see trafficLightPosition in src/main/index.ts).
 */
export function TopBar() {
  return (
    <header className="drag-region relative z-30 flex h-14 shrink-0 items-center gap-5 pr-6 pl-[86px]">
      <div className="flex shrink-0 items-center gap-2.5">
        {/* The SVG keeps Apple's 10% icon margin; overscan it so the body fills 32 px. */}
        <img src={appIcon} alt="" draggable={false} className="-m-1 h-10 w-10 shrink-0" />
        <div className="hidden leading-tight lg:block">
          <div className="text-[13px] font-semibold">hfgui</div>
          <div className="text-faint text-[11px]">Model downloader</div>
        </div>
      </div>
      <Omnibox />
      <SystemStats />
    </header>
  )
}
