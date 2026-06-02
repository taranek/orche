import { motion } from 'motion/react'

interface SplashScreenProps {
  onDismiss: () => void
}

/**
 * Brief intro overlay shown on app startup. Auto-dismisses after a beat —
 * just long enough to register the brand mark and hide the empty-state flash
 * while changes are loading.
 */
export function SplashScreen({ onDismiss }: SplashScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-base"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: 1.4, times: [0, 0.7, 1], ease: 'easeOut' }}
      onAnimationComplete={onDismiss}
    >
      <motion.img
        src="orche.svg"
        alt="orche"
        width={128}
        height={128}
        className="drop-shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
      <motion.div
        className="mt-5 text-fg-tertiary text-[11px] tracking-[0.2em] uppercase"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        orche review
      </motion.div>
    </motion.div>
  )
}
