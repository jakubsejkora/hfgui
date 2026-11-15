import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'

interface Props {
  children: ReactNode
  /** Page boundaries offer a way back to Overview; the app-level one reloads. */
  onHome?: () => void
  /** Fill the whole window (the last-resort boundary around the entire app). */
  fullscreen?: boolean
}

interface State {
  error: Error | null
}

/**
 * Keeps a rendering crash where it happened. Without one, a single bad render —
 * a download entry this build didn't understand — unmounted the whole app and
 * left an empty window. Now the page says what broke and the rest keeps working.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[hfgui] render crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        className={
          this.props.fullscreen
            ? 'flex h-svh items-center justify-center bg-background p-6'
            : 'flex min-h-full items-center justify-center p-6'
        }
      >
        <Empty className="max-w-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Something on this page broke</EmptyTitle>
            <EmptyDescription className="selectable font-mono text-xs">{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            {this.props.fullscreen ? (
              <Button size="sm" onClick={() => window.location.reload()}>
                <RotateCcw /> Reload hfgui
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={() => this.setState({ error: null })}>
                  <RotateCcw /> Try again
                </Button>
                {this.props.onHome && (
                  <Button size="sm" variant="outline" onClick={this.props.onHome}>
                    Go to Overview
                  </Button>
                )}
              </>
            )}
          </EmptyContent>
        </Empty>
      </div>
    )
  }
}
