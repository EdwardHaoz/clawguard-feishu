/**
 * Audit Log Reader Module
 * @description Reads and parses JSONL audit logs for the CLI
 * @purpose Provide querying and filtering capabilities for npx clawguard-feishu logs
 */

const fs = require('fs');
const path = require('path');

/**
 * Get audit log path
 * @description Determine log file location from env or default path
 * @returns Log file path
 */
function getAuditLogPath() {
  if (process.env.CLAWGUARD_AUDIT_LOG) {
    return process.env.CLAWGUARD_AUDIT_LOG;
  }
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  return path.join(homeDir, '.openclaw', 'plugins', 'clawguard-feishu', 'audit.log');
}

/**
 * Audit log API (Read-only for CLI)
 */
const audit = {
  /**
   * Read and filter audit logs
   * @param options - Read options (tail, action, taskId, userType, result)
   * @returns Array of parsed log entries
   */
  readLogs(options = {}) {
    const logPath = getAuditLogPath();

    if (!fs.existsSync(logPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n');

      let logs = lines
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(log => log !== null);

      // Filter by action type
      if (options.action) {
        logs = logs.filter(log => log.action === options.action);
      }

      // Filter by taskId
      if (options.taskId) {
        logs = logs.filter(log => log.taskId === options.taskId);
      }

      // Filter by user type (support both old and new field names)
      if (options.userType) {
        logs = logs.filter(log => log.userType === options.userType || log.user_type === options.userType);
      }

      // Filter by result
      if (options.result) {
        logs = logs.filter(log => log.result === options.result);
      }

      // Limit return count
      if (options.tail && options.tail > 0) {
        logs = logs.slice(-options.tail);
      }

      // Filter by start time
      if (options.since) {
        const sinceTime = new Date(options.since).getTime();
        logs = logs.filter(log => new Date(log.timestamp).getTime() >= sinceTime);
      }

      return logs;
    } catch (error) {
      console.error('[ERROR] Audit log read failed:', error.message);
      return [];
    }
  },

  /**
   * Get log file path
   */
  getLogPath() {
    return getAuditLogPath();
  }
};

module.exports = { audit };