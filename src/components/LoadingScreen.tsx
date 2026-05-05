import { motion } from "framer-motion";
import huskyLogo from "@/assets/husky-pdv-logo.png";

interface LoadingScreenProps {
  /** "full" fills entire screen (for route-level loading), "inline" fills parent container */
  mode?: "full" | "inline";
  /** Optional message below the logo */
  message?: string;
}

export default function LoadingScreen({ mode = "inline", message = "Carregando sistema..." }: LoadingScreenProps) {
  const isFull = mode === "full";
  const containerClass = isFull
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center"
    : "flex flex-col items-center justify-center h-full w-full min-h-[200px] p-8";

  const fullStyle = isFull
    ? {
        background:
          "radial-gradient(900px 500px at 20% 0%, hsl(224 70% 22%) 0%, transparent 60%), radial-gradient(700px 400px at 80% 100%, hsl(224 80% 14%) 0%, transparent 55%), linear-gradient(135deg, hsl(222 60% 8%) 0%, hsl(224 76% 14%) 100%)",
      }
    : undefined;

  return (
    <div className={containerClass} style={fullStyle}>
      <motion.img
        src={huskyLogo}
        alt="HuskyPDV"
        className={`${isFull ? "h-24 w-24" : "h-16 w-16"} object-contain drop-shadow-2xl`}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      />
      {isFull && (
        <h1 className="font-display text-xl font-bold tracking-tight mt-4 text-white">HuskyPDV</h1>
      )}
      <div className="mt-4 flex items-center gap-1.5">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "hsl(48 96% 53%)" }}
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
          className={`mt-3 text-xs ${isFull ? "text-white/60" : "text-muted-foreground"}`}
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}
