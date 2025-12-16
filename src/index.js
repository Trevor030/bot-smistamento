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
const DELETE_AFTER_MS = 6 * 60 * 60 * 1000; // ✅ 6 ore

// Session timeout (anti utenti che mollano a metà)
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000); // 10 min

// Ruoli default
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

// ===== QUESTION BANK (serio / realistico) =====
const QUESTIONS_BANK = [
  {
    text: "📜 Durante il primo mese a Hogwarts, cosa ti mette più a tuo agio nella routine quotidiana?",
    answers: [
      { label: "Avere libertà di movimento e decidere sul momento cosa fare", house: "Grifondoro" },
      { label: "Capire bene come funzionano regole, spazi e persone", house: "Corvonero" },
      { label: "Sapere di poter contare su un gruppo stabile", house: "Tassorosso" },
      { label: "Sentire di stare costruendo qualcosa che ti tornerà utile nel tempo", house: "Serpeverde" }
    ]
  },
  {
    text: "📚 Un professore assegna un compito complesso con istruzioni volutamente vaghe. Tu come reagisci?",
    answers: [
      { label: "Inizi comunque e aggiusti man mano", house: "Grifondoro" },
      { label: "Cerchi di interpretare cosa il professore si aspetta davvero", house: "Serpeverde" },
      { label: "Analizzi esempi simili prima di partire", house: "Corvonero" },
      { label: "Ti organizzi con altri per chiarire dubbi e procedere insieme", house: "Tassorosso" }
    ]
  },
  {
    text: "🧪 In laboratorio noti che una procedura potrebbe funzionare meglio se modificata leggermente, ma non è indicato.",
    answers: [
      { label: "Provi la modifica, assumendoti il rischio", house: "Grifondoro" },
      { label: "Valuti se conviene farlo senza attirare attenzione", house: "Serpeverde" },
      { label: "Ragioni sulle conseguenze prima di decidere", house: "Corvonero" },
      { label: "Preferisci attenerti alle istruzioni per non creare problemi", house: "Tassorosso" }
    ]
  },
  {
    text: "🏰 Dopo qualche settimana, inizi a orientarti nel castello. Come succede di solito?",
    answers: [
      { label: "Seguendo l’istinto e sbagliando strada", house: "Grifondoro" },
      { label: "Osservando come si muovono gli altri", house: "Serpeverde" },
      { label: "Ricostruendo mentalmente percorsi e mappe", house: "Corvonero" },
      { label: "Chiedendo indicazioni finché non ti senti sicuro", house: "Tassorosso" }
    ]
  },
  {
    text: "👥 Durante un lavoro di gruppo, emerge un disaccordo su come procedere. Tu cosa fai?",
    answers: [
      { label: "Espressi chiaramente la tua posizione", house: "Grifondoro" },
      { label: "Cerchi di spostare il gruppo verso la soluzione più efficace", house: "Serpeverde" },
      { label: "Provi a capire quale opzione è più solida", house: "Corvonero" },
      { label: "Ti concentri sul mantenere un clima collaborativo", house: "Tassorosso" }
    ]
  },
  {
    text: "🌙 Una sera senti parlare di un’area del castello poco frequentata ma interessante. Come ti comporti?",
    answers: [
      { label: "Vai a dare un’occhiata quando puoi", house: "Grifondoro" },
      { label: "Valuti se e quando è il momento giusto", house: "Serpeverde" },
      { label: "Cerchi informazioni prima di muoverti", house: "Corvonero" },
      { label: "Aspetti qualcuno con cui andarci", house: "Tassorosso" }
    ]
  },
  {
    text: "📖 Ti accorgi che un argomento spiegato a lezione ti ha incuriosito più del previsto.",
    answers: [
      { label: "Lo approfondisci subito, anche da solo", house: "Corvonero" },
      { label: "Capisci come potrebbe tornarti utile in futuro", house: "Serpeverde" },
      { label: "Studi il contesto teorico in modo ordinato", house: "Corvonero" },
      { label: "Ne parli con altri per confrontare punti di vista", house: "Tassorosso" }
    ]
  },
  {
    text: "⚖️ Un compagno infrange una regola minore senza danneggiare nessuno.",
    answers: [
      { label: "Glielo fai notare direttamente", house: "Grifondoro" },
      { label: "Valuti se conviene intervenire", house: "Serpeverde" },
      { label: "Ti chiedi perché esista quella regola", house: "Corvonero" },
      { label: "Preferisci evitare conflitti inutili", house: "Tassorosso" }
    ]
  },
  {
    text: "🏆 Quando si avvicina una verifica importante, cosa cambia nel tuo comportamento?",
    answers: [
      { label: "Ti concentri e dai il massimo sul momento", house: "Grifondoro" },
      { label: "Pianifichi come ottenere il miglior risultato possibile", house: "Serpeverde" },
      { label: "Organizzi lo studio in modo strutturato", house: "Corvonero" },
      { label: "Mantieni una routine regolare senza stress eccessivo", house: "Tassorosso" }
    ]
  },
  {
    text: "🪄 A Hogwarts convivono tradizione e cambiamento. Tu cosa apprezzi di più?",
    answers: [
      { label: "La possibilità di rompere gli schemi", house: "Grifondoro" },
      { label: "Le opportunità che si creano muovendosi bene nel sistema", house: "Serpeverde" },
      { label: "La profondità del sapere accumulato", house: "Corvonero" },
      { label: "La continuità e il senso di appartenenza", house: "Tassorosso" }
    ]
  },
  {
    text: "🕰️ Hai un pomeriggio libero e nessuna scadenza imminente.",
    answers: [
      { label: "Lo riempi con qualcosa di stimolante", house: "Grifondoro" },
      { label: "Lo usi per portarti avanti in modo strategico", house: "Serpeverde" },
      { label: "Lo dedichi a esplorare un interesse specifico", house: "Corvonero" },
      { label: "Lo passi in modo semplice e rilassante", house: "Tassorosso" }
    ]
  },
  {
    text: "🎓 Col tempo capisci che Hogwarts richiede adattamento. Per te significa soprattutto…",
    answers: [
      { label: "Sapersi mettere in gioco", house: "Grifondoro" },
      { label: "Saper leggere le situazioni", house: "Serpeverde" },
      { label: "Saper capire a fondo", house: "Corvonero" },
      { label: "Saper essere costanti", house: "Tassorosso" }
    ]
  },
  {
    text: "📌 Se ripensi a una decisione difficile presa in passato, cosa l’ha guidata di più?",
    answers: [
      { label: "L’istinto", house: "Grifondoro" },
      { label: "L’obiettivo finale", house: "Serpeverde" },
      { label: "Il ragionamento", house: "Corvonero" },
      { label: "L’impatto sugli altri", house: "Tassorosso" }
    ]
  },
  {
    text: "🏰 In un ambiente come Hogwarts, cosa pensi sia più importante per crescere davvero?",
    answers: [
      { label: "Affrontare situazioni nuove", house: "Grifondoro" },
      { label: "Saper cogliere le occasioni giuste", house: "Serpeverde" },
      { label: "Comprendere ciò che ti circonda", house: "Corvonero" },
      { label: "Costruire relazioni solide", house: "Tassorosso" }
    ]
  },
  {
    text: "🔍 Quando qualcosa non ti è chiaro, tendi a…",
    answers: [
      { label: "Agire e vedere cosa succede", house: "Grifondoro" },
      { label: "Cercare la soluzione più vantaggiosa", house: "Serpeverde" },
      { label: "Analizzare finché tutto torna", house: "Corvonero" },
      { label: "Chiedere supporto", house: "Tassorosso" }
    ]
  }
];

const QUESTIONS_PER_QUIZ = 5;

function pickRandomQuestions(n) {
  const copy = [...QUESTIONS_BANK];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ===== HAT LINES =====
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

function makeAnswersRow(userId, step, session) {
  const row = new ActionRowBuilder();
  const q = session.questions[step];

  q.answers.forEach((a, i) => {
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
  return getRoleByName(guild, HOUSES[houseKey]);
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

  if (member.user.bot) {
    const botRole = guild.roles.cache.find((r) => r.name === BOT_ROLE_NAME);
    if (botRole && !member.roles.cache.has(botRole.id)) {
      await member.roles.add(botRole).catch(() => {});
    }
    await removeMuggleRoleIfAny(member, guild);
    return;
  }

  if (!memberHasAnyHouse(member)) {
    const muggleRole = guild.roles.cache.find((r) => r.name === MUGGLE_ROLE_NAME);
    if (muggleRole && !member.roles.cache.has(muggleRole.id)) {
      await member.roles.add(muggleRole).catch(() => {});
    }
  } else {
    await removeMuggleRoleIfAny(member, guild);
  }
}

/**
 * Softmax + rumore (risultato “non troppo deterministico”)
 */
function softmaxProbs(scores) {
  const vals = HOUSE_KEYS.map((k) => scores[k] ?? 0);
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
  const [top, second] = sorted;

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
    await fetchRoles(guild);

    // Assegna Babbani / Spiriti a tutti (come richiesto)
    await guild.members.fetch().catch(() => null);
    for (const member of guild.members.cache.values()) {
      await ensureDefaultRole(member);
    }

    cleanupChannel(guild).catch(console.error);
    setInterval(
      () => cleanupChannel(guild).catch(console.error),
      CLEANUP_EVERY_MINUTES * 60 * 1000
    );
  }
});

// ===== USER JOIN =====
client.on("guildMemberAdd", async (member) => {
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

    // ✅ elimina il comando dell’utente (serve Manage Messages al bot)
    await message.delete().catch(() => {});

    endSession(target.id);
    await removeHouseRoles(target);
    await ensureDefaultRole(target); // torna babbano fino a nuovo quiz

    const channel = await message.guild.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    // ✅ messaggio “pulito” (senza traccia del comando)
    await channel.send({ content: `✅ Casata rimossa da ${target}` });

    // ✅ subito dopo parte il quiz
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

    const chosen = pickRandomQuestions(QUESTIONS_PER_QUIZ);

    const session = {
      step: 0,
      questions: chosen,
      scores: { Grifondoro: 0, Serpeverde: 0, Corvonero: 0, Tassorosso: 0 },
      createdAt: Date.now(),
      timeout: null
    };

    session.timeout = setTimeout(() => endSession(userId), SESSION_TTL_MS);
    sessions.set(userId, session);

    // ✅ aggiorna lo stesso messaggio, niente spam
    return interaction.update({
      content: `${interaction.user} ${session.questions[0].text}`,
      components: [makeAnswersRow(userId, 0, session)]
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

    const houseKey = session.questions[step].answers[idx].house;
    session.scores[houseKey]++;

    const next = step + 1;

    if (next < session.questions.length) {
      session.step = next;
      return interaction.update({
        content: `${interaction.user} ${session.questions[next].text}`,
        components: [makeAnswersRow(userId, next, session)]
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

      // assegna casa: rimuove case vecchie + babbani
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
