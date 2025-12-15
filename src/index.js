require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const HOUSES = [
  { name: "Grifondoro", role: "Grifondoro" },
  { name: "Serpeverde", role: "Serpeverde" },
  { name: "Corvonero", role: "Corvonero" },
  { name: "Tassorosso", role: "Tassorosso" }
];

const HAT_LINES = [
  "Hmm… interessante… molto interessante…",
  "Ah! Qui c'è del potenziale…",
  "Difficile… davvero difficile…",
  "Vedo coraggio, ambizione, intelletto… e lealtà…",
  "La scelta non è banale… ma il Cappello decide!"
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function ensureRole(guild, roleName) {
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      reason: "Sorting Hat bot: auto-create house role"
    });
  }
  return role;
}

async function removeOtherHouseRoles(member) {
  const houseRoleNames = new Set(HOUSES.map(h => h.role));
  const rolesToRemove = member.roles.cache.filter(r => houseRoleNames.has(r.name));
  if (rolesToRemove.size > 0) {
    await member.roles.remove([...rolesToRemove.values()]);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    if (cmd !== "smistamento" && cmd !== "rismista") return;

    await interaction.deferReply({ ephemeral: false });

    const guild = interaction.guild;
    const member = interaction.member; // GuildMember

    if (!guild || !member) {
      return interaction.editReply("Errore: questo comando funziona solo in un server.");
    }

    // Per /rismista puoi limitare ai mod/admin (consigliato)
    if (cmd === "rismista") {
      const hasPerm =
        interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageRoles) ||
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

      if (!hasPerm) {
        return interaction.editReply("Solo mod/admin possono usare **/rismista**.");
      }
    }

    // Se non vuoi rismistare, blocca chi ha già un ruolo casa:
    if (cmd === "smistamento") {
      const already = member.roles.cache.some(r => HOUSES.some(h => h.role === r.name));
      if (already) {
        return interaction.editReply("Hai già una Casa! Se vuoi cambiare, chiedi a un mod di usare **/rismista**.");
      }
    }

    // Rimuove eventuali ruoli casa (così /rismista funziona)
    await removeOtherHouseRoles(member);

    // Scegli casa
    const chosen = pickRandom(HOUSES);
    const role = await ensureRole(guild, chosen.role);

    // Assicurati che il bot possa assegnare il ruolo:
    // IMPORTANTISSIMO: il ruolo del bot deve stare sopra i ruoli Casa nella gerarchia.
    await member.roles.add(role);

    const line = pickRandom(HAT_LINES);
    await interaction.editReply(
      `🎩 **Cappello Parlante:** "${line}"\n` +
      `✨ **${member.user.username}**, la tua Casa è… **${chosen.name.toUpperCase()}**!`
    );

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply("Errore interno del bot. Controlla i log.");
    }
  }
});

client.login(token);
