require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder, REST, Routes,
  StringSelectMenuBuilder, time
} = require('discord.js');

const ticketsFile = path.join(__dirname, 'tickets.json');
let ticketConfigData = {};
if (fs.existsSync(ticketsFile)) {
  try { ticketConfigData = JSON.parse(fs.readFileSync(ticketsFile, 'utf8')); } catch { ticketConfigData = {}; }
}
function saveTickets() { fs.writeFileSync(ticketsFile, JSON.stringify(ticketConfigData, null, 2)); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// -------------------- أوامر السلاش --------------------

// أمر تسطيب التكتات مع ايموجيات وكاتاجوري لكل خيار
const setupCmd = new SlashCommandBuilder()
  .setName('تسطيب')
  .setDescription('إنشاء ايمبد تكتات متعدد الأسئلة والكاتاجوري')
  .addChannelOption(option => option
    .setName('room')
    .setDescription('الغرفة التي سيتم إرسال الايمبد فيها')
    .setRequired(true))
  .addStringOption(option => option
    .setName('title')
    .setDescription('عنوان الايمبد')
    .setRequired(true))
  .addStringOption(option => option
    .setName('desc')
    .setDescription('وصف الايمبد')
    .setRequired(true))
  .addStringOption(option => option
    .setName('options')
    .setDescription('كل خيار: نص/ايموجي/كاتاجوريId كل خيار بسطر أو بينهم | مثال: دعم فني/<:emoji:123>/123456789')
    .setRequired(true))
  .addRoleOption(option => option
    .setName('support')
    .setDescription('رتبة الدعم الفني')
    .setRequired(true))
  .addStringOption(option => option
    .setName('image')
    .setDescription('رابط صورة (اختياري)')
    .setRequired(false))
  .toJSON();

// أمر giveaway
const giveawayCmd = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('انشاء قيف أواي')
  .addStringOption(option => option.setName('desc').setDescription('الوصف (على ايش)').setRequired(true))
  .addIntegerOption(option => option.setName('days').setDescription('عدد الأيام').setRequired(false))
  .addIntegerOption(option => option.setName('hours').setDescription('عدد الساعات').setRequired(false))
  .addIntegerOption(option => option.setName('minutes').setDescription('عدد الدقائق').setRequired(false))
  .toJSON();

// -------------------- رفع الأوامر --------------------
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [setupCmd, giveawayCmd] }
    );
    console.log('✅ Slash commands uploaded.');
  } catch (err) {
    console.error(err);
  }
});

// -------------------- SNIPES --------------------
let snipes = {};
client.on('messageDelete', async msg => {
  snipes[msg.channel.id] = {
    author: msg.author ? msg.author.tag : 'غير معروف',
    avatar: msg.author ? msg.author.displayAvatarURL() : null,
    content: msg.content || '',
    image: msg.attachments.first() ? msg.attachments.first().proxyURL : null,
    time: new Date()
  };
});
client.on('messageCreate', async msg => {
  if (msg.content.trim() === '!snipe') {
    const data = snipes[msg.channel.id];
    if (!data) return msg.reply('لا يوجد رسالة محذوفة!');
    const embed = new EmbedBuilder()
      .setAuthor({ name: data.author, iconURL: data.avatar })
      .setDescription(data.content || 'لا يوجد محتوى')
      .setFooter({ text: `الوقت: ${time(data.time, 'R')}` });
    if (data.image) embed.setImage(data.image);
    msg.channel.send({ embeds: [embed] });
  }
});

// -------------------- AFK --------------------
let afks = {}; // userId => { time, mentions: [{author, messageId, channelId}] }
client.on('messageCreate', async msg => {
  if (msg.content.trim() === '!afk') {
    afks[msg.author.id] = { time: Date.now(), mentions: [] };
    msg.reply('تم تفعيل وضع الخمول!');
    return;
  }
  // إذا شخص منشن شخص خامل
  if (msg.mentions.users.size > 0) {
    msg.mentions.users.forEach(user => {
      if (afks[user.id]) {
        afks[user.id].mentions.push({ author: msg.author.tag, messageId: msg.id, channelId: msg.channel.id });
      }
    });
  }
  // إذا شخص خامل كتب رسالة
  if (afks[msg.author.id]) {
    const afkData = afks[msg.author.id];
    let embed = new EmbedBuilder()
      .setTitle('وضع الخمول انتهى')
      .setDescription(`كنت خامل منذ <t:${Math.floor(afkData.time/1000)}:R>`);
    afkData.mentions.forEach((m, i) => {
      embed.addFields({
        name: `منشن رقم ${i+1}`,
        value: `[${m.author} | اضغط هنا لعرض الرسالة](https://discord.com/channels/${msg.guild.id}/${m.channelId}/${m.messageId})`
      });
    });
    msg.reply({ embeds: [embed] });
    delete afks[msg.author.id];
  }
});

// -------------------- INTERACTIONS --------------------
client.on('interactionCreate', async interaction => {
  // أمر تسطيب التكتات
  if (interaction.isChatInputCommand() && interaction.commandName === 'تسطيب') {
    try {
      const room = interaction.options.getChannel('room');
      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('desc');
      const optionsValue = interaction.options.getString('options');
      const supportRole = interaction.options.getRole('support');
      const image = interaction.options.getString('image');
      // معالجة الخيارات (نص/ايموجي/كاتاجوري)
      const optionLines = optionsValue.split(/[\n|]+/).map(x => x.trim()).filter(Boolean);
      const selectOptions = [];
      for (const line of optionLines) {
        const [text, emojiRaw, categoryId] = line.split('/');
        let emoji;
        if (emojiRaw && emojiRaw.match(/^<:.+:(\d+)>$/)) {
          const emojiId = emojiRaw.match(/^<:.+:(\d+)>$/)[1];
          emoji = { id: emojiId };
        }
        selectOptions.push({
          label: text,
          value: `${text}_${categoryId}`,
          emoji,
          description: `فتح تكت نوع ${text} في كاتاجوري ${categoryId}`
        });
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_open_select')
        .setPlaceholder('اختر نوع التكت')
        .addOptions(selectOptions);
      const row = new ActionRowBuilder().addComponents(selectMenu);
      const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(0x00AE86);
      if (image) embed.setImage(image);
      const message = await room.send({ embeds: [embed], components: [row] });
      ticketConfigData[message.id] = {
        supportRoleId: supportRole.id,
        selectOptions,
      };
      saveTickets();
      await interaction.reply({ content: "✅ تم إرسال الايمبد بنجاح!", ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: `❌ خطأ أثناء إرسال الايمبد: ${err}`, ephemeral: true });
    }
  }

  // فتح تكت مع كاتاجوري مخصص لكل خيار
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_open_select') {
    const config = ticketConfigData[interaction.message.id];
    if (!config) return;
    const [text, categoryId] = interaction.values[0].split('_');
    const supportRoleId = config.supportRoleId;
    const user = interaction.user;
    const guild = interaction.guild;
    const category = guild.channels.cache.get(categoryId);
    // تحقق هل يوجد تكت مفتوح لهذا العضو
    const existing = guild.channels.cache.find(c =>
      c.parentId === category.id &&
      c.type === ChannelType.GuildText &&
      c.topic === `TICKET-${user.id}`
    );
    if (existing) {
      return await interaction.reply({ content: `⚠️ لديك بالفعل تكت مفتوح: <#${existing.id}>`, ephemeral: true });
    }
    // إنشاء الغرفة
    const channel = await guild.channels.create({
      name: `ticket-${user.username}`,
      type: ChannelType.GuildText,
      parent: category,
      topic: `TICKET-${user.id}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: supportRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ]
    });
    ticketConfigData[channel.id] = { ...config, ticketOwnerId: user.id, claimedBy: null };
    saveTickets();
    await channel.send(`<@&${supportRoleId}>`);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('مرحبا 👋')
        .setDescription(`مرحبا <@${user.id}>! شكرا لفتح تكت **${text}**.\nسيتم الرد عليك قريبًا من فريق الدعم الفني.`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام التكت').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('غلق التكت').setStyle(ButtonStyle.Danger)
      )]
    });
    await interaction.reply({ content: `✅ تم فتح تكت جديد: <#${channel.id}>`, ephemeral: true });
  }

  // استلام/غلق التكتات
  if (interaction.isButton() && ['ticket_claim', 'ticket_close', 'ticket_cancel_close', 'ticket_confirm_close'].includes(interaction.customId)) {
    const channel = interaction.channel;
    const config = ticketConfigData[channel.id];
    if (!config) return await interaction.reply({ content: "❌ إعدادات التكت غير موجودة.", ephemeral: true });
    const supportRoleId = config.supportRoleId;
    const ticketOwnerId = config.ticketOwnerId;
    if (interaction.customId === 'ticket_claim') {
      if (!interaction.member.roles.cache.has(supportRoleId))
        return await interaction.reply({ content: "❌ فقط أعضاء الدعم يمكنهم استلام التكت.", ephemeral: true });
      if (interaction.user.id === ticketOwnerId)
        return await interaction.reply({ content: "❌ لا يمكنك استلام تكت فتحته بنفسك.", ephemeral: true });
      config.claimedBy = interaction.user.id;
      ticketConfigData[channel.id] = config;
      saveTickets();
      await channel.permissionOverwrites.edit(supportRoleId, {
        ViewChannel: true,
        SendMessages: false,
        CreatePublicThreads: true,
        CreatePrivateThreads: true,
      });
      await channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        SendMessages: true,
      });
      return await interaction.reply({ content: `تم استلام التكت بواسطة <@${interaction.user.id}>!`, ephemeral: false });
    }
    if (interaction.customId === 'ticket_close') {
      const claimedBy = config.claimedBy;
      if (!claimedBy || claimedBy !== interaction.user.id)
        return await interaction.reply({ content: "❌ فقط من استلم التكت يستطيع غلقه.", ephemeral: true });
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('تراجع').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('غلق نهائي').setStyle(ButtonStyle.Danger)
        );
      return await interaction.reply({ content: 'هل أنت متأكد أنك تريد غلق التكت؟', components: [confirmRow], ephemeral: false });
    }
    if (interaction.customId === 'ticket_cancel_close') {
      return await interaction.update({ content: 'تم إلغاء عملية الغلق.', components: [] });
    }
    if (interaction.customId === 'ticket_confirm_close') {
      ticketConfigData[interaction.channel.id] && delete ticketConfigData[interaction.channel.id];
      saveTickets();
      await interaction.channel.delete();
    }
  }

  // أمر giveaway
  if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') {
    const desc = interaction.options.getString('desc');
    const days = interaction.options.getInteger('days') || 0;
    const hours = interaction.options.getInteger('hours') || 0;
    const minutes = interaction.options.getInteger('minutes') || 0;
    const endTime = Date.now() + ((days*24*60 + hours*60 + minutes)*60*1000);
    let joined = [];
    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway 🎉')
      .setDescription(desc)
      .addFields(
        { name: 'بواسطة', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'عدد المنضمين', value: '0', inline: true },
        { name: 'وقت إعلان الفائز', value: `<t:${Math.floor(endTime/1000)}:R>`, inline: false }
      );
    const row = new ActionRowBuilder()
      .addComponents(new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉').setStyle(ButtonStyle.Primary));
    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    client.giveaway = {
      msgId: msg.id,
      joined,
      endTime,
      channelId: interaction.channel.id,
      creatorId: interaction.user.id
    };
  }
  // زر الانضمام لقيف أواي
  if (interaction.isButton() && interaction.customId === 'giveaway_join' && client.giveaway && client.giveaway.msgId === interaction.message.id) {
    if (!client.giveaway.joined.includes(interaction.user.id)) {
      client.giveaway.joined.push(interaction.user.id);
      const embed = interaction.message.embeds[0];
      let newEmbed = EmbedBuilder.from(embed).spliceFields(1, 1, { name: 'عدد المنضمين', value: String(client.giveaway.joined.length), inline: true });
      await interaction.update({ embeds: [newEmbed], components: interaction.message.components });
    } else {
      await interaction.reply({ content: 'لقد انضممت بالفعل!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
