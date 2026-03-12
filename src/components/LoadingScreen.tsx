import { motion } from "framer-motion";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";

interface LoadingScreenProps {
  /** "full" fills entire screen (for route-level loading), "inline" fills parent container */
  mode?: "full" | "inline";
  /** Optional message below the logo */
  message?: string;
}

export default function LoadingScreen({ mode = "inline", message }: LoadingScreenProps) {
  const containerClass =
    mode === "full"
      ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      : "flex flex-col items-center justify-center h-full w-full min-h-[200px] p-8";

  return (
    <div className={containerClass}>
      <motion.img
        src={coffeeLogo}
        alt="Carregando..."
        className="h-16 w-16 object-contain drop-shadow-md"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      />
      <div className="mt-4 flex items-center gap-1.5">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-accent"
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 0.9, delay }}
          />
        ))}
      </div>
      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-3 text-xs text-muted-foreground"
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}
