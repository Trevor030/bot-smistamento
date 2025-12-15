require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require("discord.js");

// ===== ENV =====
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const QUIZ_CHANNEL_ID = process.env.QUIZ_CHANNEL_ID;

if (!DISCORD_TOKEN) {
  console.error("❌ Missing env: DISCORD_TOKEN");
  process.exit(1);
}
if (!QUIZ_CHANNEL_ID) {
  console.error("❌ Missing env: QUIZ_CHANNEL_ID (the channel where quiz will run)");
  process.exit(1);
}

// ===== CONFIG =====
const HOUSES = ["Grifondoro", "Serpeverde", "Corvonero", "Tassorosso"];

// Quiz rapidissimo (3 domande)
const QUESTIONS = [
  {
    text: "🏰 **Benvenuto a Hogwarts!** Cosa ti attira di più?",
    answers: [
      { label: "Mettermi alla prova", house: "Grifondoro" },
      { label: "Arrivare in alto", house: "Serpeverde" },
      { label: "Capire e scoprire", house: "Corvonero" },
      { label: "Stare con i miei", house: "Tassorosso" }
    ]
  },
  {
    text: "📚 Un compagno bara a un esame. Tu…",
    answers: [
      { label: "Lo affronti subito", house: "Grifondoro" },
      { label: "Lo usi a tuo vantaggio", house: "Serpeverde" },
      { label: "Valuti e poi decidi", house: "Corvonero" },
      { label: "Cerchi una via gentile", house: "Tassorosso" }
    ]
  },
  {
    text: "✨ Scegli un oggetto magico.",
    answers: [
      { label: "Spada antica", house: "Grifondoro" },
      { label: "Anello di potere", house: "Serpeverde" },
      { label: "Grimorio rarissimo", house: "Corvonero" },
      { label: "Oggetto che aiuta tutti", house: "Tassorosso" }
    ]
  }
];

const HAT_LINES = [
  "Hmm… interessante… molto interessante…",
  "Vedo coraggio, ambizione, intelletto… e lealtà…",
  "La scelta non è banale… ma il Cappello decide!",
  "Ah! Qui c’è del potenziale…"
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Sessioni quiz in memoria
const sessions = new Map(); // userId -> { step, scores, createdAt }

// Timeout sessione (5 minuti)
const SESSION_TTL_MS = 5 * 60 * 1000;

function newScores() {
  return Object.fromEntries(HOUSES.map(h => [h, 0]));
}

function makeStartRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quiz_start:${userId}`)
      .setLabel("🎩 Inizia il quiz")
      .setStyle(ButtonStyle.Primary)
  );
}

function makeAnswersRow(userId, step) {
  const q = QUESTIONS[step];
  const row = new ActionRowBuilder();
  q.answers.forEach((a, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_answer:${userId}:${step}:${idx}`)
        .setLabel(a.label)
        .setStyle(ButtonStyle.Secondary)
    );
  });
  return row;
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
  const houseRoleNames = new Set(HOUSES);
  const rolesToRemove = member.roles.cache.filter(r => houseRoleNames.has(r.name));
  if (rolesToRemove.size > 0) {
    await member.roles.remove([...rolesToRemove.values()]);
  }
}

function sessionValid(s) {
  return s && (Date.now() - s.createdAt) <= SESSION_TTL_MS;
}

async function postQuizInvite(guild, targetMember) {
  const channel = await guild.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
  if (!channel) throw new Error("Quiz channel not found (check QUIZ_CHANNEL_ID).");

  await channel.send({
    content: `🎩 ${targetMember} il Cappello Parlante ti aspetta. Clicca per iniziare!`,
    components: [makeStartRow(targetMember.id)]
  });
}

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`➡️ Quiz channel id: ${QUIZ_CHANNEL_ID}`);
});

// Quando entra un utente: manda messaggio nel canale quiz
client.on("guildMemberAdd", async (member) => {
  try {
    const channel = await member.guild.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    await channel.send({
      content: `👋 Benvenuto ${member}! Pronto per lo **Smistamento**?`,
      components: [makeStartRow(member.id)]
    });
  } catch (err) {
    console.error("guildMemberAdd error:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    // ===== Slash command: /resetcasa =====
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== "resetcasa") return;

      // permessi: Manage Roles o Admin
      const ok =
        interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageRoles) ||
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

      if (!ok) {
        return interaction.reply({ content: "Solo mod/admin possono usare **/resetcasa**.", ephemeral: true });
      }

      const user = interaction.options.getUser("utente", true);
      const guild = interaction.guild;
      if (!guild) return interaction.reply({ content: "Questo comando funziona solo in un server.", ephemeral: true });

      const targetMember = await guild.members.fetch(user.id);

      // reset sessione quiz (se c'è)
      sessions.delete(user.id);

      // rimuovi ruoli casa
      await removeOtherHouseRoles(targetMember);

      // riposta invito quiz
      await postQuizInvite(guild, targetMember);

      return interaction.reply({
        content: `✅ Casa rimossa per ${targetMember}. Ho ripubblicato il quiz nel canale.`,
        ephemeral: true
      });
    }

    // ===== Bottoni quiz =====
    if (!interaction.isButton()) return;

    const id = interaction.customId;

    // START
    if (id.startsWith("quiz_start:")) {
      const [, targetUserId] = id.split(":");

      if (interaction.user.id !== targetUserId) {
        return interaction.reply({ content: "Questo quiz non è per te 👀", ephemeral: true });
      }

      // Se già ha una casa, blocca
      const member = interaction.member;
      const alreadyHouse = member?.roles?.cache?.some(r => HOUSES.includes(r.name));
      if (alreadyHouse) {
        return interaction.reply({
          content: "Hai già una Casa! Se vuoi cambiare, chiedi a un mod di usare **/resetcasa**.",
          ephemeral: true
        });
      }

      sessions.set(targetUserId, { step: 0, scores: newScores(), createdAt: Date.now() });

      return interaction.reply({
        content: `${interaction.user} ${QUESTIONS[0].text}`,
        components: [makeAnswersRow(targetUserId, 0)]
      });
    }

    // ANSWER
    if (id.startsWith("quiz_answer:")) {
      const [, targetUserId, stepStr, idxStr] = id.split(":");
      const step = Number(stepStr);
      const idx = Number(idxStr);

      if (interaction.user.id !== targetUserId) {
        return interaction.reply({ content: "Questo quiz non è per te 👀", ephemeral: true });
      }

      const session = sessions.get(targetUserId);
      if (!sessionValid(session) || session.step !== step) {
        sessions.delete(targetUserId);
        return interaction.reply({
          content: "Sessione scaduta o non valida. Riclicca **Inizia il quiz** nel messaggio del canale.",
          ephemeral: true
        });
      }

      const chosen = QUESTIONS[step].answers[idx];
      if (!chosen) return interaction.reply({ content: "Risposta non valida.", ephemeral: true });

      session.scores[chosen.house] += 1;

      const nextStep = step + 1;

      // prossima domanda
      if (nextStep < QUESTIONS.length) {
        session.step = nextStep;
        sessions.set(targetUserId, session);

        return interaction.update({
          content: `${interaction.user} ${QUESTIONS[nextStep].text}`,
          components: [makeAnswersRow(targetUserId, nextStep)]
        });
      }

      // FINE QUIZ
      sessions.delete(targetUserId);

      const entries = Object.entries(session.scores);
      const max = Math.max(...entries.map(([, v]) => v));
      const top = entries.filter(([, v]) => v === max).map(([k]) => k);
      const finalHouse = pickRandom(top);

      const guild = interaction.guild;
      if (!guild) return interaction.update({ content: "Errore: solo in server.", components: [] });

      const member = await guild.members.fetch(targetUserId);

      await removeOtherHouseRoles(member);

      const role = await ensureRole(guild, finalHouse);
      await member.roles.add(role);

      const hatLine = pickRandom(HAT_LINES);

      return interaction.update({
        content: `🎩 **Cappello Parlante:** "${hatLine}"\n✨ ${member} sei… **${finalHouse.toUpperCase()}**!`,
        components: []
      });
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: "Errore interno del bot. Controlla i log.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(DISCORD_TOKEN);
