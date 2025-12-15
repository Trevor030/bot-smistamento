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

if (!DISCORD_TOKEN || !QUIZ_CHANNEL_ID) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

// ===== CONFIG =====
const HOUSES = ["Grifondoro", "Serpeverde", "Corvonero", "Tassorosso"];

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
  "Vedo qualità rare in te…",
  "La scelta non è banale…",
  "Il Cappello ha deciso!"
];

// ===== STATE =====
const sessions = new Map();

// ===== HELPERS =====
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

async function ensureRole(guild, name) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (!role) role = await guild.roles.create({ name });
  return role;
}

async function removeHouseRoles(member) {
  const toRemove = member.roles.cache.filter(r => HOUSES.includes(r.name));
  if (toRemove.size) await member.roles.remove([...toRemove.values()]);
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

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
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

  // !resetcasa @utente
  if (command === "resetcasa") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply("❌ Non hai i permessi per usare questo comando.");
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply("❗ Usa: `!resetcasa @utente`");
    }

    sessions.delete(target.id);
    await removeHouseRoles(target);

    const channel = await message.guild.channels.fetch(QUIZ_CHANNEL_ID);
    channel.send({
      content: `🎩 ${target}, il Cappello Parlante ti aspetta.`,
      components: [makeStartRow(target.id)]
    });

    message.reply(`✅ Casa rimossa per ${target.user.username}`);
  }
});

// ===== QUIZ BUTTONS =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split(":");
  const userId = parts[1];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "Questo quiz non è per te 👀", ephemeral: true });
  }

  // START
  if (parts[0] === "quiz_start") {
    sessions.set(userId, { step: 0, scores: { Grifondoro: 0, Serpeverde: 0, Corvonero: 0, Tassorosso: 0 } });

    return interaction.reply({
      content: `${interaction.user} ${QUESTIONS[0].text}`,
      components: [makeAnswersRow(userId, 0)]
    });
  }

  // ANSWER
  if (parts[0] === "quiz_answer") {
    const step = Number(parts[2]);
    const idx = Number(parts[3]);
    const session = sessions.get(userId);
    if (!session || session.step !== step) return;

    const house = QUESTIONS[step].answers[idx].house;
    session.scores[house]++;

    const next = step + 1;

    if (next < QUESTIONS.length) {
      session.step = next;
      return interaction.update({
        content: `${interaction.user} ${QUESTIONS[next].text}`,
        components: [makeAnswersRow(userId, next)]
      });
    }

    // FINISH
    sessions.delete(userId);
    const top = Object.entries(session.scores).sort((a, b) => b[1] - a[1])[0][0];

    const member = await interaction.guild.members.fetch(userId);
    await removeHouseRoles(member);
    const role = await ensureRole(interaction.guild, top);
    await member.roles.add(role);

    return interaction.update({
      content: `🎩 **${pickRandom(HAT_LINES)}**\n✨ ${member} sei… **${top.toUpperCase()}**!`,
      components: []
    });
  }
});

client.login(DISCORD_TOKEN);
