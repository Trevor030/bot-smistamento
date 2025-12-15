require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("resetcasa")
    .setDescription("Rimuove la Casa di un utente e lo rimanda al quiz (solo mod/admin).")
    .addUserOption(opt =>
      opt.setName("utente")
        .setDescription("Seleziona l'utente da resettare")
        .setRequired(true)
    )
    // Nota: questa è “indicazione” lato Discord; comunque controlliamo anche nel codice.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering guild slash commands…");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Done.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
