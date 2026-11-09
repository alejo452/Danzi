// Los workflows de GitHub Actions se publican sin pasar por el build: si un archivo tiene un error
// de formato, GitHub no lo puede leer y deja de correr (por ejemplo, dejan de salir los recordatorios).
import { execFileSync } from 'node:child_process';
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

  it('lee la huella con cualquier versión de apksigner', () => {
    // build-tools 36 escribe «Signer #1 certificate SHA-256 digest: …»; build-tools 37, «V2 Signer: certificate …».
    const run = (jobs.publicar?.steps ?? []).find((st) => st.run?.includes('firma-sha256.txt'))?.run ?? '';
    const sed = run.match(/sed -n '([^']+)'/)?.[1];
    expect(sed, 'falta el sed que lee la huella').toBeTruthy();
    const digest = 'ab'.repeat(32);
    for (const out of [
      `Signer #1 certificate DN: CN=Danzi\nSigner #1 certificate SHA-256 digest: ${digest}\nSigner #1 certificate SHA-1 digest: 00\n`,
      `V2 Signer: certificate DN: CN=Danzi\nV2 Signer: certificate SHA-256 digest: ${digest}\nV3 Signer: certificate SHA-256 digest: ${digest}\n`,
    ]) {
      const found = execFileSync('sed', ['-n', sed!], { input: out, encoding: 'utf8' }).split('\n').filter(Boolean);
      expect([...new Set(found)]).toEqual([digest]);
    }
  });

  it('comprueba la huella de la firma antes de publicar', () => {
    const steps = jobs.publicar?.steps ?? [];
    const check = steps.findIndex((st) => st.run?.includes('firma-sha256.txt'));
    const publish = steps.findIndex((st) => st.run?.includes('gh release create'));
    expect(check, 'falta el paso que compara la huella').toBeGreaterThan(-1);
    expect(publish, 'publica antes de comprobar la huella').toBeGreaterThan(check);
  });
});

describe('workflow android.yml: actualización automática', () => {
  const wf = parse(fs.readFileSync(path.join(dir, 'android.yml'), 'utf8')) as Workflow;
  const jobs = wf.jobs ?? {};

  it('la app web sabe su número de versión, el mismo de la APK', () => {
    for (const id of ['pruebas', 'publicar']) {
      const build = (jobs[id]?.steps ?? []).find((st) => st.run?.trim() === 'npm run build');
      expect(build?.env?.DANZI_VERSION, `${id}: falta DANZI_VERSION al compilar`).toBe('${{ github.run_number }}');
    }
  });

  it('publica la parte web y su aviso junto a la APK', () => {
    const steps = jobs.publicar?.steps ?? [];
    const prepare = steps.findIndex((st) => st.run?.includes('scripts/update-manifest.mjs'));
    const publish = steps.findIndex((st) => st.run?.includes('gh release create'));
    expect(prepare, 'falta el paso que prepara actualizacion.json').toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(prepare);
    expect(steps[prepare].run).toContain('danzi-web.zip');
    for (const asset of ['danzi.apk', 'danzi-web.zip', 'actualizacion.json']) expect(steps[publish].run).toContain(` ${asset}`);
  });
});
