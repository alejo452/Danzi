// Xi Bao (喜宝), el panda de Danzi. Un dibujo SVG con una expresión por estado de ánimo.
// Los colores salen de los tokens --panda-* de src/styles.css (con versión oscura) y la bufanda
// usa --accent, así que cambia con el tema de color. Las animaciones están en styles.css.
import type { Mood } from '../lib/mascot';

/** face: solo la cabeza y la bufanda, sin cuerpo (para íconos: el de la app y la imagen del recordatorio). */
type Props = { mood: Mood; size?: number; face?: boolean; className?: string };

/** Brazo como trazo grueso con borde (el borde solo se nota en modo oscuro). */
function Arm({ d, className = '' }: { d: string; className?: string }) {
  return (
    <g className={className}>
      <path className="xb-arm-edge" d={d} />
      <path className="xb-arm" d={d} />
    </g>
  );
}

const ARM_REST_L = 'M33 83 Q28 92 34 98';
const ARM_REST_R = 'M87 83 Q92 92 86 98';
const ARM_UP_L = 'M33 81 Q24 74 25 63';
const ARM_UP_R = 'M87 81 Q96 74 95 63';

export function XiBao({ mood, size = 96, face = false, className = '' }: Props) {
  const leftUp = mood === 'feliz';
  const rightUp = mood === 'feliz' || mood === 'hola' || mood === 'animado';
  const eyes = mood === 'feliz' || mood === 'animado' ? 'happy' : mood === 'dormido' ? 'closed' : 'open';

  return (
    <svg
      className={`xb xb-${mood}${className ? ` ${className}` : ''}`}
      viewBox={face ? '16 4 88 88' : '0 0 120 120'}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {!face && <ellipse className="xb-shadow" cx="60" cy="113" rx="29" ry="4.5" />}
      <g className="xb-all">
        {/* Orejas */}
        <circle className="xb-ink" cx="33" cy="19" r="11" />
        <circle className="xb-ink" cx="87" cy="19" r="11" />

        {!face && (
          <>
            {/* Cuerpo y patas */}
            <path className="xb-fur" d="M28 90 C28 71 42 63 60 63 C78 63 92 71 92 90 C92 104 79 111 60 111 C41 111 28 104 28 90 Z" />
            <ellipse className="xb-ink" cx="43" cy="106.5" rx="12" ry="7.5" />
            <ellipse className="xb-ink" cx="77" cy="106.5" rx="12" ry="7.5" />
            <ellipse className="xb-pad" cx="43" cy="107" rx="5" ry="3.2" />
            <ellipse className="xb-pad" cx="77" cy="107" rx="5" ry="3.2" />

            {/* Brazos */}
            <Arm d={leftUp ? ARM_UP_L : ARM_REST_L} className={leftUp ? 'xb-arm-l xb-up' : 'xb-arm-l'} />
            <Arm d={rightUp ? ARM_UP_R : ARM_REST_R} className={`xb-arm-r${rightUp ? ' xb-up' : ''}${mood === 'hola' ? ' xb-wave' : ''}`} />
          </>
        )}

        {/* Bufanda (color del tema) */}
        <path className="xb-scarf" d="M35 70 Q60 81 85 70 L86 77 Q60 89 34 77 Z" />
        {!face && <path className="xb-scarf" d="M68 79 L77 94 L70.5 96 L63 81 Z" />}

        {/* Cabeza */}
        <circle className="xb-fur" cx="60" cy="44" r="33" />
        <ellipse className="xb-ink" cx="46" cy="46" rx="9.5" ry="12" transform="rotate(28 46 46)" />
        <ellipse className="xb-ink" cx="74" cy="46" rx="9.5" ry="12" transform="rotate(-28 74 46)" />

        {eyes === 'open' && (
          <g className="xb-eyes">
            <circle className="xb-eye" cx="48" cy="44.5" r="4.6" />
            <circle className="xb-eye" cx="72" cy="44.5" r="4.6" />
            <circle className="xb-pupil" cx="48.6" cy="45.2" r="3" />
            <circle className="xb-pupil" cx="71.4" cy="45.2" r="3" />
            <circle className="xb-shine" cx="47.3" cy="43.4" r="1.15" />
            <circle className="xb-shine" cx="70.1" cy="43.4" r="1.15" />
          </g>
        )}
        {eyes === 'happy' && (
          <g>
            <path className="xb-line-w" d="M43.5 47 Q48 40.5 52.5 47" />
            <path className="xb-line-w" d="M67.5 47 Q72 40.5 76.5 47" />
          </g>
        )}
        {eyes === 'closed' && (
          <g>
            <path className="xb-line-w" d="M43.5 44 Q48 48.5 52.5 44" />
            <path className="xb-line-w" d="M67.5 44 Q72 48.5 76.5 44" />
          </g>
        )}
        {mood === 'preocupado' && (
          <g>
            <path className="xb-line" d="M40.5 31.5 L50 28.5" />
            <path className="xb-line" d="M79.5 31.5 L70 28.5" />
          </g>
        )}

        {/* Nariz y boca */}
        <ellipse className="xb-nose" cx="60" cy="56" rx="4.2" ry="3" />
        {(mood === 'listo' || mood === 'hola') && <path className="xb-line" d="M53.5 60.5 q3.25 3.6 6.5 0 q3.25 3.6 6.5 0" />}
        {(mood === 'feliz' || mood === 'animado') && (
          <g>
            <path className="xb-mouth" d="M52.5 60 Q60 73 67.5 60 Z" />
            <path className="xb-tongue" d="M55.4 65.4 Q60 62.6 64.6 65.4 Q60 70.4 55.4 65.4 Z" />
          </g>
        )}
        {mood === 'preocupado' && <path className="xb-line" d="M54 64.5 q3 -2.6 6 0 q3 2.6 6 0" />}
        {mood === 'dormido' && <ellipse className="xb-mouth" cx="60" cy="62.6" rx="1.9" ry="2.3" />}

        {/* Mejillas */}
        <ellipse className="xb-blush" cx="37.5" cy="59.5" rx="5.5" ry="3.2" />
        <ellipse className="xb-blush" cx="82.5" cy="59.5" rx="5.5" ry="3.2" />

        {/* Detalles según el ánimo */}
        {mood === 'feliz' && (
          <g className="xb-sparks">
            <path className="xb-spark" d="M14 34 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 Z" />
            <path className="xb-spark xb-spark-2" d="M104 24 l1.5 -4.5 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5 -4.5 l-4.5 -1.5 Z" />
            <path className="xb-spark xb-spark-3" d="M108 66 l1.2 -3.6 l1.2 3.6 l3.6 1.2 l-3.6 1.2 l-1.2 3.6 l-1.2 -3.6 l-3.6 -1.2 Z" />
          </g>
        )}
        {mood === 'animado' && <path className="xb-spark" d="M104 30 l1.6 -4.8 l1.6 4.8 l4.8 1.6 l-4.8 1.6 l-1.6 4.8 l-1.6 -4.8 l-4.8 -1.6 Z" />}
        {mood === 'hola' && (
          <g className="xb-motion">
            <path className="xb-soft" d="M103 54 q4 4 2 10" />
            <path className="xb-soft" d="M108 50 q6 6 3 15" />
          </g>
        )}
        {mood === 'preocupado' && <path className="xb-sweat" d="M92 30 Q96 37 96 40 A4 4 0 0 1 88 40 Q88 37 92 30 Z" />}
        {mood === 'dormido' && (
          <g className="xb-zzz">
            <path className="xb-z" d="M100 31 h6 l-6 7 h6" />
            <path className="xb-z xb-z-2" d="M108 14 h8 l-8 9 h8" />
          </g>
        )}
      </g>
    </svg>
  );
}
