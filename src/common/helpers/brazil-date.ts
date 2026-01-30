const BRAZIL_OFFSET = '-03:00';
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formata um Date para string ISO-like com offset fixo do Brasil (-03:00).
 *
 * Observação: Date não “tem formato”. Essa função gera uma STRING no fuso -03:00.
 * Ela é estável independente do timezone do servidor (usa UTC internamente).
 *
 * Ex: 2026-01-30T18:00:00-03:00
 */
export function formatBrazil(date: Date): string {
  // Para obter o "horário de relógio" em -03:00, pegamos o UTC e subtraímos 3h
  // e então formatamos usando getters UTC.
  const br = new Date(date.getTime() - BRAZIL_OFFSET_MS);

  const yyyy = br.getUTCFullYear();
  const mm = pad2(br.getUTCMonth() + 1);
  const dd = pad2(br.getUTCDate());
  const hh = pad2(br.getUTCHours());
  const mi = pad2(br.getUTCMinutes());
  const ss = pad2(br.getUTCSeconds());

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${BRAZIL_OFFSET}`;
}

/**
 * Interpreta uma string como horário do Brasil (-03:00) e retorna um Date.
 *
 * - Se a string já tiver timezone (terminar com 'Z' ou ±HH:MM), respeita ela.
 * - Se NÃO tiver timezone, assume -03:00.
 *
 * Aceita:
 * - "2026-01-30T18:00:00"
 * - "2026-01-30 18:00:00"
 * - "2026-01-30T18:00:00-03:00"
 * - "2026-01-30T21:00:00Z"
 */
export function parseBrazilDateTime(value: string): Date {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Data/hora vazia');
  }

  // Normaliza "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');

  // Detecta se já existe timezone no final (Z ou ±HH:MM ou ±HHMM)
  const hasTz = /([zZ]|[+\-]\d{2}:\d{2}|[+\-]\d{4})$/.test(normalized);
  const withTz = hasTz ? normalized : `${normalized}${BRAZIL_OFFSET}`;

  const d = new Date(withTz);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data/hora inválida: "${value}"`);
  }

  return d;
}
