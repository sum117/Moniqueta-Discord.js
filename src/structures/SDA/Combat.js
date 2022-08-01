import {ButtonInteraction, MessageActionRow, MessageButton} from 'discord.js';
import {bold, codeBlock, userMention} from '@discordjs/builders';
import {db} from '../../db.js';
import {PlayCardBase} from './PlayCardBase.js';
import {title} from '../../util';
import YAML from 'yaml';
import fs from 'fs';

export class Combat extends PlayCardBase {
  /**
   *
   * @param {ButtonInteraction} interaction
   */
  constructor() {
    super();
  }
  async init(interaction, target, userId) {
    const {Combate} = YAML.parse(fs.readFileSync('./src/structures/SDA/falas.yaml', 'utf8'));
    // Usuário brutos
    this.userId = userId;
    this.target = await interaction.guild.members.fetch(target);
    //Personagens
    this.alvo = await this.character(interaction, target);
    this.origem = await this.character(interaction, interaction.user);
    // Falas especiais
    this.falasAlvo = Combate[this.alvo.sum];
    this.falasOrigem = Combate[this.origem.sum];
    this.interaction = interaction;
    this.batalha1v1 = await (async () => {
      const batalha1v1 = db.table('batalha_' + interaction.channelId);
      const emCurso = await (async (origem, alvo) => {
        const dbOrigem = await batalha1v1.get(origem);
        const dbAlvo = await batalha1v1.get(alvo);
        const check = dbOrigem ? {db: dbOrigem, id: origem} : dbAlvo ? {db: dbAlvo, id: alvo} : null;
        if (check === null) {
          await batalha1v1.set(origem, {
            [origem]: {
              saude: this.alvo.skills.vitalidade * 10,
              mana: this.alvo.skills.vigor * 5,
            },
            [alvo]: {
              saude: this.origem.skills.vitalidade * 10,
              mana: this.origem.skills.vigor * 5,
            },
          });
          return {db: await batalha1v1.get(origem), id: origem};
        } else return check;
      })(this.userId, this.target.id);

      return emCurso;
    })();
    return this;
  }

  async fisico() {
    const {alvo, batalha1v1, origem, interaction, target, userId, falasOrigem, falasAlvo} = this;
    const ultimoPost = await db.get(`${userId}.latestMessage`);
    // Erros de validação
    if (!(ultimoPost?.channelId === interaction.channelId && ultimoPost.time > Date.now() - 1000 * 60 * 45))
      return interaction.reply({
        content:
          '❌ Você não pode atacar ninguém se o seu personagem não enviou um post no canal do alvo nos últimos 45 minutos.',
        ephemeral: true,
      });
    if (!interaction.customId.startsWith('ataque_fisico'))
      throw new Error('Você usou o método de ataque físico em uma interação incongruente.');
    if (!(await db.get(`${interaction.guildId}.charMessages.${interaction.customId.split('_')[3]}`)))
      return interaction.reply('❌ A mensagem do alvo foi deletada, não é possível atacar.');

    // Ataque validado - Enviando prompt de resposta para o alvo e aguardando resposta
    interaction.deferReply({fetchReply: true});
    await interaction.channel.send(JSON.stringify(batalha1v1.db));
    const dadoOrigem = Math.floor(Math.random() * 20) + 1;
    const dadoAlvo = Math.floor(Math.random() * 20) + 1;
    const painelParaResposta = await interaction.channel.send({
      content: `Seu personagem foi atacado por ${bold(origem.name)}, ${userMention(target.id)}!${
        !origem.inCombat
          ? `\n💀 ${bold(
              alvo.name,
            )} entrou em modo de combate. Tenha cuidado, e escolha com cautela seus próximos passos. Boa sorte, ${bold(
              title(alvo.sum),
            )}!`
          : ''
      }`,
      components: [
        new MessageActionRow().addComponents(
          new MessageButton()
            .setCustomId(`defender_${target.id}_${userId}`)
            .setLabel('DEFESA')
            .setStyle('PRIMARY')
            .setEmoji('🛡'),
          new MessageButton()
            .setCustomId(`contra_ataque_${target.id}_${userId}`)
            .setLabel('CONTRA-ATAQUE')
            .setStyle('DANGER')
            .setEmoji('🤞'),
          new MessageButton()
            .setCustomId(`esquiva_${target.id}_${userId}`)
            .setLabel('ESQUIVA')
            .setStyle('SUCCESS')
            .setEmoji('💨'),
        ),
      ],
    });
    const personagemAtualAlvo = await db.get(`${target.id}.chosenChar`);
    await db.set(`${target.id}.chars.${personagemAtualAlvo}.inCombat`, true);

    // Checando se o alvo ja foi avisado sobre a sua situação dificil, e enviando uma mensagem caso ainda não tenha sido
    if (batalha1v1.db[target.id].saude < alvo.skills.vitalidade * 10 * 0.4 && !batalha1v1.db[target.id].warned) {
      await interaction.channel.send({
        content: bold(alvo.name) + '! ' + falasAlvo.hp.self[Math.floor(Math.random() * falasAlvo.hp.self.length)],
      });
      batalha1v1.db[target.id].warned = true;
      await db.table('batalha_' + interaction.channelId).set(batalha1v1.id, batalha1v1.db);
    }
    const reacaoAlvo = await painelParaResposta.awaitMessageComponent({
      filter: i => i.user.id === target.id,
      time: 60 * 10 * 1000,
    });
    if (!reacaoAlvo)
      await painelParaResposta.edit({
        content: `${userMention(
          target.id,
        )} não respondeu ao seu ataque no tempo estipulado. O personagem tentará defender automaticamente!`,
        components: [],
      });

    await painelParaResposta.edit({
      content: `${userMention(target.id)} escolheu ${bold(title(reacaoAlvo.component.label))}!`,
      components: [],
    });

    // Finalizando turno de combate com o calculo de dano
    const escolhaAlvo = reacaoAlvo?.customId.split('_')[0] ?? 'defender';
    const resposta = calculo(origem, alvo, undefined, escolhaAlvo, dadoOrigem, dadoAlvo);
    // Se o dano for maior que a vida do alvo, enviar um prompt de escolha de destino para o atacante decidir se deseja matar o alvo ou não
    if (resposta?.dano > batalha1v1.db[target.id].saude) {
      const painelFinal = await interaction.editReply({
        content: `${bold(origem.name)} derrubou ${bold(
          alvo.name,
        )}!\nO destino dele(a) deverá ser decidido nos proximos dez minutos, ou morrerá de sangramento de qualquer forma!`,
        components: [
          new MessageActionRow().addComponents([
            new MessageButton()
              .setCustomId(`executar_${target.id}_${userId}`)
              .setStyle('DANGER')
              .setLabel('EXECUTAR!')
              .setEmoji('🗡️'),
            new MessageButton()
              .setCustomId(`poupar_${target.id}_${userId}`)
              .setStyle('PRIMARY')
              .setLabel('POUPAR!')
              .setEmoji('🆘'),
          ]),
        ],
      });
      const coletorOrigem = painelFinal.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 60 * 10 * 1000,
        max: 1,
      });

      coletorOrigem.on('collect', async button => {
        if (button.customId === 'executar_' + target.id + `_${userId}`) await handleExecutar(button);
        else {
          button.message.edit({content: `${bold(origem.name)} poupou ${bold(alvo.name)}...`, components: []});
          await button.channel.send({
            content: `A batalha entre ${bold(origem.name)} e ${bold(alvo.name)} acabou. O vencedor é ${bold(
              origem.name,
            )}, que decidiu poupar o(a) opositor(a)!`,
          });
          await db.table('batalha_' + interaction.channelId).delete(target.id);
          await db.table('batalha_' + interaction.channelId).delete(userId);
        }
      });
      coletorOrigem.on('end', collected => {
        if (!collected) return handleExecutar();
      });
      async function handleExecutar(btn) {
        await btn.message.edit({
          content: `${bold(origem.name)} executou ${bold(alvo.name)}... Que Sidera o(a) tenha! 💀`,
          components: [],
        });
        const personagemAtualAlvo = await db.get(`${target.id}.chosenChar`);
        const personagemAtualOrigem = await db.get(`${userId}.chosenChar`);
        await db.add(`${userId}.chars.${personagemAtualOrigem}.kills`, 1);
        await db.set(`${target.id}.chars.${personagemAtualAlvo}.dead`, true);
        const updatedChar = await db.get(`${target.id}.chars.${personagemAtualAlvo}`);
        await btn.channel.send({
          content: `💀 ${bold(alvo.name)} morreu, ${userMention(
            target.id,
          )}!\n\nEm breve você poderá sair da carcaça somática e virar um fantasma. Porém, se você for um(a) ceifador(a), este personagem foi perdido para sempre!\n${codeBlock(
            JSON.stringify(updatedChar),
          )}`,
        });
        await db.table('batalha_' + interaction.channelId).delete(target.id);
        await db.table('batalha_' + interaction.channelId).delete(userId);
      }
    } else
      await interaction.editReply(
        resposta.msg
          ? resposta.msg
          : `${bold(origem.name)} infligiu ${bold(resposta?.dano)} de dano em ${bold(alvo.name)}!\n${
              resposta.defesa
                ? `${bold(alvo.name)} defendeu ${bold(resposta?.defesa)} de dano!`
                : `${bold(alvo.name)} ignorou ${resposta.esquiva} de dano!`
            }`,
      );
    batalha1v1.db[target.id].saude = batalha1v1.db[target.id].saude - (resposta.dano ? resposta.dano : 0);
    await db.table('batalha_' + interaction.channelId).set(batalha1v1.id, batalha1v1.db);
    // Se o alvo estiver perto da morte, enviar uma mensagem de encorajamento para o atacante se uma não foi enviada
    if (batalha1v1.db[target.id].saude < alvo.skills.vitalidade * 10 * 0.4 && !batalha1v1.db[userId]?.encouraged) {
      batalha1v1.db[userId].encouraged = true;
      await db.table('batalha_' + interaction.channelId).set(batalha1v1.id, batalha1v1.db);
      await interaction.followUp({
        content:
          bold(origem.name) + '! ' + falasOrigem.hp.inimigo[Math.floor(Math.random() * falasOrigem.hp.inimigo.length)],
      });
    }
  }
  // TODO: Fazer uma checagem da escolha da origem e do alvo. Se por acaso a origem utilizar um poder, usar o objeto dos poderes ao invés das armas. O mesmo para o alvo, só que adiciona ao invés de remover.
  async poder() {
    if (!interaction.customId === 'ataque_de_poder')
      throw new Error('Você usou o método de ataque poderoso em uma interação incongruente.');
  }
}

function calculo(origem = {}, alvo = {}, actionOrigem, actionAlvo = '', dadoOrigem = 0, dadoAlvo = 0) {
  const dano = Object.values(origem.armas)
    .filter(item => item.base)
    .map(item => itemComRng(origem, item, dadoOrigem))
    .reduce((a, b) => a + b, 0);

  const defesa = Object.values(alvo.equipamentos)
    .filter(item => item.base)
    .map(item => itemComRng(alvo, item, dadoAlvo))
    .reduce((a, b) => a + b, 0);

  const easterEggChance = Math.floor(Math.random() * 100) + 1;
  switch (actionAlvo) {
    case 'defender':
      if (dadoAlvo === 20)
        return {
          msg: easterEggChance >= 90 ? 'Parry Inacreditável!\nhttps://youtu.be/C4gntXWPrw4' : 'Parry perfeito! PRIIIM!',
          payback: 'defender_perfeito',
        };
      else {
        const handleEscudo = alvo.armas?.armaSecundaria?.tipo === 'escudo' ? true : false;
        if (handleEscudo) return dano - itemComRng(alvo, alvo.armas.armaSecundaria, dadoAlvo);
        else return {dano: Math.floor(dano - dano * 0.15), defesa: Math.floor(dano * 0.15)};
      }
    case 'esquiva':
      if (dadoAlvo === 20)
        return {
          msg:
            easterEggChance >= 90
              ? 'Esquiva Inacreditável!\nhttps://www.youtube.com/shorts/bLC4F51xLVQ'
              : 'Esquiva perfeita! VOOSH!',
          payback: 'esquiva_perfeita',
        };
      else return {dano: Math.floor(dano - dano * 0.25), esquiva: Math.floor(dano * 0.25)};
    default:
      return {dano: Math.floor(dano - defesa), defesa: Math.floor(defesa)};
  }

  function itemComRng(player, item = {}, dado = 0) {
    const resultado = item.base + item.multiplicador.num * (player.skills[item.multiplicador.tipo] * 0.2);
    const multiplicadorBase = () => {
      if (dado === 20) return 3;
      else if (dado >= 14) return 1.25;
      else return 1;
    };
    return resultado * multiplicadorBase();
  }
}
