// Los workflows de GitHub Actions se publican sin pasar por el build: si un archivo tiene un error
// de formato, GitHub no lo puede leer y deja de correr (por ejemplo, dejan de salir los recordatorios).
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Step = { run?: string; uses?: string };
type Job = { 'runs-on'?: string; if?: string; steps?: Step[] };
type Workflow = { name?: string; on?: { schedule?: { cron: string }[] } & Record<string, unknown>; jobs?: Record<string, Job> };

const dir = '.github/workflows';
const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

for (const file of files) {
  describe(`workflow ${file}`, () => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');

    it('es YAML válido', () => {
      expect(() => parse(text, { strict: true })).not.toThrow();
    });

    it('tiene nombre, eventos y trabajos con pasos', () => {
      const wf = parse(text) as Workflow;
      expect(typeof wf.name, 'falta name').toBe('string');
      expect(wf.on, 'falta on').toBeTruthy();
      expect(Object.keys(wf.jobs ?? {}).length, 'no tiene trabajos').toBeGreaterThan(0);
      for (const [id, job] of Object.entries(wf.jobs ?? {})) {
        expect(job['runs-on'], `${id}: falta runs-on`).toBeTruthy();
        expect(job.steps?.length, `${id}: no tiene pasos`).toBeGreaterThan(0);
        for (const step of job.steps ?? []) expect(step.run ?? step.uses, `${id}: un paso no tiene run ni uses`).toBeTruthy();
      }
    });

    it('solo compara github.event.schedule con horarios que existen', () => {
      const wf = parse(text) as Workflow;
      const crons = new Set((wf.on?.schedule ?? []).map((s) => s.cron));
      for (const [id, job] of Object.entries(wf.jobs ?? {})) {
        for (const [, cron] of (job.if ?? '').matchAll(/github\.event\.schedule\s*==\s*'([^']+)'/g)) {
          expect(crons.has(cron), `${id}: el horario '${cron}' no está en on.schedule`).toBe(true);
        }
      }
    });
  });
}
