import {
  ButtonInteraction,
  Message,
  Formatters,
  MessageEmbed,
  MessageActionRow,
  MessageButton,
  CommandInteraction,
  Interaction,
  User,
} from "discord.js";
import { db } from "../../db.js";
import { title } from "../../util.js";

const { userMention } = Formatters;

export const assets = {
  sum: {
    austera: { color: 10517508, emoji: "<:Austeros:982077481702027344>" },
    perserata: { color: 550020, emoji: "<:Perserata:982078451513184306>" },
    insanata: { color: 11535364, emoji: "<:Insanata:982078436166221874>" },
    equinocio: { color: 562180, emoji: "<:Equinocio:982082685889564772>" },
    oscuras: { color: 3146828, emoji: "<:Oscuras:982082685835051078>" },
    ehrantos: { color: 15236108, emoji: "<:Ehrantos:982082685793087578>" },
    melancus: { color: 0, emoji: "<:Melancus:982082685801472060>" },
    observata: { color: 16777215, emoji: "<:Observata:982082685864378418>" },
    invidia: { color: 547996, emoji: "<:Invidia:982082685503696967>" },
  },
  phantom: {
    azul: "<:fantasmaAzul:982092065523507290>",
    vermelho: "<:fantasmaVermelho:982092065989074994>",
    branco: "<:fantasmaBranco:982092065599029268>",
  },
};

export class PlayCardBase {
  /**@param {Interaction} interaction  */
  constructor() {
    this.character = async (interaction, user) => {
      const chosenChar = await db.get(`${user.id}.chosenChar`);
      if (!chosenChar) {
        throw (
          (await interaction[interaction.deferred ? "editReply" : "reply"]({
            content: `Não há nenhum personagem criado ou selecionado para ${
              user.id === interaction.user.id ? "você" : user
            }`,
          }),
          new Error(
            "Erro de personagem não criado ou selecionado acionado por: " +
              user.id
          ))
        );
      } else return await db.get(`${user.id}.chars.${chosenChar}`);
    };
  }
  /**
   * @param {ButtonInteraction} - Usuário que teve seu personagem criado
   * @param {Object} character - Objeto que contém todas as informações do personagem
   * @param {String} character.name - Nome do personagem
   * @param {String} character.gender - Gênero do personagem
   * @param {String} character.personality - Personalidade do personagem
   * @param {String} character.appearance - Aparencia do personagem
   * @param {String} character.avatar - Avatar do personagem
   * @param {('austera'|'perserata'|'insanata'|'equinocio'|'oscuras'|'ehrantos'|'melancus'|'observata'|'invidia')} character.sum - O nome da soma do personagem
   * @param {('azul'|'vermelho'|'branco')} character.phantom - O purgatório do personagem
   * @returns {Promise<Message>} `Mensagem` - A mensagem confirmando que o personagem foi criado
   */
  async create({ message, user, guild }, approvedChannelId, character = {}) {
    const { name, gender, personality, appearance, avatar, sum, phantom } =
      character;
    const { members, channels } = guild;

    const userId = (() => {
      const [userId] = message.content.match(/\d{17,19}/) ?? [];
      if (!userId) return user.id;
      else return userId;
    })();
    const id = (await db.get(`${userId}.chars.count`)) ?? 0;
    await db.set(`${userId}`, {
      chosenChar: id ? id : "1",
      count: id ? id + 1 : 1,
      chars: {
        [id ? toString(id + 1) : "1"]: {
          name: name,
          gender: gender,
          personality: personality,
          appearance: appearance,
          avatar: avatar,
          sum: { name: sum, assets: assets.sum[sum] },
          phantom: {
            name: phantom,
            assets: { emoji: assets.phantom[phantom] },
          },
          status: {
            health: 100,
            mana: 50,
            stamina: 50,
          },
        },
      },
    });
    const membro = await members.fetch(userId);
    const aprovador = user;
    const canalAprovados = await channels.fetch(approvedChannelId);
    return canalAprovados.send({
      content: `Ficha de ${userMention(
        membro.user.id
      )}, aprovada por ${userMention(aprovador.id)}`,
      embeds: [
        // Essa embed usa a entrada do usuário para ser feita, portanto, não estamos obtendo os valores do banco de dados, o que altera a maneira como pegamos os valores para essa parte específica da classe.
        new MessageEmbed()
          .setTitle(name)
          .setThumbnail(avatar)
          .setColor(assets.sum[sum].color)
          .setDescription(appearance)
          .setAuthor({
            name: membro.user.username,
            iconURL: membro.user.avatarURL({ dynamic: true, size: 512 }),
          })
          .addField(
            "Gênero",
            gender === "Masculino"
              ? "♂️ Masculino"
              : gender === "Feminino"
              ? "♀️ Feminino"
              : "👽 Descubra",
            true
          )
          .addField(
            "Purgatório",
            assets.phantom[phantom] + " " + title(phantom),
            true
          )
          .addField("Soma", assets.sum[sum].emoji + " " + title(sum), true),
      ],
    });
  }

  /**
   *
   * @param {CommandInteraction} interaction | A mensagem ou comando que iniciou o comando
   * @param {('edit'|'remove'|'send')} action A ação escolhida para a classe.
   */
  async interact(interaction, action, content = "") {
    const { user, channel } = interaction;

    const data = await this.character(interaction, user);

    const { name, avatar, sum } = data;

    switch (action) {
      case "send":
        return await db.set(user.id + ".latestMessage", `${(await send()).id}`);
      case "edit":
        return edit(await db.get(user.id + ".latestMessage"));
      case "remove":
        return remove(
          content ? content : await db.get(user.id + ".latestMessage")
        );
    }

    async function send() {
      return await channel.send({
        nonce: user.id,
        embeds: [
          new MessageEmbed()
            .setTitle(name)
            .setThumbnail(avatar)
            .setColor(sum.assets.color)
            .setDescription(content)
            .setFooter({
              text: user.username,
              iconURL: user.avatarURL({ dynamic: true, size: 512 }),
            }),
        ],
        components: [
          new MessageActionRow().addComponents(
            new MessageButton()
              .setCustomId("interact")
              .setEmoji("🖐️")
              .setLabel("Interagir")
              .setStyle("SECONDARY")
          ),
        ],
      });
    }
    async function edit(msgId) {
      if (!msgId)
        throw new Error(
          "Não foi possível encontrar a mensagem para ser editada"
        );
      const embed = await (await channel.messages.fetch(msgId)).embeds[0];
      embed.setDescription(content);
      return await channel.messages.edit(msgId, {
        embeds: [embed],
      });
    }
    async function remove(msgId) {
      if (!msgId)
        throw interaction[interaction.deferred ? "editReply" : "reply"]({
          content: "Não foi possível encontrar a mensagem para ser removida",
        });
      else if ((await channel.messages.fetch(msgId)).nonce !== user.id)
        throw interaction[interaction.deferred ? "editReply" : "reply"]({
          content:
            "Você não pode deletar uma mensagem que não pertence a você.",
        });

      if (msgId === (await db.get(user.id + ".latestMessage")))
        db.delete(user.id + ".latestMessage");
      return await channel.messages.delete(msgId);
    }
  }
}
