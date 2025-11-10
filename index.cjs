// -------------------- IMPORTS --------------------
const { Client, GatewayIntentBits } = require("discord.js");
const mineflayer = require("mineflayer");
const express = require("express");

// -------------------- EXPRESS KEEP-ALIVE --------------------
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Express server running on port ${PORT}`));

// -------------------- FIX SKIN PARSING ERROR --------------------
const originalJSONParse = JSON.parse;
JSON.parse = function (text, reviver) {
  try {
    return originalJSONParse(text, reviver);
  } catch (err) {
    if (text.includes("textures") && text.includes("SKIN")) {
      return { textures: { SKIN: { url: "" } } };
    }
    throw err;
  }
};

// -------------------- DISCORD BOT SETUP --------------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = "1437181661824553012"; // replace with your channel ID

const MODERATOR_LIST = [
  "smallraisinboy",
  "Moksh_",
  "demon_13263",
  "toxciver",
  "pandiai",
  "SSRSyt",
  "GhostGirl_",
];

const discordBot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

discordBot.login(DISCORD_TOKEN);

discordBot.once("ready", () => {
  console.log(`🤖 Discord bot logged in as ${discordBot.user.tag}`);
});

// -------------------- MINECRAFT BOT SETUP --------------------
const mcBot = mineflayer.createBot({
  host: "eu.mineberry.net", // replace if needed
  username: "Vxqepoul", // Minecraft username
  version: "1.20.1",
});

mcBot.on("error", (err) => console.log("Ignored bot error:", err.message));
mcBot.on("kicked", (reason) => console.log("Kicked from server:", reason));

let isSneaking = false;
let checkingMods = false;
let currentModCheck = null;
let onlineMods = [];
let checkingPlayer = false;
let playerCheckName = null;
let playerCheckMessage = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mcBot.once("spawn", () => {
  console.log("✅ Bot spawned, joining BedWars...");
  mcBot.chat("/bw");
});

// -------------------- CHAT BRIDGE --------------------
mcBot.on("chat", (username, message) => {
  console.log(`<${username}> ${message}`);
  const channel = discordBot.channels.cache.get(DISCORD_CHANNEL_ID);
  if (channel) channel.send(`**<${username}>** ${message}`);
});

mcBot.on("message", (jsonMsg) => {
  const messageText = jsonMsg.toString();

  if (messageText.includes("You are AFK, connecting you to the AFK server!")) {
    console.log("⚠️ Detected AFK kick, rejoining BedWars...");
    setTimeout(() => {
      mcBot.chat("/bw");
      console.log("✅ Rejoined BedWars after AFK");
    }, 2000);
  }

  if (checkingPlayer && playerCheckName && playerCheckMessage) {
    if (messageText.includes("Specified player is not currently in the duel")) {
      playerCheckMessage.reply(`✅ **${playerCheckName}** is **ONLINE**`);
      checkingPlayer = false;
      playerCheckName = null;
      playerCheckMessage = null;
    } else if (messageText.includes("Specified player is not online")) {
      playerCheckMessage.reply(`❌ **${playerCheckName}** is **OFFLINE**`);
      checkingPlayer = false;
      playerCheckName = null;
      playerCheckMessage = null;
    }
  }

  if (checkingMods && currentModCheck) {
    if (messageText.includes("Specified player is not currently in the duel")) {
      onlineMods.push(currentModCheck);
    } else if (messageText.includes("Specified player is not online")) {
      // offline, do nothing
    }
  }

  if (!checkingMods && !checkingPlayer) {
    const channel = discordBot.channels.cache.get(DISCORD_CHANNEL_ID);
    if (channel) channel.send(`[SYSTEM] ${messageText}`);
  }
});

discordBot.on("messageCreate", async (msg) => {
  if (msg.channel.id !== DISCORD_CHANNEL_ID) return;
  if (msg.author.bot) return;

  let message = msg.content;

  if (message.toLowerCase() === "!mods") {
    msg.reply(`🔍 Checking ${MODERATOR_LIST.length} moderators...`);
    checkingMods = true;
    onlineMods = [];

    for (let i = 0; i < MODERATOR_LIST.length; i++) {
      currentModCheck = MODERATOR_LIST[i];
      mcBot.chat(`/duel spectate ${currentModCheck}`);
      await sleep(1500);
    }

    await sleep(500);
    checkingMods = false;
    currentModCheck = null;

    if (onlineMods.length === 0) {
      msg.reply(`❌ No moderators online`);
    } else {
      const modList = onlineMods.map((name) => `✅ ${name}`).join("\n");
      msg.reply(`**Online Moderators (${onlineMods.length}):**\n${modList}`);
    }

    return;
  }

  if (message.toLowerCase().startsWith("!online ")) {
    const playerName = message.substring(8).trim();
    if (!playerName) {
      msg.reply("❌ Please specify a player name.");
      return;
    }

    msg.reply(`🔍 Checking if **${playerName}** is online...`);
    checkingPlayer = true;
    playerCheckName = playerName;
    playerCheckMessage = msg;
    mcBot.chat(`/duel spectate ${playerName}`);

    setTimeout(() => {
      if (checkingPlayer && playerCheckName === playerName) {
        msg.reply(`⚠️ No response from server for **${playerName}**`);
        checkingPlayer = false;
        playerCheckName = null;
        playerCheckMessage = null;
      }
    }, 3000);

    return;
  }

  if (message.toLowerCase() === "!shift" || message.toLowerCase() === "!sneak") {
    isSneaking = !isSneaking;
    mcBot.setControlState("sneak", isSneaking);
    const status = isSneaking ? "enabled" : "disabled";
    msg.reply(`🔽 Shift mode ${status}`);
    return;
  }

  if (message.startsWith("!")) {
    message = "/" + message.slice(1);
  }

  mcBot.chat(message);
});
