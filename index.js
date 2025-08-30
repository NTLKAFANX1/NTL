require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder, REST, Routes,
  StringSelectMenuBuilder
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

// أمر السلاش فيه خيار نوع التفاعل: أزرار أو قائمة خيارات
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
      .setName('options')
      .setDescription('الأسماء (افصلهم ب / مثل: دعم فني/شراء)، للأزرار أو خيارات القائمة')
      .setRequired(true))
    .addStringOption(option => option
      .setName('interaction_type')
      .setDescription('نوع التفاعل: أزرار أو قائمة خيارات')
      .addChoices(
        { name: 'أزرار', value: 'buttons' },
        { name: 'قائمة خيارات', value: 'selectmenu' }
      )
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
      try {
        const room = interaction.options.getChannel('room');
        const title = interaction.options.getString('title');
        const desc = interaction.options.getString('desc');
        const optionsValue = interaction.options.getString('options');
        const interactionType = interaction.options.getString('interaction_type');
        const category = interaction.options.getChannel('category');
        const supportRole = interaction.options.getRole('support');
        const image = interaction.options.getString('image');

        const optionNames = optionsValue.split('/').map(b => b.trim()).filter(Boolean);

        let row;
        if (interactionType === 'buttons') {
          row = new ActionRowBuilder();
          optionNames.forEach((btn, i) => {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_open_btn_${i}`)
                .setLabel(btn)
                .setStyle(ButtonStyle.Primary)
            );
          });
        } else if (interactionType === 'selectmenu') {
          row = new ActionRowBuilder()
            .addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('ticket_open_select')
                .setPlaceholder('اختر نوع التكت')
                .addOptions(optionNames.map((opt, idx) => ({
                  label: opt,
                  value: `select_${idx}`,
                  description: `فتح تكت نوع ${opt}`
                })))
            );
        }

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor(0x00AE86);

        if (image) embed.setImage(image);

        // إرسال الايمبد وحفظ إعداداته في ملف
        const message = await room.send({ embeds: [embed], components: [row] });

        ticketConfigData[message.id] = {
          categoryId: category.id,
          supportRoleId: supportRole.id,
          optionNames,
          interactionType,
          title,
          desc,
          image
        };
        saveTickets();

        await interaction.reply({ content: "✅ تم إرسال الايمبد بنجاح!", ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `❌ حدث خطأ أثناء إرسال الايمبد: ${err}`, ephemeral: true });
      }
    }
  }

  // عند الضغط على زر أو اختيار من القائمة
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    let config;
    let btnLabel;
    let btnIdx;
    let msgId = interaction.message.id;

    if (interaction.isButton() && interaction.customId.startsWith('ticket_open_btn_')) {
      config = ticketConfigData[msgId];
      if (!config) return await interaction.reply({ content: "❌ إعدادات التكت غير موجودة أو تم فقدها.", ephemeral: true });

      btnIdx = parseInt(interaction.customId.split('_')[3]);
      btnLabel = config.optionNames[btnIdx];
    }
    else if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_open_select') {
      config = ticketConfigData[msgId];
      if (!config) return await interaction.reply({ content: "❌ إعدادات التكت غير موجودة أو تم فقدها.", ephemeral: true });

      btnIdx = parseInt(interaction.values[0].split('_')[1]);
      btnLabel = config.optionNames[btnIdx];
    } else {
      return;
    }

    // نفس منطق فتح التكت
    const guild = interaction.guild;
    const category = guild.channels.cache.get(config.categoryId);
    const supportRoleId = config.supportRoleId;
    const user = interaction.user;

    const existing = guild.channels.cache.find(c =>
      c.parentId === category.id &&
      c.type === ChannelType.GuildText &&
      c.topic === `TICKET-${user.id}`
    );
    if (existing) {
      return await interaction.reply({ content: `⚠️ لديك بالفعل تكت مفتوح: <#${existing.id}>`, ephemeral: true });
    }

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

    ticketConfigData[channel.id] = {
      ...config,
      ticketOwnerId: user.id,
      claimedBy: null
    };
    saveTickets();

    await channel.send(`<@&${supportRoleId}>`);
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

  // باقي منطق استلام/غلق التكت كما سابقًا
  if (interaction.isButton() && ['ticket_claim', 'ticket_close', 'ticket_cancel_close', 'ticket_confirm_close'].includes(interaction.customId)) {
    const channel = interaction.channel;
    const config = ticketConfigData[channel.id];
    if (!config) return await interaction.reply({ content: "❌ إعدادات التكت غير موجودة.", ephemeral: true });

    const supportRoleId = config.supportRoleId;
    const ticketOwnerId = config.ticketOwnerId;

    if (interaction.customId === 'ticket_claim') {
      if (!interaction.member.roles.cache.has(supportRoleId)) {
        return await interaction.reply({ content: "❌ فقط أعضاء الدعم يمكنهم استلام التكت.", ephemeral: true });
      }
      if (interaction.user.id === ticketOwnerId) {
        return await interaction.reply({ content: "❌ لا يمكنك استلام تكت فتحته بنفسك.", ephemeral: true });
      }
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
      if (!claimedBy || claimedBy !== interaction.user.id) {
        return await interaction.reply({ content: "❌ فقط من استلم التكت يستطيع غلقه.", ephemeral: true });
      }
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
      return await interaction.reply({
        content: 'هل أنت متأكد أنك تريد غلق التكت؟',
        components: [confirmRow],
        ephemeral: false
      });
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
});

client.login(process.env.DISCORD_TOKEN);
