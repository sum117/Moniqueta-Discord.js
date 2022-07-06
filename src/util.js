import {fs}  from 'fs';
import {join} from 'path'
import {Client, Message} from 'discord.js'

export const token = process.env.TOKEN;


  /**
   * @description Inicializa os eventos necessários para o funcionamento dos comandos.
   * @param {Client} client O cliente do bot.
   * @param {Array<{name: String, once: Boolean}>} events os eventos que serão utilizados pelo bot.
   */
  export function loadEvents(client, events = [{ name: "", once: false }]) {
    events.map(({ name, once }) => {
      if (once) client.once(name, (...args) => loadCommands(name, ...args));
      else client.on(name, (...args) => loadCommands(name, ...args));
    });
  }

  /**
   * @description Coloca uma palavra em modo título.
   * @param {String} string Uma palavra para ter sua primeira letra capitalizada.
   * @returns {String} Título
   */
  export function title(string = "") {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

/**
 * @author Milo123459<https://github.com/Milo123459>
 * @description This progress bar logic was copied from <https://github.com/Sparker-99/string-progressbar/blob/master/index.js>, a NPM package by Sparker-99.
 */
 export function statusBar(current, total) {
  let percentage = current / total;
  let progress = Math.round(10 * percentage);
  let emptyProgress = 10 - progress;
  let progressText = "🟩".repeat(progress);
  let emptyProgressText = "🟥".repeat(emptyProgress);
  let bar = progressText + emptyProgressText;
  return `${bar} ${current}`;
}
/**
 * @description Roda os comandos do bot. Deve ser colocado nos eventos.
 * @param {String} event O nome do evento que executou este comando.
 * @param {Array} ...args Os argumentos do evento. Variam de um para outro.
 */
function loadCommands(event, ...args) {
  const path = join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(path)
    .filter((file) => file.endsWith(".js"));

  switch (event) {
    case "messageCreate":
      /**
       * @type {Message}
       * @constant msg A mensagem recebida no evento.
       */
      const msg = args[0];

      if (msg.content.startsWith(prefix)) {
        const args = msg.content.slice(1).split(/ +/);
        const name = args[0];
        const command = commandFiles.find((e) => e === `${name}.js`);
        if (command) import(`${path}/${command}`).execute(msg, args);
        else msg.reply("❌ Não encontrei o comando que você tentou executar.");
      }
      const prefixlessPath = join(__dirname, "commands", "prefixless");
      fs.readdirSync(prefixlessPath)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => {
          const command = import(`${prefixlessPath}/${file}`);
          command.execute(msg);
        });
      break;

    case "interactionCreate":
      const command = commandFiles.find((c) => c.startsWith("button."));
      if (command) import(`${path}/${command}`).execute(...args);
      break;
  }
}
