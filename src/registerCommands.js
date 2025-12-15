require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("smistamento")
    .setDescription("Il Cappello Parlante decide la tua Casa!"),
  new SlashCommandBuilder()
    .setName("rismista")
    .setDescription("Rimuove la tua Casa e ti rismista (admin/mod consigliato)."),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering guild slash commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log("Done.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
