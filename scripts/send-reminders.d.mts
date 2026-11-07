// Tipos de scripts/send-reminders.mjs, para usarlo desde las pruebas en TypeScript.
import type { ReminderCode } from '../src/lib/reminderCode';

export declare const RUN_MINUTE: number;
export declare function decodeReminderCode(text: string): ReminderCode;
export declare function codesFromSecrets(secrets: Record<string, unknown> | null | undefined): { name: string; text: string }[];
export declare function slotHour(now: Date, timeZone: string): number;
export declare function isDue(code: ReminderCode, now: Date): boolean;
export declare function vapidSubject(code: ReminderCode): string;
export declare function sendOptions(code: ReminderCode): {
  vapidDetails: { subject: string; publicKey: string; privateKey: string };
  TTL: number;
  urgency: string;
  topic: string;
};
export declare function describePushError(e: unknown, code: ReminderCode): string;
