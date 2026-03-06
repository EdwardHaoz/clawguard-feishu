# ClawGuard-Feishu

Feishu Zero-Trust Security Approval Gateway for OpenClaw

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

## Introduction

ClawGuard-Feishu is a **Zero-Trust Security Gateway** plugin for OpenClaw Feishu channels. It intercepts tool calls from non-admin users (Guests) and enforces admin approval through interactive Feishu cards before execution.

## Architecture

### Wormhole Event Injection

The plugin uses a unique **Wormhole Injection** mechanism to capture card button clicks without LLM token overhead:

```
Upstream monitor.account.ts
        │
        │ Injects: process.emit('clawguard_feishu_card_action', evt)
        ▼
┌───────────────────────────────────────┐
│  Global Wormhole Listener             │
│  process.on('clawguard_feishu_       │
│    card_action', handler)             │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  Approval Callback Handler            │
│  - Validates admin identity           │
│  - Updates card UI status             │
│  - Resolves/rejects pending task     │
└───────────────────────────────────────┘
```

**Key Benefits:**
- Bypasses LLM token consumption entirely
- No context pollution in conversation history
- Real-time card status updates
- 3-minute approval timeout

## Features

- **Guest Tool Interception**: Automatically intercept tool calls from non-admin users
- **Feishu Card Approval**: Push approval requests to admin via interactive cards
- **Complete Audit Logs**: JSONL-based operation logging with query support
- **Silent Interception**: Blocks LLM redundant replies automatically

## Quick Start

### Prerequisites

- Node.js >= 14
- OpenClaw initialized (`openclaw init`)
- Feishu Enterprise App (obtain `app_id` and `app_secret`)

### Installation

```bash
# Direct install (will prompt for Admin Open ID)
npx clawguard-feishu install

# Install with parameters
npx clawguard-feishu install --admin=ou_xxxxx --root=~/.openclaw
```

### Admin Configuration

```bash
# Secure admin setup (Recommended)
npx clawguard-feishu setup-admin

# Options:
# 1. Query by phone number (most secure)
# 2. Query by email
# 3. Manual input (if you know the OpenID)
# 4. Get from audit logs after plugin runs
```

### View Logs

```bash
# View last 20 logs
npx clawguard-feishu logs

# View last 50 logs
npx clawguard-feishu logs --tail=50

# Filter by action type
npx clawguard-feishu logs --action=approval_request
```

### Uninstall

```bash
npx clawguard-feishu uninstall

# Keep audit logs
npx clawguard-feishu uninstall --keepLogs=true
```

## Configuration

Configure in `plugins.entries.clawguard-feishu`:

```json
{
  "enabled": true,
  "config": {
    "admin_open_id": "ou_xxxxx",
    "language": "en",
    "log_level": "info"
  }
}
```

Feishu API config in `channels.feishu`:

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxx",
      "appSecret": "xxxxx"
    }
  }
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `admin_open_id` | string | Admin's Feishu Open ID (starts with ou_) |
| `language` | string | Card language: `en` or `zh` (default: en) |
| `log_level` | string | Log level: `debug`, `info`, `warn`, `error` |

## CLI Commands

| Command | Description |
|---------|-------------|
| `install` | Install plugin to OpenClaw |
| `uninstall` | Uninstall plugin |
| `setup-admin` | Securely configure admin OpenID (Recommended) |
| `logs` | View audit logs |

## License

MIT

---

<a name="chinese"></a>

# ClawGuard-Feishu

飞书零信任安全审批网关 for OpenClaw

[English](#english) | [中文](#chinese)

---

## 简介

ClawGuard-Feishu 是用于 OpenClaw 飞书生态的**零信任安全审批网关**插件。它在工具调用执行前拦截非管理员用户（Guest）的请求，并通过交互式飞书卡片强制要求管理员审批。

## 核心架构

### 虫洞事件注入

插件采用独特的**虫洞注入**机制捕获卡片按钮点击，完全避免 LLM Token 损耗：

```
上游 monitor.account.ts
        │
        │ 注入: process.emit('clawguard_feishu_card_action', evt)
        ▼
┌───────────────────────────────────────┐
│  全局虫洞监听器                        │
│  process.on('clawguard_feishu_        │
│    card_action', handler)             │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  审批回调处理器                        │
│  - 验证管理员身份                      │
│  - 更新卡片状态                        │
│  - 解决/拒绝待处理任务                 │
└───────────────────────────────────────┘
```

**核心优势：**
- 完全绕过 LLM Token 消耗
- 对话历史无上下文污染
- 实时卡片状态更新
- 3 分钟审批超时

## 功能特性

- **Guest 用户工具拦截**: 自动拦截非管理员用户的工具调用请求
- **飞书卡片审批**: 通过交互式卡片推送审批请求给管理员
- **完整审计日志**: 基于 JSONL 的操作记录，支持日志查询
- **静默拦截**: 自动阻断 LLM 冗余回复

## 快速开始

### 前置要求

- Node.js >= 14
- OpenClaw 已初始化 (`openclaw init`)
- 飞书企业自建应用（需获取 `app_id` 和 `app_secret`）

### 安装

```bash
# 直接安装（会提示输入 Admin Open ID）
npx clawguard-feishu install

# 指定参数安装
npx clawguard-feishu install --admin=ou_xxxxx --root=~/.openclaw
```

### 管理员配置

```bash
# 安全配置管理员 (推荐)
npx clawguard-feishu setup-admin

# 选项：
# 1. 通过手机号查询 (最安全)
# 2. 通过邮箱查询
# 3. 手动输入 (如果你知道 OpenID)
# 4. 插件运行后从审计日志获取
```

### 查看日志

```bash
# 查看最近 20 条日志
npx clawguard-feishu logs

# 查看最近 50 条
npx clawguard-feishu logs --tail=50

# 按操作类型筛选
npx clawguard-feishu logs --action=approval_request
```

### 卸载

```bash
npx clawguard-feishu uninstall

# 保留审计日志
npx clawguard-feishu uninstall --keepLogs=true
```

## 配置项

在 `plugins.entries.clawguard-feishu` 中配置：

```json
{
  "enabled": true,
  "config": {
    "admin_open_id": "ou_xxxxx",
    "language": "zh",
    "log_level": "info"
  }
}
```

飞书 API 配置在 `channels.feishu` 中：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxx",
      "appSecret": "xxxxx"
    }
  }
}
```

### 配置选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `admin_open_id` | string | 管理员的飞书 Open ID（以 ou_ 开头） |
| `language` | string | 卡片语言: `en` 或 `zh`（默认: en） |
| `log_level` | string | 日志级别: `debug`, `info`, `warn`, `error` |

## CLI 命令

| 命令 | 说明 |
|------|------|
| `install` | 安装插件到 OpenClaw |
| `uninstall` | 卸载插件 |
| `setup-admin` | 安全配置管理员 OpenID (推荐) |
| `logs` | 查看审计日志 |

## 许可证

MIT
