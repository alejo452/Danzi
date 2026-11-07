import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Clase extra para el contenido. */
  className?: string;
  /** Clase extra para el <dialog> (por ejemplo, «celebration»). */
  kind?: string;
};

/**
 * Hoja que sube desde abajo. Es un <dialog> modal: guarda el foco adentro y se cierra con Esc,
 * con el botón «Cerrar» o tocando afuera.
 */
export function Sheet({ open, onClose, title, children, className, kind }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet${kind ? ` ${kind}` : ''}`}
      aria-labelledby={id}
      onClose={() => open && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        // El foco empieza en la hoja (no en «Cerrar») para que el lector de pantalla lea el título.
        <div className={`sheet-body${className ? ` ${className}` : ''}`} tabIndex={-1} autoFocus>
          <span className="sheet-grip" aria-hidden="true" />
          <header className="sheet-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="icon-link" aria-label="Cerrar" onClick={onClose}>
              <IconClose size={20} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
