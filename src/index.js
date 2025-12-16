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
const DELETE_AFTER_MS = 6 * 60 * 60 * 1000; // ✅ 6h

// Session timeout
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000); // 10 min

// ✅ Ruoli “default”
const MUGGLE_ROLE_NAME = process.env.MUGGLE_ROLE_NAME || "🪄 Babbani";
const BOT_ROLE_NAME = process.env.BOT_ROLE_NAME || "👻 Spiriti del castello";

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
const HOUSE_ROLE_NAMES = new Set(Object.values(HOUSES));

// ===== QUIZ (5 domande realistiche) =====
const QUESTIONS = [
  {
    text: "🏰 **Arrivi a Hogwarts.** Nei primi giorni, cosa fai più spesso?",
    answers: [
      { label: "Esploro il castello anche dove non dovrei", house: "Grifondoro" },
      { label: "Capisco chi conta e con chi conviene legare", house: "Serpeverde" },
      { label: "Biblioteca, regole, mappe e curiosità", house: "Corvonero" },
      { label: "Trovo il mio gruppo e aiuto chi è in difficoltà", house: "Tassorosso" }
    ]
  },
  {
    text: "📚 In una lezione pratica, un incantesimo ti riesce male davanti a tutti. Tu…",
    answers: [
      { label: "Riprovo subito, anche rischiando", house: "Grifondoro" },
      { label: "Rendo l’errore una mossa “furba”", house: "Serpeverde" },
      { label: "Analizzo cosa non torna e ritento", house: "Corvonero" },
      { label: "Mi esercito con calma dopo lezione", house: "Tassorosso" }
    ]
  },
  {
    text: "🧪 In Pozioni, lavorate a coppie. Il partner è inesperto. Cosa fai?",
    answers: [
      { label: "Prendo in mano per evitare disastri", house: "Grifondoro" },
      { label: "Lo guido, ma senza perdere vantaggio", house: "Serpeverde" },
      { label: "Spiego il perché dei passaggi", house: "Corvonero" },
      { label: "Lo incoraggio e lo faccio crescere", house: "Tassorosso" }
    ]
  },
  {
    text: "🌙 Notte. Senti un rumore strano in corridoio: forse qualcuno è nei guai.",
    answers: [
      { label: "Esco a controllare subito", house: "Grifondoro" },
      { label: "Prima capisco se mi conviene intervenire", house: "Serpeverde" },
      { label: "Mi muovo con un piano e attenzione", house: "Corvonero" },
      { label: "Avviso un prefetto/prof e resto vicino", house: "Tassorosso" }
    ]
  },
  {
    text: "🏆 Puoi far guadagnare punti alla tua Casa con un’azione concreta. Come agisci?",
    answers: [
      { label: "Mi butto: l’occasione è adesso", house: "Grifondoro" },
      { label: "Scelgo la strategia più efficace", house: "Serpeverde" },
      { label: "Mi preparo e faccio tutto “pulito”", house: "Corvonero" },
      { label: "Coinvolgo gli altri: si vince insieme", house: "Tassorosso" }
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

function makeStartRow(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quiz_start:${userId}`)
      .setLabel("🎩 Inizia il quiz")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
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

async function fetchRoles(guild) {
  await guild.roles.fetch().catch(() => null);
}

function endSession(userId) {
  const s = sessions.get(userId);
  if (s?.timeout) clearTimeout(s.timeout);
  sessions.delete(userId);
}

async function getRoleByName(guild, roleName) {
  await fetchRoles(guild);
  const role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) throw new Error(`Ruolo non trovato: ${roleName}`);
  return role;
}

async function getHouseRole(guild, houseKey) {
  const roleName = HOUSES[houseKey];
  return getRoleByName(guild, roleName);
}

function memberHasAnyHouse(member) {
  return member.roles.cache.some((r) => HOUSE_ROLE_NAMES.has(r.name));
}

async function removeHouseRoles(member) {
  const toRemove = member.roles.cache.filter((r) => HOUSE_ROLE_NAMES.has(r.name));
  if (toRemove.size) await member.roles.remove([...toRemove.values()]);
}

async function removeMuggleRoleIfAny(member, guild) {
  const role = guild.roles.cache.find((r) => r.name === MUGGLE_ROLE_NAME);
  if (role && member.roles.cache.has(role.id)) {
    await member.roles.remove(role).catch(() => {});
  }
}

async function ensureDefaultRole(member) {
  const guild = member.guild;
  await fetchRoles(guild);

  // BOT => Spiriti del castello, niente babbani
  if (member.user.bot) {
    const botRole = guild.roles.cache.find((r) => r.name === BOT_ROLE_NAME);
    if (botRole && !member.roles.cache.has(botRole.id)) {
      await member.roles.add(botRole).catch(() => {});
    }
    await removeMuggleRoleIfAny(member, guild);
    return;
  }

  // UMANI => se non hanno una Casa => Babbani
  if (!memberHasAnyHouse(member)) {
    const muggleRole = guild.roles.cache.find((r) => r.name === MUGGLE_ROLE_NAME);
    if (muggleRole && !member.roles.cache.has(muggleRole.id)) {
      await member.roles.add(muggleRole).catch(() => {});
    }
  } else {
    // se hanno una Casa, non devono restare babbani
    await removeMuggleRoleIfAny(member, guild);
  }
}

/**
 * softmax + rumore
 */
function softmaxProbs(scores) {
  const vals = HOUSE_KEYS.map((k) => scores[k] ?? 0);
  const T = 1.15;

  const maxV = Math.max(...vals);
  const exps = vals.map((v) => Math.exp((v - maxV) / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;

  let probs = exps.map((e) => e / sum);

  probs = probs.map((p) => Math.max(0.0001, p + (Math.random() * 0.06 - 0.03)));
  const s2 = probs.reduce((a, b) => a + b, 0) || 1;
  probs = probs.map((p) => p / s2);

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
  const sorted = Object.entries(probMap).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];

  const nameTop = HOUSES[top[0]];
  const nameSecond = HOUSES[second[0]];

  if (top[1] - second[1] < 0.12) {
    return `🎩 *Sento una forte inclinazione verso* **${nameTop}**… *ma anche* **${nameSecond}** *mi chiama…*`;
  }
  return `🎩 *Vedo una strada piuttosto chiara davanti a te…* **${nameTop}**…`;
}

// ===== CLEANUP (6h) =====
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

    const oldestInBatch = batch.last();
    const old = batch.filter((m) => m.createdTimestamp < cutoff);

    if (old.size > 0) {
      const canBulk = old.filter((m) => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      if (canBulk.size > 0) {
        const res = await channel.bulkDelete(canBulk, true).catch(() => null);
        if (res) deletedCount += res.size ?? 0;
      }

      const leftovers = old.filter((m) => now - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
      for (const msg of leftovers.values()) {
        await msg.delete().catch(() => {});
        deletedCount += 1;
      }
    }

    lastId = batch.last()?.id;

    // stop presto se siamo già in zona “recente”
    if (oldestInBatch && oldestInBatch.createdTimestamp >= cutoff) break;
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

  // ✅ opzionale ma utile: all’avvio, sistemi i ruoli “default”
  for (const guild of client.guilds.cache.values()) {
    await fetchRoles(guild);

    // attenzione: su server grandi può essere pesante, ma è quello che chiedi (“tutti gli utenti…”)
    await guild.members.fetch().catch(() => null);
    for (const member of guild.members.cache.values()) {
      await ensureDefaultRole(member);
    }

    cleanupChannel(guild).catch(console.error);
    setInterval(() => cleanupChannel(guild).catch(console.error), CLEANUP_EVERY_MINUTES * 60 * 1000);
  }
});

// ===== USER JOIN =====
client.on("guildMemberAdd", async (member) => {
  // ✅ assegna subito Babbani / Spiriti del castello
  await ensureDefaultRole(member);

  // bot: niente quiz
  if (member.user.bot) return;

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

    // ✅ cancella il comando dell’utente (così resta solo il messaggio “Casata rimossa…”)
    // serve Manage Messages al bot nel canale
    await message.delete().catch(() => {});

    endSession(target.id);
    await removeHouseRoles(target);

    // dopo aver rimosso la casa, torna babbano (finché non rifà il quiz)
    await ensureDefaultRole(target);

    const channel = await message.guild.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    // ✅ 1) messaggio “casata rimossa…”
    await channel.send({
      content: `✅ Casata rimossa per ${target} `
    });

    // ✅ 2) subito dopo: quiz
    await channel.send({
      content: `🎩 Il Cappello Parlante ti osserva ${target}, Mmh… testa interessante… vediamo dove metterti.`,
      components: [makeStartRow(target.id)]
    });
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
    if (sessions.has(userId)) {
      return interaction.reply({ content: "🎩 Hai già iniziato il quiz!", ephemeral: true });
    }

    const session = {
      step: 0,
      scores: { Grifondoro: 0, Serpeverde: 0, Corvonero: 0, Tassorosso: 0 },
      createdAt: Date.now(),
      timeout: null
    };

    session.timeout = setTimeout(() => endSession(userId), SESSION_TTL_MS);
    sessions.set(userId, session);

    // ✅ evita spam: aggiorna il messaggio col bottone
    return interaction.update({
      content: `${interaction.user} ${QUESTIONS[0].text}`,
      components: [makeAnswersRow(userId, 0)]
    });
  }

  // ANSWER
  if (type === "quiz_answer") {
    const step = Number(stepStr);
    const idx = Number(idxStr);
    const session = sessions.get(userId);

    if (!session) {
      return interaction.reply({
        content: "⏳ Sessione scaduta. Premi **Inizia il quiz** di nuovo.",
        ephemeral: true
      });
    }

    if (session.step !== step) {
      return interaction.reply({
        content: "⚠️ Questa domanda non è più valida. Continua dal quiz attuale.",
        ephemeral: true
      });
    }

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

    // ===== FINE QUIZ =====
    const member = await interaction.guild.members.fetch(userId);

    try {
      const probs = softmaxProbs(session.scores);
      const winner = weightedPick(probs);
      const role = await getHouseRole(interaction.guild, winner);

      endSession(userId);

      await interaction.update({
        content: `🎩 **${pick(HAT_LINES)}**\n${pick(HAT_SUSPENSE)}\n${formatProbs(probs)}`,
        components: []
      });

      await sleep(1200);

      await interaction.editReply({
        content: `🎩 **${pick(HAT_SUSPENSE)}**\n${pick(HAT_FAKEOUT)}`
      });

      await sleep(1200);

      // ✅ assegna casa: rimuove case vecchie + babbani
      await removeHouseRoles(member);
      await removeMuggleRoleIfAny(member, interaction.guild);
      await member.roles.add(role);

      await interaction.editReply({
        content: `🎩 **Il Cappello Parlante:** "HO DECISO!"\n✨ ${member} sei… **${role.name.toUpperCase()}**!`
      });

    } catch (e) {
      console.error(e);
      endSession(userId);
      return interaction.update({
        content: "❌ Errore nell'assegnazione della Casa. Contatta un prefetto.",
        components: []
      });
    }
  }
});

client.login(DISCORD_TOKEN);
