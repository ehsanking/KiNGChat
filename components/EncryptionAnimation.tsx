'use client';

import { motion } from 'motion/react';
import { Smartphone, Lock } from 'lucide-react';

export default function EncryptionAnimation() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-20 md:opacity-30">
      <div className="relative w-full h-full max-w-6xl mx-auto flex items-center justify-between px-10">
        
        {/* Left Phone */}
        <motion.div 
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative"
        >
          <Smartphone className="w-24 h-24 md:w-32 md:h-32 text-brand-blue" />
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-brand-gold rounded-full blur-sm"
          />
        </motion.div>

        {/* Curved Path and Animation */}
        <div className="flex-1 relative h-64 mx-4">
          <svg className="w-full h-full" viewBox="0 0 400 200" fill="none" preserveAspectRatio="none">
            {/* Background Path */}
            <path 
              d="M 0 100 Q 200 0 400 100" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeDasharray="8 8" 
              className="text-zinc-800"
            />
            
            {/* Animated Dotted Path */}
            <motion.path 
              d="M 0 100 Q 200 0 400 100" 
              stroke="#c49a45" 
              strokeWidth="3" 
              strokeDasharray="1 15" 
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ 
                pathLength: [0, 1],
                opacity: [0, 1, 0],
                pathOffset: [0, 1]
              }}
              transition={{ 
                duration: 3, 
                repeat: Infinity, 
                ease: "linear" 
              }}
            />
          </svg>

          {/* Moving Lock Icon */}
          <motion.div
            style={{ offsetPath: "path('M 0 100 Q 200 0 400 100')" }}
            animate={{ 
              offsetDistance: ["0%", "100%"],
              opacity: [0, 1, 1, 0]
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute top-0 left-0 w-8 h-8 bg-brand-blue border border-brand-gold rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(196,154,69,0.5)]"
          >
            <Lock className="w-4 h-4 text-brand-gold" />
          </motion.div>
        </div>

        {/* Right Phone */}
        <motion.div 
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative"
        >
          <Smartphone className="w-24 h-24 md:w-32 md:h-32 text-brand-blue" />
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-brand-gold rounded-full blur-sm"
          />
        </motion.div>

      </div>
    </div>
  );
}
