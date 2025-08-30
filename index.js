require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

// زر التكتات
const helpdeskButtons = [
  {
    label: 'استفسار',
    emoji: '1411417960517603459',
    categoryId: '1411433334189588510',
    desc: 'لأي سؤال أو استفسار عام أو خاص.',
    color: 0x3498db
  },
  {
    label: 'استلام فعالية',
    emoji: '1411419056602480681',
    categoryId: '1411329168909799505',
    desc: 'استلام جوائز أو هدايا الفعاليات.',
    color: 0x27ae60
  },
  {
    label: 'تشهير',
    emoji: '1411419566587904082',
    categoryId: '1411433502389440522',
    desc: 'الإبلاغ عن التشهير أو الإساءة.',
    color: 0xe74c3c
  }
];

// أمر السلاش helpdesk
const helpdeskCmd = new SlashCommandBuilder()
  .setName('helpdesk')
  .setDescription('يرسل ايمبد طلب المساعدة مع أزرار التكتات')
  .addChannelOption(option => option
    .setName('room')
    .setDescription('الغرفة التي سيتم إرسال الايمبد فيها')
    .setRequired(true))
  .addRoleOption(option => option
    .setName('support')
    .setDescription('رتبة الدعم الفني')
    .setRequired(true))
  .toJSON();

// أمر السلاش giveaway
const giveawayCmd = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('انشاء قيف اواي بشكل جذاب')
  .addStringOption(option => option.setName('desc').setDescription('الوصف (على ايش)').setRequired(true))
  .addIntegerOption(option => option.setName('days').setDescription('عدد الأيام').setRequired(false))
  .addIntegerOption(option => option.setName('hours').setDescription('عدد الساعات').setRequired(false))
  .addIntegerOption(option => option.setName('minutes').setDescription('عدد الدقائق').setRequired(false))
  .toJSON();

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

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [helpdeskCmd, giveawayCmd] }
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
    if (!data) return msg.reply('❌ لا يوجد رسالة محذوفة!');
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: `🕵️‍♂️ Snipe | صاحب الرسالة: ${data.author}`, iconURL: data.avatar || undefined })
      .setDescription(data.content || 'لا يوجد محتوى')
      .setFooter({ text: `الوقت: ${data.time.toLocaleTimeString()} - ${data.time.toLocaleDateString()}` });
    if (data.image) embed.setImage(data.image);
    msg.channel.send({ embeds: [embed] });
  }
});

// -------------------- AFK --------------------
let afks = {}; // userId => { time, mentions: [{author, messageId, channelId}] }
client.on('messageCreate', async msg => {
  if (msg.content.trim() === '!afk') {
    afks[msg.author.id] = { time: Date.now(), mentions: [] };
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🌙 وضع AFK مفعل')
      .setDescription(`انت الآن في وضع AFK. سيتم تنبيهك عند ذكر اسمك.`)
      .setFooter({ text: `الوقت: ${new Date().toLocaleTimeString()} - ${new Date().toLocaleDateString()}` });
    msg.reply({ embeds: [embed] });
    return;
  }
  // إذا شخص منشن شخص AFK
  if (msg.mentions.users.size > 0) {
    msg.mentions.users.forEach(user => {
      if (afks[user.id]) {
        afks[user.id].mentions.push({ author: msg.author.tag, messageId: msg.id, channelId: msg.channel.id });
      }
    });
  }
  // إذا شخص AFK كتب رسالة
  if (afks[msg.author.id]) {
    const afkData = afks[msg.author.id];
    let embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🚀 رجعت من AFK')
      .setDescription(`كنت في وضع AFK لمدة <t:${Math.floor(afkData.time/1000)}:R>`)
      .setFooter({ text: `مرحبًا بعودتك!` });
    afkData.mentions.forEach((m, i) => {
      embed.addFields({
        name: `منشن رقم ${i+1}`,
        value: `👤 **${m.author}** | [اضغط هنا لعرض الرسالة](https://discord.com/channels/${msg.guild.id}/${m.channelId}/${m.messageId})`
      });
    });
    msg.reply({ embeds: [embed] });
    delete afks[msg.author.id];
  }
});

// -------------------- INTERACTIONS --------------------
client.on('interactionCreate', async interaction => {
  // أمر helpdesk
  if (interaction.isChatInputCommand() && interaction.commandName === 'helpdesk') {
    const room = interaction.options.getChannel('room');
    const supportRole = interaction.options.getRole('support');
    const guild = interaction.guild;

    // صورة السيرفر
    const serverImage = guild.iconURL({ extension: 'png', size: 1024 });

    // شريط الأزرار مع الإيموجيات
    const row = new ActionRowBuilder();
    helpdeskButtons.forEach((btn, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`helpdesk_open_${idx}`)
          .setLabel(btn.label)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(btn.emoji)
      );
    });

    // الايمبد الجذاب
    const embed = new EmbedBuilder()
      .setTitle('🎯 الحصول على مساعدة')
      .setDescription(
        `> **هنا يمكنك طلب المساعدة بسهولة!**\n> اختر أحد الخيارات أدناه حسب نوع مشكلتك أو طلبك.\n\n`
        + helpdeskButtons.map(b => `**${b.label}** ${b.emoji ? `<:${b.label}:${b.emoji}>` : ''}: ${b.desc}`).join('\n')
        + `\n\n✅ للحصول على مساعدة اضغط الزر المناسب بالأسفل.`
      )
      .setThumbnail(serverImage)
      .setColor(0x0099ff);

    await room.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: "✅ تم إرسال ايمبد المساعدة بشكل احترافي.", ephemeral: true });
  }

  // عند الضغط على زر تكت
  if (interaction.isButton() && interaction.customId.startsWith('helpdesk_open_')) {
    const btnIdx = parseInt(interaction.customId.split('_')[2]);
    const btnData = helpdeskButtons[btnIdx];
    if (!btnData) return interaction.reply({ content: "❌ خيار غير موجود.", ephemeral: true });

    const categoryId = btnData.categoryId;
    const supportRoleId = interaction.guild.roles.cache.find(r => r.name === 'Support')?.id;
    const user = interaction.user;
    const guild = interaction.guild;
    const category = guild.channels.cache.get(categoryId);

    // تحقق هل لديه تكت مفتوح بنفس الكاتاجوري
    const existing = guild.channels.cache.find(c =>
      c.parentId === category.id &&
      c.type === ChannelType.GuildText &&
      c.topic === `TICKET-${user.id}`
    );
    if (existing) {
      return await interaction.reply({ content: `❗ لديك بالفعل تكت مفتوح: <#${existing.id}>`, ephemeral: true });
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

    // رسالة الترحيب في التكت بشكل جميل
    await channel.send(`<@&${supportRoleId}>`);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(btnData.color)
          .setTitle(`✉️ تكت جديد: ${btnData.label}`)
          .setDescription(
            `مرحبا <@${user.id}>! 👋\n**نوع التكت:** ${btnData.label}\n${btnData.desc}\n\n`
            + "سيتم الرد عليك من فريق الدعم الفني بأقرب وقت."
          )
          .setFooter({ text: 'Support Team', iconURL: interaction.guild.iconURL() })
      ]
    });

    await interaction.reply({ content: `✅ تم فتح تكت جديد: <#${channel.id}>`, ephemeral: true });
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
      .setTitle('🎉 قيف أواي كبير!')
      .setDescription(`> **${desc}**\n\nاضغط الزر بالأسفل للانضمام!\n\n🕒 وقت إعلان الفائز: <t:${Math.floor(endTime/1000)}:R>`)
      .addFields(
        { name: '🎁 بواسطة', value: `<@${interaction.user.id}>`, inline: true },
        { name: '👥 عدد المنضمين', value: '0', inline: true }
      )
      .setColor(0xf39c12)
      .setFooter({ text: 'حظاً موفقاً للجميع!' });

    const row = new ActionRowBuilder()
      .addComponents(new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 انضم للقيف أواي').setStyle(ButtonStyle.Success));
    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    client.giveaway = {
      msgId: msg.id,
      joined,
      endTime,
      channelId: interaction.channel.id,
      creatorId: interaction.user.id
    };
  }

  // زر الانضمام للقيف أواي
  if (interaction.isButton() && interaction.customId === 'giveaway_join' && client.giveaway && client.giveaway.msgId === interaction.message.id) {
    if (!client.giveaway.joined.includes(interaction.user.id)) {
      client.giveaway.joined.push(interaction.user.id);
      const embed = interaction.message.embeds[0];
      let newEmbed = EmbedBuilder.from(embed).spliceFields(1, 1, { name: '👥 عدد المنضمين', value: String(client.giveaway.joined.length), inline: true });
      await interaction.update({ embeds: [newEmbed], components: interaction.message.components });
    } else {
      await interaction.reply({ content: 'لقد انضممت بالفعل!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
