'use client';

import Image from 'next/image';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Glow effect behind logo */}
      <div className="relative flex flex-col items-center gap-10">
        <div className="absolute -inset-16 rounded-full bg-green-100/60 blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={260}
            height={78}
            priority
            className="drop-shadow-md"
            style={{ height: 'auto' }}
          />
        </div>

        {/* Animated loader */}
        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Progress bar */}
          <div className="w-52 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#1e8767] via-[#22c6ff] to-[#1e8767] rounded-full animate-progress" />
          </div>

          <p className="text-sm font-medium text-gray-500 tracking-wide animate-pulse">
            Načítání dat…
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        .animate-progress {
          animation: progress 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
