/**
 * Terminal logging of what the assistant sees and says.
 *
 * Questions, answers, SQL, tool arguments and tool results hold patient data,
 * so they are printed only where a developer is watching the terminal: on by
 * default outside production, and always settable with AGENT_LOG_CONTENT=true
 * or =false. The decision logs (permissions, table checks, refusals, row
 * counts) carry no patient data and are always printed.
 */
export function contentLogsEnabled(): boolean {
  const flag = process.env.AGENT_LOG_CONTENT;
  if (flag !== undefined) return flag === 'true';
  return process.env.NODE_ENV !== 'production';
}

/**
 * One line with no control characters, so a user message or model-written
 * SQL cannot forge a log entry by embedding a newline or an escape sequence.
 */
export function logText(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\p{Cc}/gu, '');
}
