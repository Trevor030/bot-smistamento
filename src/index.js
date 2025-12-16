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
const PREFIX = "!";

// Cleanup config
const CLEANUP_CHANNEL_ID = process.env.CLEANUP_CHANNEL_ID || QUIZ_CHANNEL_ID;
const CLEANUP_EVERY_MINUTES = Number(process.env.CLEANUP_EVERY_MINUTES || 30);
const DELETE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

if (!DISCORD_TOKEN || !QUIZ_CHANNEL_ID) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

// ===== CASE (NOMI ESATTI) =====
const HOUSES = {
  Grifondoro: "❤️🦁 Grifondoro",
  Serpeverde: "💚🐍 Serpeverde",
  Corvonero: "💙🦅 Corvonero",
  Tassorosso: "💛🦡 Tassorosso"
};
const HOUSE_KEYS = Object.keys(HOUSES);

// ===== QUIZ =====
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
  "Hmm… interessante…",
  "Vedo grandi qualità in te…",
  "La scelta non è facile…",
  "Il Cappello ha deciso!"
];

const HAT_SUSPENSE = [
  "🎩 Mmh… fammi vedere…",
  "🎩 Coraggio… ambizione… intelletto… lealtà…",
  "🎩 Difficile… davvero difficile…",
  "🎩 Vedo qualcosa di speciale in te…"
];

const HAT_FAKEOUT = [
  "🎩 Potrei metterti in… **GRIFONDORO**…",
  "🎩 Potrei metterti in… **SERPEVERDE**…",
  "🎩 Potrei metterti in… **CORVONERO**…",
  "🎩 Potrei metterti in… **TASSOROSSO**…"
];

// ===== STATE =====
const sessions = new Map();

// ===== HELPERS =====
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeStartRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quiz_start:${userId}`)
      .setLabel("🎩 Inizia il quiz")
      .setStyle(ButtonStyle.Primary)
  );
}

function makeAnswersRow(userId, step) {
  const row = new ActionRowBuilder();
  QUESTIONS[step].answers.forEach((a, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_answer:${userId}:${step}:${i}`)
        .setLabel(a.label)
        .setStyle(ButtonStyle.Secondary)
    );
  });
  return row;
}

async function getHouseRole(guild, houseKey) {
  const roleName = HOUSES[houseKey];
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    throw new Error(`Ruolo non trovato: ${roleName}`);
  }
  return role;
}

async function removeHouseRoles(member) {
  const toRemove = member.roles.cache.filter(r =>
    Object.values(HOUSES).includes(r.name)
  );
  if (toRemove.size) {
    await member.roles.remove([...toRemove.values()]);
  }
}

/**
 * Opzione C: probabilità dinamiche
 * - converte scores in probabilità (softmax)
 * - aggiunge un po' di "rumore" per evitare risultati troppo deterministici
 * - estrae la casa in base alle probabilità
 */
function softmaxProbs(scores) {
  const vals = HOUSE_KEYS.map(k => scores[k] ?? 0);

  // temperatura: più alta = più random, più bassa = più deterministico
  const T = 1.15;

  // shift per stabilità numerica
  const maxV = Math.max(...vals);
  const exps = vals.map(v => Math.exp((v - maxV) / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;

  let probs = exps.map(e => e / sum);

  // rumore leggero (±3%) e rinormalizza
  probs = probs.map(p => Math.max(0.0001, p + (Math.random() * 0.06 - 0.03)));
  const s2 = probs.reduce((a, b) => a + b, 0) || 1;
  probs = probs.map(p => p / s2);

  const out = {};
  HOUSE_KEYS.forEach((k, i) => (out[k] = probs[i]));
  return out;
}

function weightedPick(probMap) {
  const entries = Object.entries(probMap);
  let r = Math.random();
  for (const [k, p] of entries) {
    r -= p;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function formatProbs(probMap) {
  // piccola "lettura del cappello" (non troppo tecnica)
  const sorted = Object.entries(probMap).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  const nameTop = HOUSES[top[0]];
  const nameSecond = HOUSES[second[0]];
  return `🎩 *Sento una forte inclinazione verso* **${nameTop}**… *ma anche* **${nameSecond}** *mi chiama…*`;
}

// ===== CLEANUP (24h) =====
async function cleanupChannel(guild) {
  const channel = await guild.channels.fetch(CLEANUP_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const cutoff = Date.now() - DELETE_AFTER_MS;
  const now = Date.now();

  let lastId = null;
  let deletedCount = 0;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {})
    });

    if (batch.size === 0) break;

    const old = batch.filter(m => m.createdTimestamp < cutoff);

    if (old.size > 0) {
      const canBulk = old.filter(m => (now - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);

      if (canBulk.size > 0) {
        const res = await channel.bulkDelete(canBulk, true).catch(() => null);
        if (res) deletedCount += res.size ?? 0;
      }

      const leftovers = old.filter(m => (now - m.createdTimestamp) >= 14 * 24 * 60 * 60 * 1000);
      for (const msg of leftovers.values()) {
        await msg.delete().catch(() => {});
        deletedCount += 1;
      }
    }

    lastId = batch.last()?.id;
    if (!lastId) break;
  }

  if (deletedCount > 0) {
    console.log(`🧹 Cleanup: deleted ${deletedCount} messages in channel ${channel.id}`);
  }
}

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember]
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    cleanupChannel(guild).catch(console.error);
    setInterval(() => cleanupChannel(guild).catch(console.error), CLEANUP_EVERY_MINUTES * 60 * 1000);
  }
});

// ===== USER JOIN =====
client.on("guildMemberAdd", async (member) => {
  const channel = await member.guild.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  channel.send({
    content: `👋 Benvenuto ${member}! Pronto per lo **Smistamento**?`,
    components: [makeStartRow(member.id)]
  });
});

// ===== COMMANDS (!) =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "resetcasa") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply("❌ Non hai i permessi.");
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply("Usa: `!resetcasa @utente`");

    sessions.delete(target.id);
    await removeHouseRoles(target);

    const channel = await message.guild.channels.fetch(QUIZ_CHANNEL_ID);
    channel.send({
      content: `🎩 Il Cappello Parlante ti osserva ${target}, Mmh… testa interessante… vediamo dove metterti.`,
      components: [makeStartRow(target.id)]
    });

    message.reply(`✅ Casa rimossa per ${target.user.username}`);
  }
});

// ===== QUIZ =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [type, userId, stepStr, idxStr] = interaction.customId.split(":");
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "Questo quiz non è per te 👀", ephemeral: true });
  }

  // START
  if (type === "quiz_start") {
    sessions.set(userId, {
      step: 0,
      // score base: +1 per risposta, come prima
      scores: { Grifondoro: 0, Serpeverde: 0, Corvonero: 0, Tassorosso: 0 }
    });

    return interaction.reply({
      content: `${interaction.user} ${QUESTIONS[0].text}`,
      components: [makeAnswersRow(userId, 0)]
    });
  }

  // ANSWER
  if (type === "quiz_answer") {
    const step = Number(stepStr);
    const idx = Number(idxStr);
    const session = sessions.get(userId);
    if (!session || session.step !== step) return;

    const houseKey = QUESTIONS[step].answers[idx].house;
    session.scores[houseKey]++;

    const next = step + 1;

    if (next < QUESTIONS.length) {
      session.step = next;
      return interaction.update({
        content: `${interaction.user} ${QUESTIONS[next].text}`,
        components: [makeAnswersRow(userId, next)]
      });
    }

    // ===== FINE QUIZ (Opzione C) =====
    sessions.delete(userId);

    const member = await interaction.guild.members.fetch(userId);

    try {
      // calcolo probabilità
      const probs = softmaxProbs(session.scores);
      const winner = weightedPick(probs);

      const role = await getHouseRole(interaction.guild, winner);

      // Suspense: prima update “penso…”, poi un fakeout, poi reveal
      await interaction.update({
        content: `🎩 **${pick(HAT_LINES)}**\n${pick(HAT_SUSPENSE)}\n${formatProbs(probs)}`,
        components: []
      });

      await sleep(1200);

      await interaction.editReply({
        content: `🎩 **${pick(HAT_SUSPENSE)}**\n${pick(HAT_FAKEOUT)}`
      });

      await sleep(1200);

      // assegna ruolo + reveal finale
      await removeHouseRoles(member);
      await member.roles.add(role);

      await interaction.editReply({
        content: `🎩 **Il Cappello Parlante:** "HO DECISO!"\n✨ ${member} sei… **${role.name.toUpperCase()}**!`
      });

    } catch (e) {
      console.error(e);
      return interaction.update({
        content: "❌ Errore nell'assegnazione della Casa. Contatta un prefetto.",
        components: []
      });
    }
  }
});

client.login(DISCORD_TOKEN);
