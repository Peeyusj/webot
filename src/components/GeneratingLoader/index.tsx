export default function GeneratingLoader() {
  const letters = ['G', 'e', 'n', 'e', 'r', 'a', 't', 'i', 'n', 'g'];

  return (
    <div className="flex items-center justify-center h-[92px] w-[92px] overflow-hidden fade-in">
      <style>{`
        .gen-loader-container {
          transform: scale(0.45); /* Scales the 180px loader down to ~80px */
          transform-origin: center center;
        }
        
        .gen-loader-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 180px;
          height: 180px;
          font-family: "Inter", sans-serif;
          font-size: 1.5em; /* Slightly bumped up for legibility when scaled */
          font-weight: 600; /* Made slightly bolder */
          color: #1e293b; /* Changed from white to slate-800 so it's visible in your white chat bubble */
          border-radius: 50%;
          background-color: transparent;
          user-select: none;
        }

        .gen-loader {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          background-color: transparent;
          animation: loader-rotate 2s linear infinite;
          z-index: 0;
        }

        @keyframes loader-rotate {
          0% {
            transform: rotate(90deg);
            box-shadow:
              0 10px 20px 0 #fff inset,
              0 20px 30px 0 #ad5fff inset,
              0 60px 60px 0 #471eec inset;
          }
          50% {
            transform: rotate(270deg);
            box-shadow:
              0 10px 20px 0 #fff inset,
              0 20px 10px 0 #d60a47 inset,
              0 40px 60px 0 #311e80 inset;
          }
          100% {
            transform: rotate(450deg);
            box-shadow:
              0 10px 20px 0 #fff inset,
              0 20px 30px 0 #ad5fff inset,
              0 60px 60px 0 #471eec inset;
          }
        }

        .gen-loader-letter {
          display: inline-block;
          opacity: 0.4;
          transform: translateY(0);
          animation: loader-letter-anim 2s infinite;
          z-index: 1;
          border-radius: 50ch;
          border: none;
        }

        ${letters.map((_, i) => `
          .gen-loader-letter:nth-child(${i + 1}) {
            animation-delay: ${i * 0.1}s;
          }
        `).join('')}

        @keyframes loader-letter-anim {
          0%, 100% {
            opacity: 0.4;
            transform: translateY(0);
          }
          20% {
            opacity: 1;
            transform: scale(1.15);
          }
          40% {
            opacity: 0.7;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="gen-loader-container">
        <div className="gen-loader-wrapper">
          {letters.map((char, index) => (
            <span key={index} className="gen-loader-letter">{char}</span>
          ))}
          <div className="gen-loader"></div>
        </div>
      </div>
    </div>
  );
}