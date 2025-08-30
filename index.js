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

// إعداد أمر السلاش "تسطيب" مع تحديد رتبة الدعم الفني مباشرة
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
      .setName('image')
      .setDescription('رابط صورة (اختياري)')
      .setRequired(false))
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
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'تسطيب') {
      const room = interaction.options.getChannel('room');
      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('desc');
      const image = interaction.options.getString('image');
      const buttonsValue = interaction.options.getString('buttons');
      const category = interaction.options.getChannel('category');
      const supportRole = interaction.options.getRole('support');

      // حفظ إعدادات التكت في الذاكرة
      client.ticketConfig = {
        categoryId: category.id,
        supportRoleId: supportRole.id,
      };

      // شريط الأزرار
      const buttons = buttonsValue.split('/').map(b => b.trim()).filter(Boolean);
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

      await room.send({ embeds: [embed], components: [buttonsRow] });
      await interaction.reply({ content: "✅ تم إرسال الايمبد بنجاح!", ephemeral: true });

      // حفظ أسماء الأزرار لاستعمالها لاحقًا عند فتح التكت
      client.ticketButtons = buttons;
    }
  }

  // عند الضغط على زر فتح التكت
  if (interaction.isButton()) {
    // تحقق أن الزر من التكتات
    if (interaction.customId.startsWith('ticket_open_')) {
      const btnIdx = parseInt(interaction.customId.split('_')[2]);
      const btnLabel = client.ticketButtons[btnIdx];

      const guild = interaction.guild;
      const category = guild.channels.cache.get(client.ticketConfig.categoryId);
      const supportRoleId = client.ticketConfig.supportRoleId;
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
      const supportRoleId = client.ticketConfig.supportRoleId;
      // تحقق أن الضاغط من رتبة الدعم
      if (!interaction.member.roles.cache.has(supportRoleId)) {
        await interaction.reply({ content: "❌ فقط أعضاء الدعم يمكنهم استلام التكت.", ephemeral: true });
        return;
      }
      // منع فتح التكت إذا كان المستلم هو نفس فاتح التكت
      const ticketUserId = channel.topic?.replace('TICKET-', '');
      if (interaction.user.id === ticketUserId) {
        await interaction.reply({ content: "❌ لا يمكنك استلام تكت فتحته بنفسك.", ephemeral: true });
        return;
      }

      // حفظ المستلم بالتشات
      channel.ticketClaimedBy = interaction.user.id;

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

      // تحقق أن المستلم هو من يغلق التكت
      const ticketUserId = channel.topic?.replace('TICKET-', '');
      if (channel.ticketClaimedBy !== interaction.user.id) {
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
      await interaction.channel.delete();
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
