/**
 * ClawGuard-Feishu Core Interceptor
 * @description OpenClaw Plugin for zero-trust security gateway - intercept Guest tool calls and enforce admin approval
 */

import * as crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// --- Types & Interfaces ---
type Language = 'en' | 'zh';

interface LocaleStrings {
  header: string; requester: string; fromGroup: string; toolName: string; taskId: string;
  params: string; approve: string; reject: string; approved: string; rejected: string;
  result: string; timeout: string; permissionDenied: string; adminRejected: string; adminRejectedManual: string;
}

const locales: Record<Language, LocaleStrings> = {
  en: { header: 'Security Approval', requester: 'Requester', fromGroup: 'From Group', toolName: 'Tool', taskId: 'Task ID', params: 'Parameters', approve: 'Approve', reject: 'Reject', approved: 'Approved', rejected: 'Rejected', result: 'Result', timeout: 'Permission denied. Admin did not approve in time.', permissionDenied: 'Admin rejected this execution.', adminRejected: 'Admin rejected this operation.', adminRejectedManual: 'Admin manually rejected execution of tool' },
  zh: { header: '安全审批', requester: '发起人', fromGroup: '来自群聊', toolName: '拦截工具', taskId: '任务代号', params: '执行参数', approve: '批准', reject: '拒绝', approved: '已批准', rejected: '已拒绝', result: '处理结果', timeout: '权限不足。管理员未在有效时间内批准。', permissionDenied: '管理员已拒绝该操作。', adminRejected: '管理员已拒绝该操作。', adminRejectedManual: '管理员已手动拒绝执行' }
};

interface PluginLogger {
  debug?: (msg: string, meta?: any) => void; info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void; error: (msg: string, meta?: any) => void;
}

interface OpenClawPluginApi {
  id: string; config: Record<string, any>; pluginConfig?: Record<string, any>; logger: PluginLogger;
  registerTool: (tool: any) => void; registerHttpRoute: (params: any) => void; registerGatewayMethod: (method: string, handler: any) => void;
  on: <K extends string>(hookName: K, handler: any, opts?: { priority?: number }) => void;
}

interface FeishuConfig { appId: string; appSecret: string; }

interface PendingTask {
  resolve: (val: any) => void; toolName: string; senderId: string; chatId?: string; messageId?: string;
  createdAt: number; displayUser?: string; displayGroup?: string; paramsStr?: string;
}

// --- Global Caches & Pools ---
let tenantAccessTokenCache: { token: string; expiresAt: number } | null = null;
const identityCache = new Map<string, string>();
const pendingTasks = new Map<string, PendingTask>();
const MAX_IDENTITY_CACHE_SIZE = 1000;

// --- Utility Functions ---
function getLocale(config: Record<string, any>): Language {
  const lang = config?.language; return (lang === 'zh' || lang === 'en') ? lang : 'zh';
}
function getFeishuConfig(api: OpenClawPluginApi): FeishuConfig | undefined {
  return (api.config as any)?.channels?.feishu;
}
function getAdminOpenId(api: OpenClawPluginApi): string | undefined {
  return api.pluginConfig?.admin_open_id;
}

function buildFeishuCard(task: PendingTask, taskId: string, status: 'pending' | 'approve' | 'reject') {
  const isPending = status === 'pending';
  const isApproved = status === 'approve';

  // 极简中文 Header
  let headerTitle = "🛡️ 零信任安全审批";
  let templateColor = "orange";
  if (!isPending) {
    headerTitle = isApproved ? "✅ 已批准执行" : "❌ 已拒绝阻断";
    templateColor = isApproved ? "green" : "red";
  }

  const displayUser = task.displayUser || task.senderId;
  const displayGroup = task.displayGroup || '';
  const toolName = task.toolName;
  const paramsStr = task.paramsStr || '{}';

  // 构建整合后的动作负载块，让大模型的意图一目了然
  const actionPayload = {
    tool: toolName,
    parameters: JSON.parse(paramsStr || '{}')
  };
  const actionPayloadStr = JSON.stringify(actionPayload, null, 2);

  // 极简合并内容：发起请求 + 任务代号 + 执行动作(JSON)
  const markdownContent = `**发起请求**: ${displayUser}${displayGroup ? ` (来自: ${displayGroup})` : ''}\n**任务代号**: \`${taskId}\`\n**执行动作**:\n\`\`\`json\n${actionPayloadStr}\n\`\`\``;

  const elements: any[] = [
    {
      tag: "markdown",
      content: markdownContent
    }
  ];

  if (isPending) {
    elements.push({
      tag: "action",
      actions: [
        { tag: "button", text: { tag: "plain_text", content: "批准" }, type: "primary", value: { action: "approve", taskId: taskId } },
        { tag: "button", text: { tag: "plain_text", content: "拒绝" }, type: "danger", value: { action: "reject", taskId: taskId } }
      ]
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: "plain_text", content: headerTitle }, template: templateColor },
    elements: elements
  };
}

function extractSenderId(sessionKey: string | undefined): string {
  if (!sessionKey) return 'unknown';
  const match = sessionKey.match(/(ou_[a-zA-Z0-9]+)/);
  return match ? match[1] : 'unknown';
}

function cleanFeishuId(id: string | undefined, prefix: string): string | null {
  if (!id) return null;
  const match = id.match(new RegExp(`(${prefix}_[a-zA-Z0-9]+)`));
  return match ? match[1] : null;
}

function writeAuditLog(logger: PluginLogger, event: any): void {
  const logDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.openclaw', 'plugins', 'clawguard-feishu');
  const logFile = path.join(logDir, 'audit.log');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logEntry = { timestamp: new Date().toISOString(), level: event.level || 'info', ...event };
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
    logger.debug?.(`[AUDIT] ${JSON.stringify(logEntry)}`);
  } catch (error) {
    logger.error(`Audit log write failed: ${error}`);
  }
}

// --- Feishu API Calls ---
async function getFeishuTenantAccessToken(config: FeishuConfig, logger: PluginLogger): Promise<string | null> {
  if (tenantAccessTokenCache && Date.now() < tenantAccessTokenCache.expiresAt) return tenantAccessTokenCache.token;
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
    });
    const data = await response.json() as any;
    if (data.code === 0 && data.tenant_access_token) {
      tenantAccessTokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + ((data.expire || 7200) - 120) * 1000 };
      return data.tenant_access_token;
    }
  } catch (error) { logger.error(`[ClawGuard-Feishu] Token error: ${error}`); }
  return null;
}

async function getFeishuUserInfo(userId: string, token: string, logger: PluginLogger): Promise<string | null> {
  const cleanId = cleanFeishuId(userId, 'ou');
  if (!cleanId) return null;

  try {
    const res = await fetch(`https://open.feishu.cn/open-apis/contact/v3/users/${cleanId}?user_id_type=open_id`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json() as any;
    if (data.code === 0 && data.data?.user) return data.data.user.name;
  } catch (error) { logger.error(`[ClawGuard-Feishu] Get user info error: ${error}`); }
  return null;
}

async function getFeishuChatInfo(chatId: string, token: string, logger: PluginLogger): Promise<string | null> {
  const cleanId = cleanFeishuId(chatId, 'oc');
  if (!cleanId) return null;
  try {
    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/chats/${cleanId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json() as any;
    if (data.code === 0 && data.data) return data.data.name;
  } catch (error) { logger.error(`[ClawGuard-Feishu] Get chat info error: ${error}`); }
  return null;
}

// 群成员列表获取（备用方案）
async function getUserNameFromChat(chatId: string, userId: string, accessToken: string, logger: PluginLogger): Promise<string | null> {
  const cleanChatId = cleanFeishuId(chatId, 'oc');
  const cleanUserId = cleanFeishuId(userId, 'ou');
  if (!cleanChatId || !cleanUserId) return null;

  try {
    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/chats/${cleanChatId}/members?member_id_type=open_id`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const data = await res.json() as any;
    if (data.code === 0 && data.data?.items) {
      const member = data.data.items.find((m: any) => m.member_id === cleanUserId);
      if (member?.name) return member.name;
    }
  } catch (error) { logger.error(`[ClawGuard-Feishu] Get chat members error: ${error}`); }
  return null;
}

async function sendFeishuInteractiveCard(
  api: OpenClawPluginApi, adminOpenId: string, toolName: string, senderId: string,
  shortTaskId: string, chatId: string | undefined, params: any
): Promise<{ messageId: string; displayUser: string; displayGroup: string; paramsStr: string } | null> {
  const config = getFeishuConfig(api);
  if (!config) return null;
  
  const token = await getFeishuTenantAccessToken(config, api.logger);
  if (!token) return null;

  const paramsStr = params ? JSON.stringify(params, null, 2) : '{}';

  // 1. 获取群聊名称
  const displayGroup = chatId ? (await getFeishuChatInfo(chatId, token, api.logger) || '') : '';

  // 2. 获取用户昵称 (如果已知 senderId)
  let displayUser = senderId;
  if (senderId !== 'unknown') {
    const userInfoName = await getFeishuUserInfo(senderId, token, api.logger);
    if (userInfoName) {
      displayUser = userInfoName;
    } else if (chatId) {
      // 兜底方案：从群成员列表中抓取
      const chatMemberName = await getUserNameFromChat(chatId, senderId, token, api.logger);
      if (chatMemberName) displayUser = chatMemberName;
    }
  }

  const mockTask: PendingTask = { resolve: () => {}, toolName, senderId, displayUser, displayGroup, paramsStr, createdAt: Date.now() };
  const cardContent = buildFeishuCard(mockTask, shortTaskId, 'pending');

  try {
    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receive_id: adminOpenId, msg_type: "interactive", content: JSON.stringify(cardContent) })
    });
    const data = await response.json() as any;
    if (data.code === 0 && data.data?.message_id) {
      return { messageId: data.data.message_id, displayUser, displayGroup, paramsStr };
    }
    api.logger.error(`[ClawGuard-Feishu] Card send failed: ${data.msg}`);
  } catch (error) { api.logger.error(`[ClawGuard-Feishu] Card send error: ${error}`); }
  return { messageId: '', displayUser, displayGroup, paramsStr }; 
}


// --- Core Handlers ---
async function handleApprovalCallback(api: OpenClawPluginApi, taskId: string, action: 'approve' | 'reject') {
  const task = pendingTasks.get(taskId);
  if (!task) {
    api.logger.error(`[ClawGuard-Feishu] Approval failed: Task not found ${taskId}`);
    return;
  }

  const toolName = task.toolName;
  // 1. 立即放行任务
  if (action === 'approve') {
    writeAuditLog(api.logger, { action: 'approval_approve', taskId, userType: 'admin', toolName, result: 'approved' });
    task.resolve({});
  } else {
    writeAuditLog(api.logger, { action: 'approval_reject', taskId, userType: 'admin', toolName, result: 'rejected' });
    task.resolve({ block: true, blockReason: "[SYSTEM] Admin rejected execution." });
  }

  // 2. 移出挂起池
  const taskCopy = { ...task };
  pendingTasks.delete(taskId);

  // 3. 执行卡片状态更新 (带严格的 HTTP 错误捕获)
  if (!taskCopy.messageId) return;

  try {
    const config = getFeishuConfig(api);
    const token = config ? await getFeishuTenantAccessToken(config, api.logger) : null;
    if (!token) throw new Error("Failed to acquire token");

    const updatedCard = buildFeishuCard(taskCopy as PendingTask, taskId, action);

    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${taskCopy.messageId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: JSON.stringify(updatedCard) })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} - ${errText}`);
    }
    api.logger.info(`[ClawGuard-Feishu] Card UI updated successfully (taskId=${taskId})`);
  } catch (e) {
    api.logger.error(`[ClawGuard-Feishu] Card update error: ${e}`);
  }
}

// --- Plugin Entry ---
export default function register(api: OpenClawPluginApi): void {
  writeAuditLog(api.logger, { action: 'plugin_startup', userType: 'system', toolName: 'none', result: 'loaded', message: 'ClawGuard init' });

  api.on('message_received', (event: any, msgCtx: any) => {
    try {
      // === 处理 /approve 和 /reject 命令行兜底 ===
      const msgContent = event?.message?.content || '';
      let text = msgContent;
      try { text = JSON.parse(msgContent)?.text || msgContent; } catch(e) {}

      const trimmedText = text.trim();
      if (trimmedText.startsWith('/approve ') || trimmedText.startsWith('/reject ')) {
        const parts = trimmedText.split(' ');
        if (parts.length >= 2) {
          const cmd = parts[0] === '/approve' ? 'approve' : 'reject';
          const cmdTaskId = parts[1].trim();
          handleApprovalCallback(api, cmdTaskId, cmd);
          return undefined;
        }
      }

      // === 用户身份缓存 ===
      const realUserId = event?.sender?.sender_id?.open_id || event?.from || '';
      const cachedCleanId = cleanFeishuId(realUserId, 'ou');
      const convId = cleanFeishuId(msgCtx?.conversationId, 'oc');
      const sessionKey = msgCtx?.sessionKey;

      if (cachedCleanId) {
        if (identityCache.size >= MAX_IDENTITY_CACHE_SIZE) {
          const firstKey = identityCache.keys().next().value;
          if (firstKey) identityCache.delete(firstKey);
        }
        if (convId) identityCache.set(convId, cachedCleanId);
        if (sessionKey) identityCache.set(sessionKey, cachedCleanId);
      }
    } catch (err) {
      api.logger.error(`[ClawGuard-Feishu] message_received hook error: ${err}`);
    }
    return undefined;
  }, { priority: 999 }); 

  api.on('before_tool_call', async (event: any, ctx: any) => {
    const toolName = event.toolName;

    // ==========================================================
    // 【新增】1. 探测系统级无头任务 (CLI / Cron / 系统内部调用)
    // 如果没有 sessionKey，或者 sessionKey 明确是系统来源，直接放行
    const sessionKey = ctx?.sessionKey || '';
    const isSystemSession = !sessionKey || sessionKey.startsWith('cli:') || sessionKey.startsWith('cron:') || sessionKey.startsWith('system:');
    const isChannelMissing = !ctx?.channelId && !ctx?.provider; // 缺少渠道来源

    if (isSystemSession || isChannelMissing) {
      writeAuditLog(api.logger, {
        action: 'system_task_bypass',
        level: 'info',
        userType: 'system',
        toolName,
        result: 'allowed',
        message: `Auto-bypassed background/cron task (sessionKey: ${sessionKey || 'none'})`
      });
      return undefined; // 直接放行
    }
    // ==========================================================

    // 2. 原有的身份提取逻辑 (保留你现有的 extractSenderId 等代码)
    const senderIdFromCtx = ctx.senderOpenID || ctx.requesterSenderId || ctx.SenderId || ctx.senderId;

    // 从 sessionKey 中提取群聊 ID (oc_xxx)
    const convIdMatch = sessionKey.match(/(oc_[a-zA-Z0-9]+)/);
    const groupConvId = convIdMatch ? convIdMatch[1] : null;

    // 双重缓存查找
    let cachedUserId = identityCache.get(sessionKey);
    if (!cachedUserId && groupConvId) {
        cachedUserId = identityCache.get(groupConvId);
    }

    // 最终确认 SenderId 和 ChatId
    const finalSenderId = cachedUserId || senderIdFromCtx || extractSenderId(sessionKey);
    const chatId = groupConvId || ctx.conversationId || ctx.chatId;

    // 系统心跳判断 - 只有真正的系统 sessionKey 才是心跳
    // 注意：sessionKey 格式如 "agent:main:feishu:group:oc_xxx" 包含 ":main" 但不是系统心跳
    const isUnknownUser = finalSenderId === 'unknown' || !finalSenderId;
    
    // 【关键修复】系统心跳才放行，未知用户应该拦截！
    if (isSystemSession) {
        writeAuditLog(api.logger, { action: 'system_task', userId: 'system', userType: 'system', toolName, result: 'allowed', message: `自动放行系统心跳任务` });
        return {};
    }
    
    // 未知用户需要拦截审批
    if (isUnknownUser) {
        const adminOpenId = getAdminOpenId(api);
        if (!adminOpenId) return {};
        
        const taskId = crypto.randomUUID();
        const shortTaskId = taskId.substring(0, 6);
        
        // 发送审批卡片给管理员
        const cardResult = await sendFeishuInteractiveCard(api, adminOpenId, toolName, 'unknown', shortTaskId, undefined, event.params);
        
        writeAuditLog(api.logger, {
            action: 'approval_request', taskId: shortTaskId, userId: 'unknown', userType: 'guest',
            toolName, result: 'pending', message: `Unknown user requires approval`, displayUser: cardResult?.displayUser || 'Unknown'
        });

        return new Promise((resolve) => {
            pendingTasks.set(shortTaskId, {
                resolve, toolName, senderId: 'unknown', chatId: undefined, messageId: cardResult?.messageId,
                createdAt: Date.now(), displayUser: cardResult?.displayUser || 'Unknown', displayGroup: cardResult?.displayGroup || '', paramsStr: cardResult?.paramsStr || '{}'
            });

            setTimeout(() => {
                if (pendingTasks.has(shortTaskId)) {
                    pendingTasks.delete(shortTaskId);
                    resolve({ block: true, blockReason: `ERROR: ${locales[getLocale(api.pluginConfig || {})].timeout}` });
                }
            }, 180000);
        });
    }

    const adminOpenId = getAdminOpenId(api);
    if (!adminOpenId) return {};

    const isAdmin = (finalSenderId === adminOpenId);

    if (isAdmin) {
      writeAuditLog(api.logger, { action: 'admin_call', userId: finalSenderId, userType: 'admin', toolName, result: 'allowed', message: `Admin executed tool` });
      return {};
    }

    // Guest Flow - 发送审批卡片
    const taskId = crypto.randomUUID();
    const shortTaskId = taskId.substring(0, 6);

    const cardResult = await sendFeishuInteractiveCard(api, adminOpenId, toolName, finalSenderId, shortTaskId, chatId, event.params);
    
    writeAuditLog(api.logger, {
      action: 'approval_request', taskId: shortTaskId, chatId, userId: finalSenderId, userType: 'guest',
      toolName, result: 'pending', message: `Request sent`, displayUser: cardResult?.displayUser, displayGroup: cardResult?.displayGroup
    });

    return new Promise((resolve) => {
      pendingTasks.set(shortTaskId, {
        resolve, toolName, senderId: finalSenderId, chatId, messageId: cardResult?.messageId,
        createdAt: Date.now(), displayUser: cardResult?.displayUser, displayGroup: cardResult?.displayGroup, paramsStr: cardResult?.paramsStr
      });

      setTimeout(() => {
        if (pendingTasks.has(shortTaskId)) {
          pendingTasks.delete(shortTaskId);
          writeAuditLog(api.logger, { action: 'approval_timeout', taskId: shortTaskId, userType: 'system', toolName, result: 'timeout', message: `Timeout auto-cancelled` });
          resolve({ block: true, blockReason: `ERROR: ${locales[getLocale(api.pluginConfig || {})].timeout}` });
        }
      }, 180000);
    });
  }, { priority: 100 });

  // === Global Wormhole Listener (card action events from upstream injection) ===
  process.on('clawguard_feishu_card_action', (rawEvent: any) => {
    try {
      const adminOpenId = api.pluginConfig?.admin_open_id as string | undefined;
      let rawValue = rawEvent?.action?.value;
      const senderId = rawEvent?.operator?.open_id || '';

      // 【核心修复】暴力碾碎飞书的多重转义套娃
      let actionData: any = {};
      if (typeof rawValue === 'object' && rawValue !== null) {
          actionData = rawValue;
      } else if (typeof rawValue === 'string') {
          // 方案 A: 尝试最多 3 次 JSON.parse 剥开字符串外衣
          let parsed = rawValue;
          for (let i = 0; i < 3; i++) {
              if (typeof parsed === 'string') {
                  try { parsed = JSON.parse(parsed); } catch (e) { break; }
              }
          }
          if (typeof parsed === 'object' && parsed !== null) {
              actionData = parsed;
          } else {
              // 方案 B: 物理消除反斜杠，进行终极暴力正则匹配
              const cleanStr = rawValue.replace(/\\/g, '');
              const aMatch = cleanStr.match(/"action"\s*:\s*"([^"]+)"/);
              const tMatch = cleanStr.match(/"taskId"\s*:\s*"([a-f0-9]{6})"/);
              if (aMatch && tMatch) {
                  actionData = { action: aMatch[1], taskId: tMatch[1] };
              }
          }
      }

      // 验证权限并放行
      if (adminOpenId && senderId === adminOpenId && actionData && actionData.taskId) {
        api.logger.info(`[ClawGuard-Feishu] Wormhole intercepted card action: action=${actionData.action}, taskId=${actionData.taskId}`);
        handleApprovalCallback(api, actionData.taskId, actionData.action as 'approve' | 'reject');
      } else {
        api.logger.warn(`[ClawGuard-Feishu] Unauthorized or invalid wormhole trigger: sender=${senderId}, value=${JSON.stringify(rawValue)}`);
      }
    } catch (e) {
      api.logger.error(`[ClawGuard-Feishu] Wormhole process error: ${e}`);
    }
  });
}

export const activate = register;