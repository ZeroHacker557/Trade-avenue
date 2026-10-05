import type { ReactNode } from 'react'

type Props = { children: ReactNode; label: string; onClick?: () => void; className?: string }

export function IconButton({ children, label, onClick, className = '' }: Props) {
  return (
    <button aria-label={label} onClick={onClick} className={'icon-button ' + className}>
      {children}
    </button>
  )
}
