#!/usr/bin/env node

/**
 * ClawGuard-Feishu CLI Entry
 * @description CLI command entry point, parses npx clawguard-feishu commands
 * @purpose Provide unified entry for install, uninstall, setup-admin, logs commands
 */

const path = require('path');
const { install } = require('../src/commands/install');
const { uninstall } = require('../src/commands/uninstall');
const { setupAdminId } = require('../src/commands/setup-admin');
const { audit } = require('../src/utils/audit');

const command = process.argv[2];
const args = process.argv.slice(3);

const helpMessage = `
ClawGuard-Feishu - Feishu Permission Management & Approval Gateway

Usage:
  npx clawguard-feishu install          One-click install ClawGuard-Feishu to OpenClaw
  npx clawguard-feishu uninstall        One-click uninstall and restore OpenClaw
  npx clawguard-feishu setup-admin      Securely configure admin OpenID (Recommended)
  npx clawguard-feishu logs            View audit logs
  npx clawguard-feishu logs --tail=50    View last 50 logs
  npx clawguard-feishu logs --taskId=a1b2c3  Filter by task ID
  npx clawguard-feishu logs --help     Show help message

Options:
  --root=<path>         Specify OpenClaw project root directory
  --config=<path>      Specify config file path
  --target=<path>      Specify injection target file
  --tail=<number>      Show last N logs
  --action=<type>      Filter by action type
  --taskId=<id>        Filter by task ID
  --result=<result>    Filter by result status
  --keepLogs           Keep audit logs during uninstall

Examples:
  npx clawguard-feishu install
  npx clawguard-feishu install --root=/path/to/openclaw
  npx clawguard-feishu uninstall
  npx clawguard-feishu logs --tail=20
  npx clawguard-feishu logs --taskId=a1b2c3
  npx clawguard-feishu logs --action=guest_block
  npx clawguard-feishu logs --action=guest_block
`;

/**
 * Format log output
 * @param logs - Array of log entries
 */
function formatLogs(logs) {
  if (!logs || logs.length === 0) {
    console.log('No audit logs found');
    return;
  }

  // Sort by time descending
  const sortedLogs = [...logs].reverse();

  for (const log of sortedLogs) {
    const time = new Date(log.timestamp).toLocaleString();
    const actionLabel = getActionLabel(log.action);
    // Support both old (user_type) and new (userType) field names
    const userType = (log.userType || log.user_type) === 'admin' ? '[ADMIN]' : '[GUEST]';
    const result = getResultBadge(log.result);
    // Support both old (tool_name) and new (toolName) field names
    const toolName = log.toolName || log.tool_name || 'unknown';
    const taskId = log.taskId ? `(ID:${log.taskId}) ` : '';

    console.log(`${time} ${actionLabel} ${userType} ${taskId}${toolName} ${result}`);
    if (log.messageId) {
      console.log(`   [Msg:${log.messageId}]`);
    }
    console.log(`   ${log.message}`);
    console.log('');
  }
}

/**
 * Get action label
 */
function getActionLabel(action) {
  const labels = {
    'admin_call': '[ADMIN_CALL]',
    'guest_block': '[BLOCKED]',
    'approval_request': '[PENDING]',
    'approval_approve': '[APPROVED]',
    'approval_reject': '[REJECTED]',
    'approval_timeout': '[TIMEOUT]',
    'identity_check': '[IDENTITY]',
    'card_sent': '[CARD_SENT]',
    'card_send_failed': '[CARD_FAIL]',
    'card_approve': '[CARD_APPR]',
    'card_reject': '[CARD_REJ]',
    'tool_approve': '[TOOL_APPR]',
    'tool_reject': '[TOOL_REJ]',
    'plugin_startup': '[STARTUP]'
  };
  return labels[action] || '[ACTION]';
}

/**
 * Get result badge
 */
function getResultBadge(result) {
  const badges = {
    'allowed': '[ALLOWED]',
    'blocked': '[BLOCKED]',
    'approved': '[APPROVED]',
    'rejected': '[REJECTED]',
    'timeout': '[TIMEOUT]',
    'pending': '[PENDING]',
    'sent': '[SENT]',
    'failed': '[FAILED]',
    'loaded': '[LOADED]',
    'pending': '[PENDING]'
  };
  return badges[result] || `[${result}]`;
}

/**
 * View audit logs
 */
async function logs() {
  const tailArg = args.find(a => a.startsWith('--tail='));
  const actionArg = args.find(a => a.startsWith('--action='));
  const taskIdArg = args.find(a => a.startsWith('--taskId='));
  const resultArg = args.find(a => a.startsWith('--result='));
  const helpArg = args.find(a => a.includes('help'));

  if (helpArg || args.includes('-h')) {
    console.log(helpMessage);
    return;
  }

  const options = {
    tail: tailArg ? parseInt(tailArg.split('=')[1], 10) : 20,
    action: actionArg ? actionArg.split('=')[1] : null,
    taskId: taskIdArg ? taskIdArg.split('=')[1] : null,
    result: resultArg ? resultArg.split('=')[1] : null
  };

  console.log(`Audit log location: ${audit.getLogPath()}`);
  console.log(`Last ${options.tail} entries:\n`);

  const logs = audit.readLogs(options);
  formatLogs(logs);

  console.log(`\nUse --tail=<number> to see more, --action=<type>, --taskId=<id>, --result=<status> to filter`);
}

async function main() {
  switch (command) {
    case 'install':
      await install();
      break;

    case 'uninstall':
      await uninstall();
      break;

    case 'setup-admin':
      await setupAdminId();
      break;

    case 'logs':
      await logs();
      break;

    case '--help':
    case '-h':
    case undefined:
      console.log(helpMessage);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(helpMessage);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Execution error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});
