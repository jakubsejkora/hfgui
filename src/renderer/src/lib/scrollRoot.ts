import { createContext, useContext, type RefObject } from 'react'

/**
 * The one scrolling element between the header and the dock. Pages read it for
 * IntersectionObserver roots (an observer rooted at the viewport can't see past
 * an overflow container, so infinite scroll never prefetched) and for restoring
 * their scroll position.
 */
export const ScrollRootContext = createContext<RefObject<HTMLDivElement | null> | null>(null)

export function useScrollRoot(): RefObject<HTMLDivElement | null> | null {
  return useContext(ScrollRootContext)
}
