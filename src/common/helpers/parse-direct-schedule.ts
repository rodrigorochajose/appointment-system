import { formatBrazil, parseBrazilDateTime } from './brazil-date';

const DIRECT_SCHEDULE_REGEX = /^(\d{2})\/(\d{2})\s(\d{2}):(\d{2})$/;

export type ParsedDirectSchedule = {
  date: Date;
  iso: string;
};

/**
 * Parseia entrada no formato "DD/MM HH:mm" assumindo fuso do Brasil.
 *
 * - Valida dia/mês/hora reais (rejeita 99/99, 25:99, etc).
 * - Assume ano corrente; se a data resultante já passou, avança para o próximo ano.
 * - Retorna null para entradas inválidas.
 */
export function parseDirectScheduleInput(
  input: string,
  now: Date = new Date(),
): ParsedDirectSchedule | null {
  const match = DIRECT_SCHEDULE_REGEX.exec(input);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23) return null;
  if (minute > 59) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const currentYear = Number(formatBrazil(now).slice(0, 4));

  const build = (year: number): Date | null => {
    try {
      const d = parseBrazilDateTime(
        `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`,
      );
      const brStr = formatBrazil(d);
      const expected = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
      if (!brStr.startsWith(expected)) return null;
      return d;
    } catch {
      return null;
    }
  };

  let date = build(currentYear);
  if (!date) return null;

  if (date.getTime() < now.getTime()) {
    const next = build(currentYear + 1);
    if (!next) return null;
    date = next;
  }

  return { date, iso: date.toISOString() };
}

const DAY_REGEX = /^(\d{2})\/(\d{2})$/;

/**
 * Parseia entrada no formato "DD/MM" assumindo fuso do Brasil e retorna o
 * início do dia (00:00) correspondente.
 *
 * - Valida dia/mês reais (rejeita 99/99, 31/02, etc).
 * - Assume ano corrente; se o dia já passou, avança para o próximo ano
 *   (comparação por data, não por hora — o dia de hoje continua válido).
 * - Retorna null para entradas inválidas.
 */
export function parseDayInput(input: string, now: Date = new Date()): Date | null {
  const match = DAY_REGEX.exec(input.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const currentYear = Number(formatBrazil(now).slice(0, 4));
  const todayYmd = formatBrazil(now).slice(0, 10);

  const build = (year: number): Date | null => {
    try {
      const d = parseBrazilDateTime(`${year}-${pad(month)}-${pad(day)}T00:00:00`);
      // Rejeita datas que "transbordam" (ex.: 31/02 vira 03/03).
      if (!formatBrazil(d).startsWith(`${year}-${pad(month)}-${pad(day)}`)) return null;
      return d;
    } catch {
      return null;
    }
  };

  let date = build(currentYear);
  if (!date) return null;

  if (formatBrazil(date).slice(0, 10) < todayYmd) {
    const next = build(currentYear + 1);
    if (!next) return null;
    date = next;
  }

  return date;
}
