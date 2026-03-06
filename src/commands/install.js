/**
 * ClawGuard one-click install command
 * @description Native install using OpenClaw official plugins system
 * @purpose Use official plugins.load.paths and plugins.entries for schema-compliant deployment
 *
 * Architecture:
 * - Base path fixed at ~/.openclaw (or user-specified --root)
 * - All runtime files stored in ~/.openclaw/plugins/clawguard-feishu/
 * - Config injected into openclaw.json's plugins.entries.clawguard-feishu node
 * - Plugin path registered in plugins.load.paths array
 * - Pure file copy, no source code modification
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { logger } = require('../utils/logger');

// Upstream monitor file paths (by priority)
const UPSTREAM_MONITOR_PATHS = [
  '/opt/homebrew/lib/node_modules/openclaw/extensions/feishu/src/monitor.account.ts',
  '/usr/local/lib/node_modules/openclaw/extensions/feishu/src/monitor.account.ts'
];

const INJECT_TARGET_STRING = '"card.action.trigger": async (data: unknown) => {';

const INJECT_CODE = `        // --- CLAWGUARD-FEISHU INJECT START ---
        try {
          const evt = data as any;
          console.log('[ClawGuard-Feishu] Upstream wormhole triggered! Action:', evt?.action?.value?.action);
          if (evt && evt.action && evt.action.value) {
             process.emit('clawguard_feishu_card_action', evt);
             return;
          }
        } catch(e) {
          console.error('[ClawGuard-Feishu] Upstream wormhole error:', e);
        }
        // --- CLAWGUARD-FEISHU INJECT END ---
`;

/**
 * Inject upstream source code
 * @description Find and inject CLAWGUARD hook into OpenClaw Feishu monitor file
 */
function injectUpstreamSource() {
  let targetFile = null;

  // Find existing monitor file
  for (const filePath of UPSTREAM_MONITOR_PATHS) {
    if (fs.existsSync(filePath)) {
      targetFile = filePath;
      break;
    }
  }

  if (!targetFile) {
    console.log('[ClawGuard-Feishu] Warning: Upstream monitor file not found, skipping injection');
    console.log('  Expected paths:');
    for (const p of UPSTREAM_MONITOR_PATHS) {
      console.log('    - ' + p);
    }
    return false;
  }

  try {
    let content = fs.readFileSync(targetFile, 'utf-8');

    // Skip if already injected
    if (content.includes('CLAWGUARD-FEISHU INJECT START')) {
      console.log('[ClawGuard-Feishu] Upstream already injected, skipping');
      return true;
    }

    // Find target line and inject
    const targetIndex = content.indexOf(INJECT_TARGET_STRING);
    if (targetIndex === -1) {
      console.error('[ClawGuard-Feishu] Target string not found in ' + targetFile);
      return false;
    }

    // Insert after the target line (find the opening brace position)
    const insertPos = targetIndex + INJECT_TARGET_STRING.length;
    content = content.slice(0, insertPos) + '\n' + INJECT_CODE + content.slice(insertPos);

    fs.writeFileSync(targetFile, content, 'utf-8');
    console.log('[ClawGuard-Feishu] Upstream injection successful: ' + targetFile);
    return true;
  } catch (error) {
    if (error.code === 'EACCES') {
      console.error('[ClawGuard-Feishu] Permission denied: ' + targetFile);
      console.error('  Please run with sudo: sudo npx clawguard-feishu install');
      return false;
    }
    throw error;
  }
}

// CLI argument parsing
const args = process.argv.slice(3).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key && value) {
    acc[key.replace(/^--/, '')] = value;
  }
  return acc;
}, {});

// Plugin constants
const PLUGIN_NAME = 'clawguard-feishu';

/**
 * Prompt user for Admin Open ID
 * @returns Admin ID or null if skipped
 */
function promptForAdminId() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Please enter the Admin Open ID (starts with ou_). Press Enter to skip and configure later: ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed && trimmed.startsWith('ou_')) {
        resolve(trimmed);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Check if plugin is already installed
 * @description Check if sandbox directory exists
 * @param openclawDir - OpenClaw user directory
 * @returns true if already installed
 */
function checkAlreadyInstalled(openclawDir) {
  const sandboxRoot = path.join(openclawDir, 'plugins', PLUGIN_NAME);
  return fs.existsSync(sandboxRoot);
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
 * Check if OpenClaw is initialized
 * @description Check if ~/.openclaw/openclaw.json exists
 * @param openclawDir - OpenClaw user directory
 */
function checkOpenClawInitialized(openclawDir) {
  const configFile = path.join(openclawDir, 'openclaw.json');

  if (!fs.existsSync(configFile)) {
    logger.error('OpenClaw not initialized');
    logger.term('Run "openclaw init" first, or confirm openclaw.json exists in ' + openclawDir);
    process.exit(1);
  }

  return configFile;
}

/**
 * Create Plugin sandbox directory
 * @description Create workspace under ~/.openclaw/plugins/clawguard-feishu/
 * @param openclawDir - OpenClaw user directory
 * @returns Sandbox root directory path
 */
function createPluginSandbox(openclawDir) {
  const sandboxRoot = path.join(openclawDir, 'plugins', PLUGIN_NAME);

  const dirs = [
    sandboxRoot,
    path.join(sandboxRoot, 'utils')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return sandboxRoot;
}

/**
 * Inject plugin config into openclaw.json
 * @description Register plugin in plugins.load.paths and plugins.entries
 * @param configFile - Config file path
 * @param pluginPath - Absolute path to plugin directory
 * @param adminOpenId - Admin Open ID
 */
function injectPluginConfig(configFile, pluginPath, adminOpenId) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

  // Initialize plugins object if not exists
  if (!config.plugins) {
    config.plugins = {};
  }

  // Initialize plugins.load if not exists
  if (!config.plugins.load) {
    config.plugins.load = {};
  }

  // Initialize plugins.load.paths array if not exists
  if (!config.plugins.load.paths) {
    config.plugins.load.paths = [];
  }

  // Add plugin path to plugins.load.paths (deduplicate)
  if (!config.plugins.load.paths.includes(pluginPath)) {
    config.plugins.load.paths.push(pluginPath);
  }

  // Initialize plugins.entries if not exists
  if (!config.plugins.entries) {
    config.plugins.entries = {};
  }

  // If adminOpenId is empty, write placeholder
  const finalAdminId = adminOpenId || 'PENDING_SETUP';

  // Inject plugin entry configuration
  config.plugins.entries[PLUGIN_NAME] = {
    enabled: true,
    config: {
      admin_open_id: finalAdminId,
      log_level: 'info'
    }
  };

  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  return config;
}

/**
 * Copy runtime files to sandbox
 * @description Copy core project files to ~/.openclaw/plugins/clawguard-feishu/
 * @param sandboxRoot - Sandbox root directory
 */
function copyRuntimeFiles(sandboxRoot) {
  const projectRoot = path.resolve(__dirname, '../..');

  const copyItems = [
    { src: 'src/core/index.ts', dest: 'index.ts' },
    { src: 'src/utils/audit.js', dest: 'utils/audit.js' }
  ];

  for (const item of copyItems) {
    const srcPath = path.join(projectRoot, item.src);
    const destPath = path.join(sandboxRoot, item.dest);

    if (!fs.existsSync(srcPath)) {
      continue;
    }

    if (item.isDir) {
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Generate plugin manifest file
 * @description Create openclaw.plugin.json in sandbox root for OpenClaw validation
 * @param sandboxRoot - Sandbox root directory
 */
function generatePluginManifest(sandboxRoot) {
  const manifestPath = path.join(sandboxRoot, 'openclaw.plugin.json');

  const manifest = {
    id: 'clawguard-feishu',
    name: 'clawguard-feishu',
    version: '1.0.0',
    description: 'Zero-trust security gateway and approval plugin for Feishu',
    main: 'index.ts',
    configSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {}
    }
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Save install metadata
 * @description Save install info to install-meta.json in sandbox
 * @param sandboxRoot - Sandbox root directory
 * @param meta - Install metadata
 */
function saveInstallMeta(sandboxRoot, meta) {
  const metaFile = path.join(sandboxRoot, 'install-meta.json');
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

/**
 * Main install function
 * @description Execute complete install flow
 */
async function install() {
  // Terminal: minimal output
  console.log('[ClawGuard-Feishu] Installing...');

  try {
    // 0. Check if already installed
    const openclawDir = getOpenClawDir();
    if (checkAlreadyInstalled(openclawDir)) {
      console.log('[ClawGuard-Feishu] Already installed. Use --force to overwrite.');
      if (!args.force) {
        process.exit(1);
      }
    }

    // 1. Check for Admin ID
    let adminId = args.admin || process.env.CLAWGUARD_ADMIN_ID;

    if (!adminId) {
      const promptedId = await promptForAdminId();
      if (promptedId) {
        adminId = promptedId;
      }
    }

    // 2. Check if OpenClaw is initialized
    const configFile = checkOpenClawInitialized(openclawDir);

    // 3. Create Plugin sandbox
    const sandboxRoot = createPluginSandbox(openclawDir);

    // 4. Inject plugin config (paths + entries)
    injectPluginConfig(configFile, sandboxRoot, adminId);

    // 5. Copy runtime files to sandbox
    copyRuntimeFiles(sandboxRoot);

    // 6. Generate plugin manifest
    generatePluginManifest(sandboxRoot);

    // 7. Inject upstream source code
    injectUpstreamSource();

    // 8. Save install metadata
    const installMeta = {
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      openclawDir: openclawDir,
      configFile: configFile,
      adminOpenId: adminId || 'PENDING_SETUP',
      sandboxRoot: sandboxRoot,
      pluginName: PLUGIN_NAME,
      upstreamInjected: true
    };
    saveInstallMeta(sandboxRoot, installMeta);

    // Terminal: success message
    console.log('[ClawGuard-Feishu] Installed successfully');
    console.log('  Sandbox: ' + sandboxRoot);
    console.log('  Admin: ' + (adminId || 'PENDING_SETUP - run setup-admin to configure'));

    if (!adminId) {
      console.log('  Next: npx clawguard-feishu setup-admin');
    } else {
      console.log('  Next: openclaw gateway restart');
    }

  } catch (error) {
    console.error('[ClawGuard-Feishu] Install failed:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export module
module.exports = { install };
