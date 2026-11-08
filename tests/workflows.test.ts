// Los workflows de GitHub Actions se publican sin pasar por el build: si un archivo tiene un error
// de formato, GitHub no lo puede leer y deja de correr (por ejemplo, dejan de salir los recordatorios).
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Step = { run?: string; uses?: string; env?: Record<string, string> };
type Job = { 'runs-on'?: string; if?: string; env?: Record<string, string>; steps?: Step[] };
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

    it('no le pasa todos los secretos a un script', () => {
      // GitHub marca toJSON(secrets) como posiblemente malicioso y frena el workflow hasta que alguien lo apruebe.
      expect(text).not.toMatch(/toJSON\(\s*secrets\s*\)/);
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

const secretNames = (env?: Record<string, string>) =>
  Object.values(env ?? {}).flatMap((v) => [...String(v).matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));

describe('workflow recordatorios.yml: secretos', () => {
  const wf = parse(fs.readFileSync(path.join(dir, 'recordatorios.yml'), 'utf8')) as Workflow;

  it('solo usa los secretos de los recordatorios', () => {
    const used = Object.values(wf.jobs ?? {}).flatMap((job) => [...secretNames(job.env), ...(job.steps ?? []).flatMap((st) => secretNames(st.env))]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(name, `secreto inesperado: ${name}`).toMatch(/^DANZI_RECORDATORIO(_[23])?$/);
  });

  it('no deja los secretos al alcance de la instalación de paquetes', () => {
    for (const [id, job] of Object.entries(wf.jobs ?? {})) {
      expect(secretNames(job.env), `${id}: secretos en el env del trabajo`).toEqual([]);
      for (const st of job.steps ?? []) if (st.run?.includes('npm ci')) expect(secretNames(st.env), `${id}: secretos en npm ci`).toEqual([]);
    }
  });
});

describe('workflow android.yml: firma de la APK', () => {
  const wf = parse(fs.readFileSync(path.join(dir, 'android.yml'), 'utf8')) as Workflow;
  const jobs = wf.jobs ?? {};

  it('solo usa la llave de firma, y solo en el paso que compila la APK normal', () => {
    for (const [id, job] of Object.entries(jobs)) {
      expect(secretNames(job.env), `${id}: secretos en el env del trabajo`).toEqual([]);
      for (const st of job.steps ?? []) {
        const names = secretNames(st.env);
        for (const name of names) expect(name, `${id}: secreto inesperado`).toBe('DANZI_FIRMA_ANDROID');
        if (names.length) expect(st.run, `${id}: la llave llega a un paso que no compila la APK`).toMatch(/gradlew assembleRelease/);
      }
    }
  });

  it('la versión de pruebas de los pull requests no recibe secretos', () => {
    expect(jobs.pruebas?.if).toContain("github.event_name == 'pull_request'");
    expect((jobs.pruebas?.steps ?? []).flatMap((st) => secretNames(st.env))).toEqual([]);
  });

  it('comprueba la huella de la firma antes de publicar', () => {
    const steps = jobs.publicar?.steps ?? [];
    const check = steps.findIndex((st) => st.run?.includes('firma-sha256.txt'));
    const publish = steps.findIndex((st) => st.run?.includes('gh release create'));
    expect(check, 'falta el paso que compara la huella').toBeGreaterThan(-1);
    expect(publish, 'publica antes de comprobar la huella').toBeGreaterThan(check);
  });
});
