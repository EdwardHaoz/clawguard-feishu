/**
 * ClawGuard Admin ID Setup
 * @description Securely obtain admin's Feishu OpenID
 * @purpose Configure admin OpenID for the plugin without exposing ports
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * Get Feishu user open_id by phone number
 * @param appId - Feishu app ID
 * @param appSecret - Feishu app secret
 * @param mobile - Admin's phone number
 * @returns OpenID or null
 */
async function getUserByMobile(appId, appSecret, mobile) {
  const tokenResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });

  const tokenData = await tokenResponse.json();
  if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
    throw new Error(`Failed to get tenant token: ${tokenData.msg}`);
  }

  const token = tokenData.tenant_access_token;

  const userResponse = await fetch('https://open.feishu.cn/open-apis/contact/v3/users/by_mobile?user_id_type=open_id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ mobile })
  });

  const userData = await userResponse.json();
  if (userData.code === 0 && userData.data && userData.data.user) {
    return userData.data.user.open_id;
  }

  return null;
}

/**
 * Main setup function - provides multiple secure options
 */
async function setupAdminId() {
  const openclawDir = path.join(require('os').homedir(), '.openclaw');
  const configFile = path.join(openclawDir, 'openclaw.json');

  if (!fs.existsSync(configFile)) {
    logger.error('OpenClaw config not found. Please run "openclaw init" first.');
    return;
  }

  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

  // Get Feishu credentials from config
  const feishuConfig = config?.channels?.feishu;
  const appId = feishuConfig?.appId;
  const appSecret = feishuConfig?.appSecret;

  if (!appId || !appSecret) {
    logger.error('Feishu credentials not found in config.');
    logger.info('Please configure channels.feishu in ~/.openclaw/openclaw.json first:');
    logger.info('  {');
    logger.info('    "channels": {');
    logger.info('      "feishu": {');
    logger.info('        "appId": "cli_xxxxx",');
    logger.info('        "appSecret": "xxxxx"');
    logger.info('      }');
    logger.info('    }');
    logger.info('  }');
    return;
  }

  logger.title('ClawGuard Admin ID Setup');
  logger.info('');
  logger.info('Choose a method to obtain admin OpenID:');
  logger.info('');
  logger.listItem('1. Query by phone number (Recommended - most secure)');
  logger.listItem('2. Query by email');
  logger.listItem('3. Manual input (if you know the OpenID)');
  logger.listItem('4. Get from existing messages (after plugin runs)');
  logger.info('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const choice = await question('Enter your choice (1-4): ');

    let adminOpenId = null;

    if (choice === '1') {
      // Query by phone
      const mobile = await question('Enter admin phone number (e.g., 13800138000): ');
      logger.info(`Querying user by phone: ${mobile}...`);

      try {
        adminOpenId = await getUserByMobile(appId, appSecret, mobile.replace(/\D/g, ''));
        if (adminOpenId) {
          logger.success(`Found user OpenID: ${adminOpenId}`);
        }
      } catch (e) {
        logger.error(`Query failed: ${e.message}`);
      }

    } else if (choice === '2') {
      // Query by email
      const email = await question('Enter admin email: ');
      logger.info(`Querying user by email: ${email}...`);

      // Similar implementation would go here
      logger.warn('Email lookup not implemented yet. Please use phone number or manual input.');

    } else if (choice === '3') {
      // Manual input
      adminOpenId = await question('Enter admin OpenID (starts with ou_): ');
      if (!adminOpenId.startsWith('ou_')) {
        logger.error('Invalid OpenID format. Must start with "ou_"');
        return;
      }

    } else if (choice === '4') {
      // Show log location
      logger.info('After the plugin runs, you can find OpenIDs in:');
      logger.code('~/.openclaw/plugins/clawguard-feishu/audit.log');
      logger.info('');
      logger.info('Look for entries with "guest_block" action - the userId field contains the OpenID.');
      logger.info('Then run this command again and choose option 3 to enter manually.');
      return;

    } else {
      logger.error('Invalid choice');
      return;
    }

    if (adminOpenId) {
      // Save to config
      if (!config.plugins) config.plugins = {};
      if (!config.plugins.entries) config.plugins.entries = {};
      if (!config.plugins.entries['clawguard-feishu']) {
        config.plugins.entries['clawguard-feishu'] = { enabled: true, config: {} };
      }
      if (!config.plugins.entries['clawguard-feishu'].config) {
        config.plugins.entries['clawguard-feishu'].config = {};
      }

      config.plugins.entries['clawguard-feishu'].config.admin_open_id = adminOpenId;

      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
      logger.success(`Admin OpenID saved to: ${configFile}`);
      logger.info('');
      logger.info('You can now start OpenClaw with: openclaw start');
    }

  } catch (error) {
    logger.error(`Setup failed: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Export module
module.exports = { setupAdminId };
