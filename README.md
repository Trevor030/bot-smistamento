# Discord Sorting Hat Quiz Bot

Bot Discord (discord.js v14) che:
- quando un utente entra nel server, manda un messaggio in un canale specifico
- l’utente clicca “Inizia il quiz”
- risponde a 3 domande stile Hogwarts
- il bot assegna un ruolo Casa (Grifondoro, Serpeverde, Corvonero, Tassorosso)

## Variabili d’ambiente
- DISCORD_TOKEN
- QUIZ_CHANNEL_ID

## Permessi necessari al bot
- Manage Roles
- View Channel + Send Messages nel canale quiz

⚠️ Il ruolo del bot deve stare sopra i ruoli Casa nella gerarchia dei ruoli, altrimenti non può assegnarli.

## Portainer / Docker
Usa docker-compose.yml e passa le env nello stack.

