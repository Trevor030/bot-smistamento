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

// ✅ 6h invece di 24h
const DELETE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h

// ✅ session timeout (anti sessioni “a metà”)
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000); // 10 min default

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

// ===== QUIZ (5 domande, più realistiche) =====
const QUESTIONS = [
  {
    text: "🏰 **Arrivi a Hogwarts.** Nei primi giorni, cosa fai più spesso?",
    answers: [
      { label: "Esploro il castello anche dove non dovrei", house: "Grifondoro" },
      { label: "Capisco subito chi conta e con chi conviene legare", house: "Serpeverde" },
      { label: "Mi informo: regole, mappe, biblioteca e curiosità", house: "Corvonero" },
      { label: "Cerco il mio gruppo e aiuto a sistemarsi chi è in difficoltà", house: "Tassorosso" }
    ]
  },
  {
    text: "📚 Durante una lezione pratica, un incantesimo ti riesce male davanti a tutti. Tu…",
    answers: [
      { label: "Riprovo subito, anche se rischio di sbagliare ancora", house: "Grifondoro" },
      { label: "Mantengo la faccia: trasformo l’errore in una mossa intelligente", house: "Serpeverde" },
      { label: "Chiedo cosa non torna e analizzo la formula con calma", house: "Corvonero" },
      { label: "Sorrido, mi scuso e poi mi esercito con pazienza dopo lezione", house: "Tassorosso" }
    ]
  },
  {
    text: "🧪 In Pozioni, vi danno un compito a coppie. Il tuo partner è inesperto. Cosa fai?",
    answers: [
      { label: "Prendo in mano la situazione per non far saltare il banco", house: "Grifondoro" },
      { label: "Lo guido, ma in modo che il merito ricada anche su di me", house: "Serpeverde" },
      { label: "Spiego il perché dei passaggi: così impariamo entrambi", house: "Corvonero" },
      { label: "Lo incoraggio e gli faccio fare i passaggi più semplici finché prende fiducia", house: "Tassorosso" }
    ]
  },
  {
    text: "🌙 Notte. Senti un rumore strano in corridoio: potrebbe essere qualcuno nei guai.",
    answers: [
      { label: "Esco a controllare subito, anche se rischio una punizione", house: "Grifondoro" },
      { label: "Valuto se mi conviene: prima capisco cosa sta succedendo", house: "Serpeverde" },
      { label: "Ragiono: trappole, pericoli, indizi… poi mi muovo con un piano", house: "Corvonero" },
      { label: "Avviso un prefetto o un professore, ma resto vicino per sicurezza", house: "Tassorosso" }
    ]
  },
  {
    text: "🏆 A fine anno, c’è una possibilità concreta di far guadagnare punti alla tua Casa. Come ti comporti?",
    answers: [
      { label: "Mi butto: l’occasione è adesso", house: "Grifondoro" },
      { label: "Punto alla strategia migliore per massimizzare il risultato", house: "Serpeverde" },
      { label: "Mi preparo: studio e faccio le cose nel modo più corretto possibile", house: "Corvonero" },
      { label: "Coinvolgo gli altri: se vinciamo, vinciamo insieme", house: "Tassorosso" }
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

async function getHouseRole(guild, houseKey) {
  const roleName = HOUSES[houseKey];

  // ✅ robusto: assicura cache aggiornata
  await guild.roles.fetch().catch(() => null);

  const role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) throw new Error(`Ruolo non trovato: ${roleName}`);
  return role;
}

async function removeHouseRoles(member) {
  const toRemove = member.roles.cache.filter((r) =>
    Object.values(HOUSES).includes(r.name)
  );
  if (toRemove.size) {
    await member.roles.remove([...toRemove.values()]);
  }
}

function endSession(userId) {
  const s = sessions.get(userId);
  if (s?.timeout) clearTimeout(s.timeout);
  sessions.delete(userId);
}

/**
 * Opzione C: probabilità dinamiche
 * - softmax su scores
 * - rumore leggero per evitare risultati troppo deterministici
 */
function softmaxProbs(scores) {
  const vals = HOUSE_KEYS.map((k) => scores[k] ?? 0);

  // temperatura: più alta = più random, più bassa = più deterministico
  const T = 1.15;

  const maxV = Math.max(...vals);
  const exps = vals.map((v) => Math.exp((v - maxV) / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;

  let probs = exps.map((e) => e / sum);

  // rumore leggero (±3%) e rinormalizza
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

  // ✅ più “magico”: cita la seconda casa solo se è davvero vicina
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
      const canBulk = old.filter(
        (m) => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      if (canBulk.size > 0) {
        const res = await channel.bulkDelete(canBulk, true).catch(() => null);
        if (res) deletedCount += res.size ?? 0;
      }

      const leftovers = old.filter(
        (m) => now - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000
      );
      for (const msg of leftovers.values()) {
        await msg.delete().catch(() => {});
        deletedCount += 1;
      }
    }

    lastId = batch.last()?.id;

    // ✅ ottimizzazione: se il più vecchio del batch è comunque “recente”, stop
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

  for (const guild of client.guilds.cache.values()) {
    cleanupChannel(guild).catch(console.error);
    setInterval(
      () => cleanupChannel(guild).catch(console.error),
      CLEANUP_EVERY_MINUTES * 60 * 1000
    );
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

    endSession(target.id);
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
    // se esiste già una sessione, evita re-start strani
    if (sessions.has(userId)) {
      return interaction.reply({ content: "🎩 Hai già iniziato il quiz!", ephemeral: true });
    }

    const session = {
      step: 0,
      scores: { Grifondoro: 0, Serpeverde: 0, Corvonero: 0, Tassorosso: 0 },
      createdAt: Date.now(),
      timeout: null
    };

    // ✅ session TTL: se l’utente molla, puliamo
    session.timeout = setTimeout(() => endSession(userId), SESSION_TTL_MS);
    sessions.set(userId, session);

    // ✅ niente spam: aggiorna il messaggio con il bottone (non reply)
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
      return interaction.reply({ content: "⏳ Sessione scaduta. Premi **Inizia il quiz** di nuovo.", ephemeral: true });
    }

    // ✅ se qualcuno clicka roba “vecchia”, ignoriamo pulito
    if (session.step !== step) {
      return interaction.reply({ content: "⚠️ Questa domanda non è più valida. Continua dal quiz attuale.", ephemeral: true });
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

      // pulisci sessione solo ora (dopo aver calcolato tutto)
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

      // assegna ruolo + reveal finale
      await removeHouseRoles(member);
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
