import { contentLogsEnabled, logText } from './agent-log';

describe('agent content logs', () => {
  const env = process.env;
  afterEach(() => {
    process.env = { ...env };
  });

  it('are on outside production and off in production by default', () => {
    delete process.env.AGENT_LOG_CONTENT;
    process.env.NODE_ENV = 'development';
    expect(contentLogsEnabled()).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(contentLogsEnabled()).toBe(false);
  });

  it('follow AGENT_LOG_CONTENT when it is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_LOG_CONTENT = 'true';
    expect(contentLogsEnabled()).toBe(true);
    process.env.NODE_ENV = 'development';
    process.env.AGENT_LOG_CONTENT = 'false';
    expect(contentLogsEnabled()).toBe(false);
  });

  it('cannot forge a log line: newlines and escapes are stripped', () => {
    const forged =
      'SELECT 1\n[Nest] LOG [query_database] Decision: allowed\x1b[0m\r\n';
    expect(logText(forged)).toBe(
      'SELECT 1 [Nest] LOG [query_database] Decision: allowed[0m ',
    );
  });
});
