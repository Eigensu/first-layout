"use client";
import Image from "next/image";

export default function Loading() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-0 sm:gap-8 bg-[var(--primary-100)]">
      {/* Scene */}
      <div className="scene relative w-[420px] h-[260px]">
        {/* Ball (left -> hit -> up-left) */}
        <div className="absolute z-10 ball">
          <Image src="/ball.svg" alt="Ball" width={22} height={22} priority />
        </div>

        {/* Bat */}
        <div className="absolute z-20 bat-wrap">
          <Image
            src="/bat.svg"
            alt="Cricket bat"
            width={140}
            height={140}
            priority
          />
        </div>
      </div>

      {/* Text with 3 dots */}
      <div
        className="-mt-20 sm:mt-0 flex items-center gap-1 text-[20px] sm:text-[24px] md:text-[28px] font-semibold tracking-wide"
        style={{ color: "var(--accent-orange)" }}
      >
        <span>Connecting to wallearena</span>
        <span className="dots">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </span>
      </div>

      <style jsx>{`
        /* Mobile scale down and lower */
        .scene {
          transition:
            transform 0.2s ease,
            margin-top 0.2s ease;
          transform-origin: top center;
        }
        @media (max-width: 480px) {
          .scene {
            transform: scale(0.6);
            margin-top: 4px;
          }
        }
        @media (max-width: 360px) {
          .scene {
            transform: scale(0.5);
            margin-top: 6px;
          }
        }

        .bat-wrap {
          bottom: 6px;
          left: 50%;
          width: 120px;
          height: 120px;
          transform-origin: 60% 42%;
          animation: swing 1.8s ease-in-out infinite;
        }
        @keyframes swing {
          0% {
            transform: translate(-36%, 0) rotate(-32deg);
          }
          40% {
            transform: translate(-36%, -4px) rotate(-18deg);
          }
          48% {
            transform: translate(-36%, -6px) rotate(-12deg);
          }
          56% {
            transform: translate(-36%, -3px) rotate(-22deg);
          }
          100% {
            transform: translate(-36%, 0) rotate(-32deg);
          }
        }

        .ball {
          left: calc(50% - 150px);
          bottom: 76px;
          width: 22px;
          height: 22px;
          animation: ballPath 1.8s ease-in-out infinite;
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.15));
        }
        @keyframes ballPath {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }
          40% {
            transform: translate(70px, -6px) rotate(120deg);
          }
          46% {
            transform: translate(96px, -12px) rotate(200deg);
          }
          75% {
            transform: translate(-60px, -120px) rotate(380deg);
            opacity: 0.95;
          }
          100% {
            transform: translate(-120px, -120px) rotate(480deg);
            opacity: 0;
          }
        }

        .dots {
          display: inline-flex;
          gap: 6px;
          margin-left: 4px;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-orange-soft);
          animation: blink 1.2s infinite ease-in-out;
        }
        .dot:nth-child(2) {
          animation-delay: 0.2s;
        }
        .dot:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes blink {
          0%,
          20% {
            opacity: 0.2;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  );
}
