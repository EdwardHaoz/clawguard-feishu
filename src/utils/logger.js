/**
 * Logger utility
 * @description Terminal and file logging with colored output
 * @purpose Unified logging interface for enhanced readability
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Log level enumeration
 */
const LogLevel = {
  INFO: 'info',
  SUCCESS: 'success',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug'
};

/**
 * Get log directory path
 * @returns ~/.openclaw/plugins/clawguard-feishu/
 */
function getLogDir() {
  return path.join(os.homedir(), '.openclaw', 'plugins', 'clawguard-feishu');
}

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
  const logDir = getLogDir();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

/**
 * Get install log file path
 * @returns ~/.openclaw/plugins/clawguard-feishu/install.log
 */
function getInstallLogPath() {
  return path.join(getLogDir(), 'install.log');
}

/**
 * Write to install log file
 * @param level - Log level
 * @param message - Log message
 * @param detail - Additional details (optional)
 */
function writeToFile(level, message, detail) {
  const timestamp = new Date().toISOString();
  const detailStr = detail ? ` | ${detail}` : '';
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${detailStr}\n`;

  try {
    ensureLogDir();
    fs.appendFileSync(getInstallLogPath(), logLine);
  } catch (e) {
    // Silently fail if log writing fails
  }
}

/**
 * Colored log output
 */
const logger = {
  /**
   * Info log (blue)
   * @param message - Log message
   * @param detail - Additional details (optional)
   */
  info(message, detail) {
    console.log(chalk.blue('[INFO] ' + message));
    if (detail) {
      console.log(chalk.gray('  ' + detail));
    }
    writeToFile('info', message, detail);
  },

  /**
   * Success log (green)
   * @param message - Log message
   * @param detail - Additional details (optional)
   */
  success(message, detail) {
    console.log(chalk.green('[SUCCESS] ' + message));
    if (detail) {
      console.log(chalk.gray('  ' + detail));
    }
    writeToFile('success', message, detail);
  },

  /**
   * Warning log (yellow)
   * @param message - Log message
   * @param detail - Additional details (optional)
   */
  warn(message, detail) {
    console.log(chalk.yellow('[WARN] ' + message));
    if (detail) {
      console.log(chalk.gray('  ' + detail));
    }
    writeToFile('warn', message, detail);
  },

  /**
   * Error log (red)
   * @param message - Log message
   * @param detail - Additional details (optional)
   */
  error(message, detail) {
    console.log(chalk.red('[ERROR] ' + message));
    if (detail) {
      console.log(chalk.gray('  ' + detail));
    }
    writeToFile('error', message, detail);
  },

  /**
   * Debug log (gray, shown only in debug mode)
   * @param message - Log message
   * @param detail - Additional details (optional)
   */
  debug(message, detail) {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG] ' + message));
      if (detail) {
        console.log(chalk.gray('  ' + detail));
      }
      writeToFile('debug', message, detail);
    }
  },

  /**
   * Terminal-only log (no file output)
   * @param message - Log message
   */
  term(message) {
    console.log(message);
  },

  /**
   * Divider line
   */
  divider() {
    console.log(chalk.gray('----------------------------------------'));
  },

  /**
   * Title
   * @param title - Title text
   */
  title(title) {
    console.log(chalk.bold.cyan('\n' + title));
    console.log(chalk.gray('='.repeat(title.length)));
  },

  /**
   * List item
   * @param text - List text
   * @param indent - Indent level (default 2)
   */
  listItem(text, indent = 2) {
    const prefix = ' '.repeat(indent) + '- ';
    console.log(chalk.white(prefix + text));
  },

  /**
   * Code block
   * @param code - Code content
   * @param lang - Language identifier (optional)
   */
  code(code, lang) {
    const prefix = lang ? `${lang}: ` : '';
    console.log(chalk.gray(prefix + code));
  },

  /**
   * Progress indicator
   * @param current - Current progress
   * @param total - Total count
   * @param message - Progress message
   */
  progress(current, total, message) {
    const percent = Math.round((current / total) * 100);
    const bar = '#'.repeat(Math.floor(percent / 5)) + '-'.repeat(20 - Math.floor(percent / 5));
    console.log(chalk.cyan(`[${bar}] ${percent}% ${message}`));
  },

  /**
   * Confirmation prompt
   * @param message - Confirmation message
   * @returns User confirmation result
   */
  async confirm(message) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.yellow(`[CONFIRM] ${message} (y/N): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  },

  /**
   * Get install log path
   */
  getInstallLogPath,

  /**
   * Clear install log
   */
  clearInstallLog() {
    const logPath = getInstallLogPath();
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  }
};

module.exports = { logger, LogLevel };
