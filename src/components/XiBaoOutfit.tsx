// Prendas de Xi Bao. Se dibujan en el mismo encuadre que el panda (120 × 120),
// con los tokens de Danzi para conservar sus colores en claro y en oscuro.
// El cuerpo queda detrás de las patas, los brazos y la cabeza; el gorro, encima.
type Props = { outfit: string };

export function OutfitBody({ outfit }: Props) {
  switch (outfit) {
    case 'explorador':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--gold)" d="M35 75 L49 72 L60 85 L71 72 L85 75 L89 99 Q79 108 63 107 L60 99 L57 107 Q41 108 31 99 Z" />
          <path fill="var(--coin)" d="M44 75 L49 88 L56 82 L49 72 Z M76 75 L71 88 L64 82 L71 72 Z" />
          <path fill="var(--gold)" d="M37 90 H49 V98 H37 Z M71 90 H83 V98 H71 Z" />
          <path fill="none" d="M37 92 H49 M71 92 H83" />
          <circle fill="var(--good)" stroke="none" cx="75" cy="85" r="3" />
        </g>
      );
    case 'festival':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--envelope)" d="M35 75 Q60 66 85 75 L89 99 Q60 113 31 99 Z" />
          <path fill="none" stroke="var(--gold)" strokeWidth="2.5" d="M60 76 V106 M35 100 Q60 110 85 100" />
          <path fill="var(--envelope-dark)" stroke="var(--gold)" d="M46 74 L60 82 L74 74 L71 70 H49 Z" />
          <path fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" d="M55 87 H65 M55 95 H65" />
          <circle fill="var(--gold)" stroke="none" cx="60" cy="87" r="2.5" />
          <circle fill="var(--gold)" stroke="none" cx="60" cy="95" r="2.5" />
        </g>
      );
    case 'lluvia':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--gold)" d="M35 74 Q60 65 85 74 L91 102 Q60 114 29 102 Z" />
          <path fill="var(--coin)" d="M42 73 L49 87 L60 79 L71 87 L78 73 Z" />
          <path fill="none" stroke="var(--coin-edge)" d="M60 81 V107 M36 93 Q42 98 48 93 M72 93 Q78 98 84 93" />
          <circle fill="var(--coin-edge)" stroke="none" cx="63.5" cy="89" r="1.6" />
          <circle fill="var(--coin-edge)" stroke="none" cx="63.5" cy="98" r="1.6" />
          <path fill="none" stroke="var(--panda-fur)" strokeWidth="2.5" d="M33 100 Q60 110 87 100" />
        </g>
      );
    case 'pijama':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--shield)" d="M35 75 Q60 67 85 75 L89 99 Q60 114 31 99 Z" />
          <path fill="none" stroke="var(--panda-fur)" strokeWidth="2" d="M45 75 L53 84 L60 79 L67 84 L75 75 M60 80 V108" />
          <path fill="var(--gold)" stroke="none" d="M43 88 L44.5 92 L49 92 L45.5 95 L47 99 L43 96.5 L39 99 L40.5 95 L37 92 H41.5 Z" />
          <path fill="var(--gold)" stroke="none" d="M78 89 A5.5 5.5 0 1 0 81 98 A5.5 5.5 0 0 1 78 89 Z" />
          <circle fill="var(--panda-fur)" stroke="none" cx="63" cy="88" r="1.4" />
          <circle fill="var(--panda-fur)" stroke="none" cx="63" cy="98" r="1.4" />
        </g>
      );
    default:
      return null;
  }
}

export function OutfitHead({ outfit }: Props) {
  switch (outfit) {
    case 'explorador':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--gold)" d="M36 22 L40 11 Q60 4 80 11 L84 22 Z" />
          <path fill="var(--good)" d="M38 17 Q60 22 82 17 L84 23 H36 Z" />
          <path fill="var(--gold)" d="M29 22 Q60 28 91 22 L94 27 Q60 35 26 27 Z" />
          <path fill="none" stroke="var(--coin-edge)" d="M46 12 Q60 9 74 12" />
        </g>
      );
    case 'festival':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--envelope)" d="M40 21 Q40 6 60 6 Q80 6 80 21 Z" />
          <path fill="none" stroke="var(--gold)" d="M60 7 V20" />
          <path fill="var(--envelope-dark)" stroke="var(--gold)" strokeWidth="2" d="M39 20 Q60 24 81 20 V26 Q60 30 39 26 Z" />
          <circle fill="var(--gold)" cx="60" cy="6" r="3" />
          <path fill="var(--gold)" stroke="none" d="M60 20 L64 24 L60 28 L56 24 Z" />
        </g>
      );
    case 'lluvia':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--gold)" d="M37 23 Q39 5 60 5 Q81 5 83 23 Z" />
          <path fill="none" stroke="var(--coin)" strokeWidth="2" d="M60 7 V22" />
          <path fill="var(--gold)" d="M36 21 Q60 27 84 21 L94 30 Q60 37 26 30 Z" />
          <path fill="none" stroke="var(--panda-fur)" strokeWidth="2" strokeLinecap="round" d="M43 15 Q47 10 51 10" />
          <path fill="none" stroke="var(--coin-edge)" d="M33 28 Q60 33 87 28" />
        </g>
      );
    case 'pijama':
      return (
        <g stroke="var(--panda-line)" strokeWidth="1.6" strokeLinejoin="round">
          <path fill="var(--shield)" d="M36 23 Q44 3 67 5 Q88 5 91 27 L78 20 Q69 27 36 23 Z" />
          <path fill="var(--gold)" stroke="none" d="M60 9 L61.4 13 L65.5 13 L62.2 15.5 L63.5 19.5 L60 17 L56.5 19.5 L57.8 15.5 L54.5 13 H58.6 Z" />
          <path fill="var(--panda-fur)" d="M36 21 Q58 26 79 20 L81 26 Q59 33 34 27 Z" />
          <circle fill="var(--panda-fur)" cx="91" cy="28" r="5" />
        </g>
      );
    default:
      return null;
  }
}
