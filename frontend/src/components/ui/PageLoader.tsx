import { motion } from 'framer-motion';

interface PageLoaderProps {
  message?: string;
  subtitle?: string;
}

export function PageLoader({
  message = "Synchronizing Enterprise Datasets...",
  subtitle = "Connecting to NexWare Core Engine and establishing secure data pipelines"
}: PageLoaderProps) {
  return (
    <div className="min-h-[380px] w-full flex flex-col items-center justify-center p-8 text-center bg-surface-container-lowest/70 rounded-3xl border border-outline-variant/60 my-6 shadow-xs">
      <div className="relative mb-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 border-r-emerald-600"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 rounded-full border-2 border-primary/20 border-b-primary border-l-primary absolute top-3 left-3"
        />
        <div className="absolute top-6 left-6 w-4 h-4 bg-emerald-500 rounded-full animate-ping opacity-75" />
      </div>
      <h3 className="text-base font-bold text-on-surface tracking-tight bg-gradient-to-r from-emerald-800 to-teal-700 bg-clip-text text-transparent">
        {message}
      </h3>
      <p className="text-xs font-medium text-on-surface-variant max-w-sm mt-1.5 opacity-80">
        {subtitle}
      </p>
    </div>
  );
}
