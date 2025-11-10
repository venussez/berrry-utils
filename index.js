// -------------------- IMPORTS --------------------
const { Client, GatewayIntentBits } = require("discord.js");
const mineflayer = require("mineflayer");

// -------------------- FIX SKIN PARSING ERROR --------------------
// Patch JSON.parse to handle malformed skin data from Minecraft servers
const originalJSONParse = JSON.parse;
JSON.parse = function (text, reviver) {
  try {
    return originalJSONParse(text, reviver);
  } catch (err) {
    // Ignore skin parsing errors (malformed JSON from textures)
    if (text.includes("textures") && text.includes("SKIN")) {
      return { textures: { SKIN: { url: "" } } };
    }
    throw err;
  }
};

// -------------------- DISCORD BOT SETUP --------------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; // Replit secret
const DISCORD_CHANNEL_ID = "1437181661824553012"; // Your Discord channel ID

// -------------------- MODERATOR LIST --------------------
// Add/remove moderator names here
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

discordBot.once("clientReady", () => {
  console.log(`🤖 Discord bot logged in as ${discordBot.user.tag}`);
});

// -------------------- MINECRAFT BOT SETUP --------------------
const mcBot = mineflayer.createBot({
  host: "eu.mineberry.net", // Replace if needed
  username: "Vxqepoul", // Minecraft username
  version: "1.20.1", // Minecraft version
});

// Ignore errors and kicks
mcBot.on("error", (err) => console.log("Ignored bot error:", err.message));
mcBot.on("kicked", (reason) => console.log("Kicked from server:", reason));

// Track sneak state
let isSneaking = false;

// Track moderator check state
let checkingMods = false;
let currentModCheck = null;
let onlineMods = [];
let modCheckIndex = 0;

// Track single player check state
let checkingPlayer = false;
let playerCheckName = null;
let playerCheckMessage = null;

// Helper function for delays
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Automatically join BedWars on spawn
mcBot.once("spawn", () => {
  console.log("✅ Bot spawned, joining BedWars...");
  mcBot.chat("/bw");
});

// -------------------- CHAT BRIDGE --------------------
// Minecraft -> Discord
mcBot.on("chat", (username, message) => {
  console.log(`<${username}> ${message}`);
  const channel = discordBot.channels.cache.get(DISCORD_CHANNEL_ID);
  if (channel) channel.send(`**<${username}>** ${message}`);
});

// Minecraft system messages -> Discord
mcBot.on("message", (jsonMsg) => {
  const messageText = jsonMsg.toString();

  // Auto-rejoin BedWars if moved to AFK server
  if (messageText.includes("You are AFK, connecting you to the AFK server!")) {
    console.log("⚠️ Detected AFK kick, rejoining BedWars...");
    setTimeout(() => {
      mcBot.chat("/bw");
      console.log("✅ Rejoined BedWars after AFK");
    }, 2000); // Wait 2 seconds before rejoining
  }

  // Check if we're currently checking a single player
  if (checkingPlayer && playerCheckName && playerCheckMessage) {
    if (messageText.includes("Specified player is not currently in the duel")) {
      playerCheckMessage.reply(`✅ **${playerCheckName}** is **ONLINE**`);
      console.log(`✅ ${playerCheckName} is ONLINE`);
      checkingPlayer = false;
      playerCheckName = null;
      playerCheckMessage = null;
    }
    else if (messageText.includes("Specified player is not online")) {
      playerCheckMessage.reply(`❌ **${playerCheckName}** is **OFFLINE**`);
      console.log(`❌ ${playerCheckName} is OFFLINE`);
      checkingPlayer = false;
      playerCheckName = null;
      playerCheckMessage = null;
    }
  }

  // Check if we're currently checking moderators
  if (checkingMods && currentModCheck) {
    // Check if moderator is online (not in duel = online)
    if (messageText.includes("Specified player is not currently in the duel")) {
      onlineMods.push(currentModCheck);
      console.log(`✅ ${currentModCheck} is ONLINE`);
    }
    // Check if moderator is offline
    else if (messageText.includes("Specified player is not online")) {
      console.log(`❌ ${currentModCheck} is OFFLINE`);
    }
  }

  // Forward system messages to Discord (only if not checking mods or player to avoid spam)
  if (!checkingMods && !checkingPlayer) {
    const channel = discordBot.channels.cache.get(DISCORD_CHANNEL_ID);
    if (channel) channel.send(`[SYSTEM] ${messageText}`);
  }
});

// Discord -> Minecraft
discordBot.on("messageCreate", async (msg) => {
  if (msg.channel.id !== DISCORD_CHANNEL_ID) return;
  if (msg.author.bot) return; // avoid loops

  let message = msg.content;

  // Handle special bot commands
  if (message.toLowerCase() === "!mods") {
    msg.reply(`🔍 Checking ${MODERATOR_LIST.length} moderators...`);
    console.log(`Checking mods: ${MODERATOR_LIST.join(", ")}`);

    // Reset tracking variables
    checkingMods = true;
    onlineMods = [];

    for (let i = 0; i < MODERATOR_LIST.length; i++) {
      currentModCheck = MODERATOR_LIST[i];
      mcBot.chat(`/duel spectate ${currentModCheck}`);
      console.log(`Checking mod: ${currentModCheck}`);
      await sleep(1500); // 1.5 second delay to wait for server response
    }

    // Small delay to ensure last response is received
    await sleep(500);

    // Build result message
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
    const playerName = message.substring(8).trim(); // Get player name after "!online "
    
    if (!playerName) {
      msg.reply("❌ Please specify a player name. Usage: `!online playername`");
      return;
    }

    msg.reply(`🔍 Checking if **${playerName}** is online...`);
    console.log(`Checking player: ${playerName}`);

    // Set up tracking for this player check
    checkingPlayer = true;
    playerCheckName = playerName;
    playerCheckMessage = msg;

    // Send the check command
    mcBot.chat(`/duel spectate ${playerName}`);

    // Set timeout in case server doesn't respond
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

  if (
    message.toLowerCase() === "!shift" ||
    message.toLowerCase() === "!sneak"
  ) {
    isSneaking = !isSneaking;
    mcBot.setControlState("sneak", isSneaking);
    const status = isSneaking ? "enabled" : "disabled";
    msg.reply(`🔽 Shift mode ${status}`);
    console.log(`Shift mode ${status}`);
    return;
  }

  // Replace ! with / for Minecraft commands
  if (message.startsWith("!")) {
    message = "/" + message.slice(1);
  }

  mcBot.chat(message);
});
