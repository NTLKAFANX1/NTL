require('dotenv').config();
const { 
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder, REST, Routes 
} = require('discord.js');

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

// حفظ إعدادات كل روم تكت في Map
client.ticketConfigMap = new Map();

// ترتيب الخيارات: كل المطلوب أولًا ثم الغير مطلوب
const commands = [
  new SlashCommandBuilder()
    .setName('تسطيب')
    .setDescription('إنشاء ايمبد تكتات مخصص')
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
      .setName('buttons')
      .setDescription('أسماء الأزرار بالشريط (افصل كل واحد ب / مثل: دعم فني/شراء)')
      .setRequired(true))
    .addChannelOption(option => option
      .setName('category')
      .setDescription('الكاتاجوري الذي فيه غرف التكتات')
      .setRequired(true))
    .addRoleOption(option => option
      .setName('support')
      .setDescription('رتبة الدعم الفني')
      .setRequired(true))
    .addStringOption(option => option
      .setName('image')
      .setDescription('رابط صورة (اختياري)')
      .setRequired(false))
    .toJSON()
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Slash command uploaded.');
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async interaction => {
  // أمر السلاش
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'تسطيب') {
      const room = interaction.options.getChannel('room');
      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('desc');
      const buttonsValue = interaction.options.getString('buttons');
      const category = interaction.options.getChannel('category');
      const supportRole = interaction.options.getRole('support');
      const image = interaction.options.getString('image');

      // حفظ إعدادات التكت في Map حسب ايدي الروم (ايمبد التكت)
      const buttons = buttonsValue.split('/').map(b => b.trim()).filter(Boolean);

      const config = {
        categoryId: category.id,
        supportRoleId: supportRole.id,
        buttons: buttons,
      };

      const buttonsRow = new ActionRowBuilder();
      buttons.forEach((btn, i) => {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_open_${i}`)
            .setLabel(btn)
            .setStyle(ButtonStyle.Primary)
        );
      });

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(0x00AE86);

      if (image) embed.setImage(image);

      // إرسال الايمبد وحفظ إعداداته بـ Map
      const message = await room.send({ embeds: [embed], components: [buttonsRow] });
      client.ticketConfigMap.set(message.id, config);

      await interaction.reply({ content: "✅ تم إرسال الايمبد بنجاح!", ephemeral: true });
    }
  }

  // عند الضغط على زر فتح تكت
  if (interaction.isButton()) {
    // تحقق أن الزر من التكتات
    if (interaction.customId.startsWith('ticket_open_')) {
      // جلب إعدادات التكت من رسالة الايمبد
      const msgId = interaction.message.id;
      const config = client.ticketConfigMap.get(msgId);

      if (!config) {
        await interaction.reply({ content: "❌ حدث خطأ: إعدادات التكت غير موجودة. أعد إرسال الايمبد.", ephemeral: true });
        return;
      }

      const btnIdx = parseInt(interaction.customId.split('_')[2]);
      const btnLabel = config.buttons[btnIdx];

      const guild = interaction.guild;
      const category = guild.channels.cache.get(config.categoryId);
      const supportRoleId = config.supportRoleId;
      const user = interaction.user;

      // تحقق هل يوجد تكت مفتوح لهذا العضو
      const existing = guild.channels.cache.find(c =>
        c.parentId === category.id &&
        c.type === ChannelType.GuildText &&
        c.topic === `TICKET-${user.id}`
      );
      if (existing) {
        await interaction.reply({ content: `⚠️ لديك بالفعل تكت مفتوح: <#${existing.id}>`, ephemeral: true });
        return;
      }

      // إنشاء الغرفة مع صلاحيات مخصصة
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

      // حفظ إعدادات الغرفة الجديدة في Map
      client.ticketConfigMap.set(channel.id, {
        ...config,
        ticketOwnerId: user.id,
        claimedBy: null,
      });

      // منشن رتبة الدعم الفني
      await channel.send(`<@&${supportRoleId}>`);
      
      // رسالة الترحيب مع أزرار "استلام/غلق"
      const claimRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('استلام التكت')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('غلق التكت')
            .setStyle(ButtonStyle.Danger)
        );
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('مرحبا 👋')
            .setDescription(
              `مرحبا <@${user.id}>! شكرا لفتح تكت **${btnLabel}**.\nسيتم الرد عليك قريبًا من فريق الدعم الفني.`
            )
        ],
        components: [claimRow]
      });

      await interaction.reply({ content: `✅ تم فتح تكت جديد: <#${channel.id}>`, ephemeral: true });
    }

    // استلام التكت
    else if (interaction.customId === 'ticket_claim') {
      const channel = interaction.channel;
      const config = client.ticketConfigMap.get(channel.id);
      if (!config) {
        await interaction.reply({ content: "❌ إعدادات التكت غير موجودة.", ephemeral: true });
        return;
      }
      const supportRoleId = config.supportRoleId;
      const ticketOwnerId = config.ticketOwnerId;

      // تحقق أن الضاغط من رتبة الدعم
      if (!interaction.member.roles.cache.has(supportRoleId)) {
        await interaction.reply({ content: "❌ فقط أعضاء الدعم يمكنهم استلام التكت.", ephemeral: true });
        return;
      }
      // منع فتح التكت إذا كان المستلم هو نفس فاتح التكت
      if (interaction.user.id === ticketOwnerId) {
        await interaction.reply({ content: "❌ لا يمكنك استلام تكت فتحته بنفسك.", ephemeral: true });
        return;
      }

      // حفظ المستلم في إعدادات الغرفة
      config.claimedBy = interaction.user.id;
      client.ticketConfigMap.set(channel.id, config);

      // تعديل الصلاحيات: فقط المستلم وفاتح التكت يستطيعان الكتابة، باقي الدعم فقط يشاهدون ويعملون threads
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

      await interaction.reply({ content: `تم استلام التكت بواسطة <@${interaction.user.id}>!`, ephemeral: false });
    }

    // غلق التكت (تأكيد)
    else if (interaction.customId === 'ticket_close') {
      const channel = interaction.channel;
      const config = client.ticketConfigMap.get(channel.id);
      if (!config) {
        await interaction.reply({ content: "❌ إعدادات التكت غير موجودة.", ephemeral: true });
        return;
      }
      const claimedBy = config.claimedBy;

      // تحقق أن المستلم هو من يغلق التكت
      if (!claimedBy || claimedBy !== interaction.user.id) {
        await interaction.reply({ content: "❌ فقط من استلم التكت يستطيع غلقه.", ephemeral: true });
        return;
      }

      // رسالة تأكيد الغلق
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_cancel_close')
            .setLabel('تراجع')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('ticket_confirm_close')
            .setLabel('غلق نهائي')
            .setStyle(ButtonStyle.Danger)
        );
      await interaction.reply({
        content: 'هل أنت متأكد أنك تريد غلق التكت؟',
        components: [confirmRow],
        ephemeral: false
      });
    }
    // زر تراجع غلق التكت
    else if (interaction.customId === 'ticket_cancel_close') {
      await interaction.update({ content: 'تم إلغاء عملية الغلق.', components: [] });
    }
    // زر غلق نهائي
    else if (interaction.customId === 'ticket_confirm_close') {
      // حذف إعدادات التكت من Map
      client.ticketConfigMap.delete(interaction.channel.id);
      await interaction.channel.delete();
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
