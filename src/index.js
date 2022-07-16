import { Client, Collection } from "discord.js";
import {
  loadEvents,
  registerSlashCommands,
  updateMemberCounter,
  channels,
  token,
  myGuild,
  prefix,
} from "./util";
// Since we're using the ready event in index, I imported prefix and slash commands here to setup the .commands collection for the bot, which is used in the help command.
import * as prefixCommands from "./commands/prefix";
import * as slashCommands from "./commands/slash";
export const moniqueta = new Client({
  intents: 32767,
});
moniqueta.commands = new Collection();
moniqueta.memberCounter = new Collection();
moniqueta.inviteCodeUses = new Collection();
moniqueta.guildInvites = new Collection();
moniqueta.prefix = await prefix;
moniqueta.on("ready", async () => {
  console.log("Moniqueta pronta.");

  registerSlashCommands(moniqueta, myGuild);
  loadEvents(moniqueta, [
    { once: "true", name: "ready" },
    { name: "messageCreate" },
    { name: "interactionCreate" },
    { name: "guildMemberAdd" },
    { name: "guildMemberRemove" },
    { name: "inviteCreate" },
  ]);
  updateMemberCounter(myGuild);

  moniqueta.guilds.fetch(myGuild).then((guild) =>
    guild.invites.fetch().then((invites) => {
      console.log("Novos convites foram salvos.");
      invites.each((invite) =>
        moniqueta.inviteCodeUses.set(invite.code, invite.uses)
      );
      moniqueta.guildInvites.set(myGuild, moniqueta.inviteCodeUses);
      console.log(moniqueta.guildInvites);
    })
  );
  for (const commands of [slashCommands, prefixCommands]) {
    Object.entries(commands).forEach(([key, command]) => {
      moniqueta.commands.set(key, command.data.description);
    });
  }
});

process.on("unhandledRejection", (e) => {
  console.log(e);
  moniqueta.channels.cache.get(channels.errorChannel).send({
    content: `⚠️ Meu Deus, meu senhor, me ajuda, por favor.\n**Nome:**${e.name}\n**Stack:**${e.stack}`,
  });
});

moniqueta.login(token);
