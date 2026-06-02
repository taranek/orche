import { motion } from 'motion/react'

interface SplashScreenProps {
  /** True once initial data is loaded — splash fades out shortly after this flips. */
  ready: boolean
  onDismiss: () => void
}

/**
 * Loading overlay shown until the first changes payload resolves.
 * Stays mounted as long as `ready` is false; once true, animates out and calls onDismiss.
 */
export function SplashScreen({ ready, onDismiss }: SplashScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base"
      initial={{ opacity: 1 }}
      animate={{ opacity: ready ? 0 : 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onAnimationComplete={() => { if (ready) onDismiss() }}
    >
      <img
        src="orche.svg"
        alt="orche"
        width={128}
        height={128}
        className="drop-shadow-[0_8px_24px_color-mix(in_oklch,var(--fg)_25%,transparent)]"
      />
    </motion.div>
  )
}
