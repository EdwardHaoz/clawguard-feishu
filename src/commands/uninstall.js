/**
 * ClawGuard one-click uninstall command
 * @description Clean uninstall using OpenClaw official plugins system
 * @purpose Remove plugin from plugins.load.paths and plugins.entries
 *
 * Uninstall strategy:
 * 1. Remove plugin path from plugins.load.paths
 * 2. Delete plugins.entries.clawguard-feishu node
 * 3. Destroy sandbox directory completely
 * 4. Delete install log file
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { logger } = require('../utils/logger');

// Upstream monitor file paths (by priority)
const UPSTREAM_MONITOR_PATHS = [
  '/opt/homebrew/lib/node_modules/openclaw/extensions/feishu/src/monitor.account.ts',
  '/usr/local/lib/node_modules/openclaw/extensions/feishu/src/monitor.account.ts'
];

// CLI argument parsing
const args = process.argv.slice(3).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const parts = arg.slice(2).split('=');
    acc[parts[0]] = parts.length > 1 ? parts[1] : true; 
  }
  return acc;
}, {});

// Plugin constants
const PLUGIN_NAME = 'clawguard-feishu';

/**
 * Restore upstream source code
 * @description Remove CLAWGUARD-FEISHU injection from OpenClaw Feishu monitor file
 */
function restoreUpstreamSource() {
  let targetFile = null;

  // Find existing monitor file
  for (const filePath of UPSTREAM_MONITOR_PATHS) {
    if (fs.existsSync(filePath)) {
      targetFile = filePath;
      break;
    }
  }

  if (!targetFile) {
    console.log('[ClawGuard-Feishu] No upstream file found to restore');
    return false;
  }

  try {
    let content = fs.readFileSync(targetFile, 'utf-8');

    // Check if injection exists (check for both old and new markers)
    if (!content.includes('CLAWGUARD INJECT START') && !content.includes('CLAWGUARD-FEISHU INJECT START')) {
      console.log('[ClawGuard-Feishu] No injection found, skipping restore');
      return true;
    }

    // Remove injection block using dual regex (clean both old and new versions)
    const cleanContent = content
      .replace(/\s*\/\/ --- CLAWGUARD INJECT START ---[\s\S]*?\/\/ --- CLAWGUARD INJECT END ---\s*/g, '')
      .replace(/\s*\/\/ --- CLAWGUARD-FEISHU INJECT START ---[\s\S]*?\/\/ --- CLAWGUARD-FEISHU INJECT END ---\s*/, '');

    fs.writeFileSync(targetFile, cleanContent, 'utf-8');
    console.log('[ClawGuard-Feishu] Upstream dependency restored successfully: ' + targetFile);
    return true;
  } catch (error) {
    if (error.code === 'EACCES') {
      console.error('[ClawGuard-Feishu] Permission denied: ' + targetFile);
      console.error('  Please run with sudo: sudo npx clawguard-feishu uninstall');
      return false;
    }
    throw error;
  }
}

/**
 * Get OpenClaw user directory
 * @description Use os.homedir() to locate ~/.openclaw
 * @returns User directory path
 */
function getOpenClawDir() {
  if (args.root) {
    return path.resolve(args.root);
  }
  return path.join(os.homedir(), '.openclaw');
}

/**
 * Locate sandbox directory
 * @returns Sandbox path or null
 */
function locateSandbox(openclawDir) {
  const sandboxRoot = path.join(openclawDir, 'plugins', PLUGIN_NAME);

  if (!fs.existsSync(sandboxRoot)) {
    return null;
  }

  return sandboxRoot;
}

/**
 * Clean up config file
 * @description Remove plugin from plugins.load.paths and plugins.entries
 * @param configFile - Config file path
 * @param pluginPath - Plugin path to remove from paths array
 */
function cleanupConfig(configFile, pluginPath) {
  if (!fs.existsSync(configFile)) {
    return true;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    let modified = false;

    // Remove from plugins.load.paths array (only remove this plugin's path)
    if (config.plugins && config.plugins.load && config.plugins.load.paths) {
      const paths = config.plugins.load.paths;
      const pathIndex = paths.indexOf(pluginPath);
      if (pathIndex > -1) {
        paths.splice(pathIndex, 1);
        modified = true;
      }
    }

    // Remove from plugins.entries (only remove this plugin's entry)
    if (config.plugins && config.plugins.entries && config.plugins.entries[PLUGIN_NAME]) {
      delete config.plugins.entries[PLUGIN_NAME];
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Clean up sandbox directory
 * @description Completely remove sandbox directory (no residual)
 * @param sandboxRoot - Sandbox directory
 */
function cleanupSandbox(sandboxRoot, keepLogs) {
  if (!fs.existsSync(sandboxRoot)) {
    return;
  }

  if (keepLogs) {
    // Remove non-log files
    const files = fs.readdirSync(sandboxRoot);
    for (const file of files) {
      if (file !== 'audit.log') {
        fs.rmSync(path.join(sandboxRoot, file), { recursive: true, force: true });
      }
    }
    console.log('  [Note] The audit log, audit.log, has been retained as required.');
  } else {
    // Remove entire sandbox directory
    fs.rmSync(sandboxRoot, { recursive: true, force: true });

    // Clean up empty parent directories
    const pluginsDir = path.dirname(sandboxRoot);
    try {
      const remaining = fs.readdirSync(pluginsDir);
      if (remaining.length === 0) {
        fs.rmSync(pluginsDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore directory deletion errors
    }
  }
}
/**
 * Main uninstall function
 */
async function uninstall() {
  // Terminal: minimal output
  console.log('[ClawGuard-Feishu] Uninstalling...');

  try {
    // 1. Locate OpenClaw user directory
    const openclawDir = getOpenClawDir();

    if (!fs.existsSync(openclawDir)) {
      console.error('[ClawGuard-Feishu] OpenClaw directory not found:', openclawDir);
      process.exit(1);
    }

    // 2. Locate sandbox directory
    const sandboxRoot = locateSandbox(openclawDir);

    if (!sandboxRoot) {
      console.log('[ClawGuard-Feishu] Not installed');
      process.exit(1);
    }

    // 3. Clean up config file
    const configFile = path.join(openclawDir, 'openclaw.json');
    cleanupConfig(configFile, sandboxRoot);

    // 4. Clean up sandbox completely
    cleanupSandbox(sandboxRoot, args.keepLogs);

    // 5. Restore upstream source code
    restoreUpstreamSource();

    // 7. Delete install log file (this plugin's unique log file)
    const logPath = logger.getInstallLogPath();
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }

    // Terminal: success message
    console.log('[ClawGuard-Feishu] Uninstalled successfully');
    console.log('  Removed: ' + sandboxRoot);
    console.log('  Next: openclaw gateway restart');

  } catch (error) {
    console.error('[ClawGuard-Feishu] Uninstall failed:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export module
module.exports = { uninstall };
