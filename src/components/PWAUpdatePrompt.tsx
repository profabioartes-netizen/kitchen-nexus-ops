import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function PWAUpdatePrompt() {
  const [showBanner, setShowBanner] = useState(false);

  useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates every 60 seconds
      if (registration) {
        setInterval(() => registration.update(), 60_000);
      }
    },
    onNeedRefresh() {
      // Auto-update will handle it, but show a brief banner
      setShowBanner(true);
      // Reload after a short delay to apply the update
      setTimeout(() => window.location.reload(), 1500);
    },
  });

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-3 left-3 right-3 z-[9999] flex items-center gap-3 rounded-xl border border-accent/30 bg-card px-4 py-3 shadow-lg"
        >
          <RefreshCw className="h-5 w-5 text-accent flex-shrink-0 animate-spin" style={{ animationDuration: "3s" }} />
          <p className="text-sm font-medium flex-1">Atualizando...</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}