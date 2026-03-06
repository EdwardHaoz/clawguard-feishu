# ClawGuard-Feishu

Feishu Zero-Trust Security Approval Gateway for OpenClaw

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-orange.svg?style=for-the-badge&logo=dependabot)](https://github.com/openclaw/openclaw)
[![Feishu Channel](https://img.shields.io/badge/Channel-Feishu-00D1D1.svg?style=for-the-badge&logo=lark)](https://open.feishu.cn/)
[![Zero Trust](https://img.shields.io/badge/Security-Zero_Trust-red.svg?style=for-the-badge&logo=security)](https://github.com/{your_username}/clawguard-feishu)

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

## Introduction

ClawGuard-Feishu is a **Zero-Trust Security Gateway** plugin for OpenClaw Feishu channels. It intercepts tool calls from non-admin users (Guests) and enforces admin approval through interactive Feishu cards before execution.

## Architecture

| Layer | Component | Mechanism | Impact |
| :--- | :--- | :--- | :--- |
| **Upstream** | `Core Channel` | **Source Hooking** | Intercepts at the exact moment of event creation |
| **Wormhole** | `Process Bridge` | `process.emit` | **0 Token Waste** & bypasses LLM routing |
| **Downstream** | `Security Plugin` | `process.on` | Self-validation of identity & UI state updates |

---

> **Design Philosophy**
>
> We reject the traditional "receive-parse-execute" pattern. Through **Event Tunneling**, we completely decouple approval logic from complex LLM semantic recognition, achieving physical-level decoupling between security control flow and business data streams.

**Core Advantages**

**High Efficiency**: Approval clicks no longer trigger LLM inference, reducing response latency by over 90%.

**Zero Pollution**: No approval metadata clutters chat history, maintaining absolute purity of Agent memory context.

**Security First**: Only trusted admin IDs can trigger wormhole signals, with system-level Cron task auto-exemption mechanism.

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

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-orange.svg?style=for-the-badge&logo=dependabot)](https://github.com/openclaw/openclaw)
[![Feishu Channel](https://img.shields.io/badge/Channel-Feishu-00D1D1.svg?style=for-the-badge&logo=lark)](https://open.feishu.cn/)
[![Zero Trust](https://img.shields.io/badge/Security-Zero_Trust-red.svg?style=for-the-badge&logo=security)](https://github.com/{your_username}/clawguard-feishu)

[English](#english) | [中文](#chinese)

---

## 简介

ClawGuard-Feishu 是用于 OpenClaw 飞书生态的**零信任安全审批网关**插件。它在工具调用执行前拦截非管理员用户（Guest）的请求，并通过交互式飞书卡片强制要求管理员审批。

## 核心架构

| 层级 | 组件 | 机制 | 影响 |
| :--- | :--- | :--- | :--- |
| **上游** | `Core Channel` | **Source Hooking** | 在事件诞生瞬间进行底层拦截 |
| **虫洞** | `Process Bridge` | `process.emit` | **0 Token Waste** & 绕过 LLM 路由 |
| **下游** | `Security Plugin` | `process.on` | 身份自主核验与 UI 状态更新 |

---

> **Design Philosophy**
>
> 我们不采用传统的"接收消息-解析指令"模式。通过**底层事件隧道（Event Tunneling）**，我们将审批逻辑从复杂的 LLM 语义识别中彻底剥离，实现了安全控制流与业务数据流的物理级解耦。

**核心优势**

**High Efficiency**: 审批点击不再触发 LLM 推理，响应延迟降低 90% 以上。

**Zero Pollution**: 聊天历史中不再充斥审批元数据，保持 Agent 记忆上下文的绝对纯净。

**Security First**: 只有受信任的管理员 ID 才能触发虫洞信号，且具备系统级 Cron 任务自动免检机制。

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
