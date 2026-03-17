'use strict';

const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');
const http = require('http');
const https = require('https');

// ============================================================
// EXPRESS SERVER
// ============================================================
const app = express();
const PORT = process.env.PORT || 5000;

let botStates = {};
let bots = [];

// ============================================================
// WEBHOOK
// ============================================================
function sendWebhook(message) {
  if (!config.discord.enabled) return;

  const data = JSON.stringify({ content: message });
  const url = new URL(config.discord.webhookUrl);

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options);
  req.write(data);
  req.end();
}

// ============================================================
// CREATE BOT
// ============================================================
function createBot(account) {

  const bot = mineflayer.createBot({
    username: account.username,
    password: account.password,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version || false
  });

  bot.loadPlugin(pathfinder);
  bots.push(bot);

  botStates[account.username] = {
    connected: false,
    coords: null,
    lastActivity: Date.now()
  };

  // ================= EVENTS =================

  bot.on('login', () => {
    console.log(`✅ ${account.username} connected`);
    botStates[account.username].connected = true;

    if (config.discord.events.connect) {
      sendWebhook(`🟢 ${account.username} connected`);
    }
  });

  bot.on('spawn', () => {

    // Auto Auth
    if (config.utils["auto-auth"].enabled) {
      setTimeout(() => {
        bot.chat(`/register ${config.utils["auto-auth"].password} ${config.utils["auto-auth"].password}`);
        bot.chat(`/login ${config.utils["auto-auth"].password}`);
      }, 2000);
    }

    // Anti AFK
    if (config.utils["anti-afk"].enabled) {
      setInterval(() => {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }, 10000);
    }

    // Chat Messages
    if (config.utils["chat-messages"].enabled) {
      setInterval(() => {
        const msgs = config.utils["chat-messages"].messages;
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        bot.chat(msg);
      }, config.utils["chat-messages"]["repeat-delay"] * 1000);
    }
  });

  bot.on('move', () => {
    if (bot.entity) {
      botStates[account.username].coords = bot.entity.position;
    }
  });

  bot.on('chat', (username, message) => {
    if (config.discord.events.chat) {
      sendWebhook(`[${account.username}] ${username}: ${message}`);
    }
  });

  bot.on('end', () => {
    console.log(`❌ ${account.username} disconnected`);
    botStates[account.username].connected = false;

    if (config.discord.events.disconnect) {
      sendWebhook(`🔴 ${account.username} disconnected`);
    }

    if (config.utils["auto-reconnect"]) {
      setTimeout(() => createBot(account), config.utils["auto-reconnect-delay"]);
    }
  });

  bot.on('error', err => {
    console.log(`⚠️ ${account.username}: ${err.message}`);
  });

  return bot;
}

// ============================================================
// START ALL BOTS
// ============================================================
config.accounts.forEach((account, i) => {
  setTimeout(() => {
    createBot(account);
  }, i * 4000); // delay مهم
});

// ============================================================
// EXPRESS ROUTES
// ============================================================

app.get('/health', (req, res) => {
  res.json({
    status: Object.values(botStates).some(b => b.connected) ? 'connected' : 'disconnected',
    bots: botStates,
    uptime: Math.floor(process.uptime())
  });
});

app.get('/', (req, res) => {
  res.send(`Bot is running with ${config.accounts.length} accounts`);
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🌐 Dashboard running on port ${PORT}`);
});
