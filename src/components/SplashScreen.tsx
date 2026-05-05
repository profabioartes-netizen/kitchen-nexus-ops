import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import huskyLogo from "@/assets/husky-pdv-logo.png";

interface SplashScreenProps {
  onFinished: () => void;
}

export default function SplashScreen({ onFinished }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onFinished, 500);
    }, 1800);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(1200px 600px at 10% 0%, hsl(224 70% 22%) 0%, transparent 60%), radial-gradient(900px 500px at 90% 100%, hsl(224 80% 14%) 0%, transparent 55%), linear-gradient(135deg, hsl(222 60% 8%) 0%, hsl(224 76% 14%) 100%)",
          }}
        >
          <motion.img
            src={huskyLogo}
            alt="HuskyPDV"
            className="h-24 w-24 object-contain drop-shadow-2xl"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-5 flex flex-col items-center gap-3"
          >
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">HuskyPDV</h1>
            <p className="text-xs text-white/60 tracking-wide">Carregando sistema...</p>
            <div className="flex items-center gap-2 mt-1">
              {[0, 0.2, 0.4].map((delay, i) => (
                <motion.div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "hsl(48 96% 53%)" }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1, delay }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
