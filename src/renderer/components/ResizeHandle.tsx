import { useCallback, useRef, useEffect } from 'react'

interface ResizeHandleProps {
  /** 拖拽方向 */
  direction: 'horizontal'
  /** 拖拽回调：传入位移量 delta（正=增大左侧面板，负=缩小） */
  onResize: (delta: number) => void
}

export default function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const draggingRef = useRef(false)
  const lastXRef = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      lastXRef.current = e.clientX

      const onMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return
        const delta = ev.clientX - lastXRef.current
        lastXRef.current = ev.clientX
        onResize(delta)
      }

      const onMouseUp = () => {
        draggingRef.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [onResize]
  )

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      tabIndex={-1}
    />
  )
}