import { ArrowDownToLine, BookOpen, Compass, KeyRound, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react'
import { selectBusyCount, useDownloadsStore } from '@/lib/downloadsStore'
import { useHfAccount } from '@/lib/queries'
import { useUiStore, type View } from '@/lib/uiStore'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger
} from '@/components/ui/sidebar'
// The app icon itself, so the in-app mark and the Dock icon can't drift apart.
import appIcon from '../../../../../build/icon.svg?url'
import { SystemStatus } from './SystemStatus'

const NAV: Array<{ view: View; label: string; icon: typeof Compass }> = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'browse', label: 'Browse', icon: Compass },
  { view: 'downloads', label: 'Downloads', icon: ArrowDownToLine },
  { view: 'private-inference', label: 'Private inference', icon: ShieldCheck },
  { view: 'guide', label: 'Guide', icon: BookOpen }
]

function NavButton({ view, label, icon: Icon }: (typeof NAV)[number]) {
  const current = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  return (
    <SidebarMenuButton
      isActive={current === view}
      aria-current={current === view ? 'page' : undefined}
      onClick={() => setView(view)}
      data-testid={`nav-${view}`}
      className="font-medium"
    >
      <Icon />
      <span>{label}</span>
    </SidebarMenuButton>
  )
}

function AccountButton() {
  const { data: account, isLoading } = useHfAccount()
  const setView = useUiStore((s) => s.setView)
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)

  if (account) {
    return (
      <SidebarMenuButton size="lg" onClick={() => setView('settings')} className="gap-2.5">
        {account.avatarUrl ? (
          <img src={account.avatarUrl} alt="" className="size-8 shrink-0 rounded-full bg-muted" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
            {account.name.slice(0, 1)}
          </span>
        )}
        <span className="grid min-w-0 leading-tight">
          <span className="truncate font-medium">{account.fullname || account.name}</span>
          <span className="truncate text-xs text-muted-foreground">@{account.name} · Hugging Face</span>
        </span>
      </SidebarMenuButton>
    )
  }
  if (isLoading) return null
  return (
    <SidebarMenuButton onClick={() => openTokenDialog(true)} className="text-muted-foreground">
      <KeyRound />
      <span>Connect Hugging Face</span>
    </SidebarMenuButton>
  )
}

/**
 * Wording note: the sidebar is mounted on every page, before page content in
 * DOM order. It must never render "Completed", "No downloads yet.", "Remove
 * from list", the text "Users" or an absolute path (see scripts/*.mjs).
 */
export function AppSidebar() {
  const busy = useDownloadsStore(selectBusyCount)

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="gap-0 p-0">
        {/* The traffic lights sit in this strip; it matches the header's height so they line up. */}
        <div className="drag-region flex h-14 shrink-0 items-center justify-end px-2">
          <SidebarTrigger aria-label="Hide sidebar" className="text-sidebar-foreground/60" />
        </div>
        <div className="drag-region flex items-center gap-2.5 px-4 pt-1 pb-3">
          {/* The SVG keeps Apple's 10% icon margin; overscan so the body fills ~28 px. */}
          <img src={appIcon} alt="" draggable={false} className="-m-1 size-9 shrink-0" />
          <div className="grid leading-tight">
            <span className="text-sm font-semibold">hfgui</span>
            <span className="text-xs text-muted-foreground">Model downloader</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <NavButton {...item} />
                  {item.view === 'downloads' && busy > 0 && (
                    <SidebarMenuBadge
                      aria-label={`${busy} in progress`}
                      className="top-1.5 h-5 min-w-5 rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background tabular-nums peer-data-[active=true]/menu-button:text-background"
                    >
                      {busy}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 pb-3">
        <SystemStatus />
        <SidebarMenu>
          <SidebarMenuItem>
            <NavButton view="settings" label="Settings" icon={Settings} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AccountButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
