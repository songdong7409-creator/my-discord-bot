// ==================================================================================
// 1. 필수 라이브러리 및 설정
// ==================================================================================
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,

    ModalBuilder, TextInputBuilder, TextInputStyle, Events, PermissionsBitField
} = require('discord.js');
const { google } = require('googleapis');
const express = require('express');
require('dotenv').config();

// ==================================================================================
// 2. 웹서버 및 봇 기본 설정
// ==================================================================================
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('OK. 아도봇이 활성화 상태입니다.'));
app.listen(port, () => console.log(`웹서버가 ${port} 포트에서 실행 중입니다.`));

const SPREADSHEET_ID = '13bli8gZlcrBuLxicxefjyaTGuq1POYGfiQLt6j7-O1I';
const CLIENT_ID = '1427502996962541621';
const GUILD_ID = '1347088029294133259';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const raidParties = {};

// ==================================================================================
// 3. 슬래시 명령어 정의 및 등록
// ==================================================================================
const hourChoices = Array.from({ length: 24 }, (_, i) => ({ name: `${i.toString().padStart(2, '0')}시`, value: i.toString().padStart(2, '0') }));
const minuteChoices = Array.from({ length: 6 }, (_, i) => ({ name: `${(i * 10).toString().padStart(2, '0')}분`, value: (i * 10).toString().padStart(2, '0') }));

const commands = [
    new SlashCommandBuilder()
        .setName('모집')
        .setDescription('레이드 파티 모집 글을 생성합니다.')
        .addStringOption(option => option.setName('레이드').setDescription('레이드 이름을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('난이도').setDescription('난이도를 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('시').setDescription('출발 시간을 선택하세요.').setRequired(true).addChoices(...hourChoices.slice(0, 25)))
        .addStringOption(option => option.setName('분').setDescription('출발 분을 선택하세요.').setRequired(true).addChoices(...minuteChoices))
        .addStringOption(option => option.setName('기타').setDescription('기타 특이사항을 입력하세요. (선택 사항)').setRequired(false)),
    new SlashCommandBuilder() /* ... 지옥왼오 명령어 ... */,
    new SlashCommandBuilder() /* ... 지옥보상 명령어 ... */,
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`(/) ${commands.length}개의 슬래시 명령어 등록을 시작합니다.`);
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('(/) 슬래시 명령어 등록이 완료되었습니다.');
    } catch (error) {
        console.error('슬래시 명령어 등록 중 오류:', error);
    }
})();

// ==================================================================================
// 4. 이벤트 핸들러
// ==================================================================================
client.once(Events.ClientReady, () => {
    console.log(`✅ ${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isCommand()) {
        if (interaction.commandName === '모집') {
            const raidName = interaction.options.getString('레이드');
            const raidDifficulty = interaction.options.getString('난이도');
            const hour = interaction.options.getString('시');
            const minute = interaction.options.getString('분');
            const raidTime = `${hour}:${minute}`;
            const raidEtc = interaction.options.getString('기타');
            const raidTitle = `**${raidName} ${raidDifficulty}** 파티 모집`;
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2').setTitle(raidTitle)
                .setDescription('✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!')
                .setFooter({ text: `모집자: ${interaction.user.username}` }).setTimestamp()
                .addFields(
                    { name: '⏰ 출발 시간', value: `**${raidTime}**`, inline: true },
                    { name: '\u200B', value: '\u200B' }, // 빈 필드로 간격 조정
                    { name: '파티 1', value: Array(4).fill('⏳ 비어있음').join('\n'), inline: true },
                    { name: '파티 2', value: Array(4).fill('⏳ 비어있음').join('\n'), inline: true }
                );
            if (raidEtc) embed.spliceFields(1, 1, { name: '📝 기타 사항', value: raidEtc, inline: true });

            const row1 = new ActionRowBuilder();
            const row2 = new ActionRowBuilder();
            for (let i = 0; i < 8; i++) {
                const button = new ButtonBuilder().setCustomId(`join_raid_${i}`).setLabel(`슬롯 ${i+1} 참여`).setStyle(ButtonStyle.Success);
                if (i < 4) row1.addComponents(button);
                else row2.addComponents(button);
            }

            // ⭐ 신규: 삭제 버튼을 위한 새로운 줄(Row)을 추가합니다.
            const controlRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('delete_raid').setLabel('삭제').setStyle(ButtonStyle.Danger)
            );

            const sentMessage = await interaction.reply({ embeds: [embed], components: [row1, row2, controlRow], fetchReply: true });
            raidParties[sentMessage.id] = { title: raidTitle, slots: Array(8).fill(null), participants: {}, creatorId: interaction.user.id, creatorUsername: interaction.user.username, time: raidTime, etc: raidEtc };
        }
        // ... (지옥 명령어 로직은 여기에)
    }
    else if (interaction.isButton()) {
        const party = raidParties[interaction.message.id];
        if (!party) return interaction.reply({ content: '오류: 만료되거나 잘못된 모집 정보입니다.', ephemeral: true });

        // ⭐ 신규: 삭제 버튼 처리 로직
        if (interaction.customId === 'delete_raid') {
            // 권한 확인: 버튼을 누른 사람이 모집자이거나, 관리자 권한이 있는지 확인
            const hasAdminPerms = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            if (interaction.user.id !== party.creatorId && !hasAdminPerms) {
                return interaction.reply({ content: '⚠️ 모집자 또는 서버 관리자만 삭제할 수 있습니다.', ephemeral: true });
            }
            
            await interaction.message.delete();
            delete raidParties[interaction.message.id]; // 메모리에서 정보 삭제
            return interaction.reply({ content: '✅ 모집 글을 삭제했습니다.', ephemeral: true });
        }

        const slotIndex = parseInt(interaction.customId.split('_')[2]);
        const userInSlot = party.slots[slotIndex];

        if (interaction.customId.startsWith('cancel_raid_')) {
            if (userInSlot && userInSlot.id === interaction.user.id) {
                party.slots[slotIndex] = null;
                delete party.participants[interaction.user.id];
                await updateRaidMessage(interaction, interaction.message.id);
            } else { /* ... */ }
        }
        else if (interaction.customId.startsWith('join_raid_')) {
            if (userInSlot) return interaction.reply({ content: '⚠️ 이미 다른 분이 참여한 슬롯입니다!', ephemeral: true });
            if (party.participants[interaction.user.id]) return interaction.reply({ content: '⚠️ 이미 다른 슬롯에 참여하셨습니다!', ephemeral: true });
            
            const modal = new ModalBuilder().setCustomId(`role_modal_${interaction.message.id}_${slotIndex}`).setTitle(`슬롯 ${slotIndex + 1} 참여`);
            const jobInput = new TextInputBuilder().setCustomId('jobInput').setLabel("본인의 직업을 입력해주세요.").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('예: 버서커');
            modal.addComponents(new ActionRowBuilder().addComponents(jobInput));
            await interaction.showModal(modal);
        }
    }
    else if (interaction.isModalSubmit()) {
        const parts = interaction.customId.split('_'), messageId = parts[2], slotIndex = parseInt(parts[3]);
        const party = raidParties[messageId];
        const job = interaction.fields.getTextInputValue('jobInput').trim();
        if (!job) return interaction.reply({ content: "⚠️ 직업을 입력해주세요!", ephemeral: true });
        
        party.slots[slotIndex] = { id: interaction.user.id, username: interaction.user.username, job: job };
        party.participants[interaction.user.id] = slotIndex;
        
        await updateRaidMessage(interaction, messageId, true);
    }
});

// ==================================================================================
// 5. 메시지 업데이트 헬퍼 함수
// ==================================================================================
async function updateRaidMessage(interaction, messageId, isModalSubmit = false) {
    const party = raidParties[messageId];
    if (!party) return;

    const updatedEmbed = new EmbedBuilder()
        .setColor('#5865F2').setTitle(party.title)
        .setDescription('✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!')
        .setFooter({ text: `모집자: ${party.creatorUsername}` }).setTimestamp();
    
    updatedEmbed.addFields(
        { name: '⏰ 출발 시간', value: `**${party.time}**`, inline: true },
        { name: '\u200B', value: '\u200B' }
    );
    if (party.etc) updatedEmbed.spliceFields(1, 1, { name: '📝 기타 사항', value: party.etc, inline: true });
    
    const party1Slots = party.slots.slice(0, 4).map((s, i) => `**슬롯 ${i + 1}:** ${s ? `**${s.job}** | <@${s.id}>` : '⏳ 비어있음'}`).join('\n');
    const party2Slots = party.slots.slice(4, 8).map((s, i) => `**슬롯 ${i + 5}:** ${s ? `**${s.job}** | <@${s.id}>` : '⏳ 비어있음'}`).join('\n');
    updatedEmbed.addFields(
        { name: '파티 1', value: party1Slots, inline: true },
        { name: '파티 2', value: party2Slots, inline: true }
    );
    
    const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
    for (let i = 0; i < 8; i++) {
        const slot = party.slots[i];
        const button = new ButtonBuilder();
        if (slot) {
            if (slot.id === interaction.user.id) button.setCustomId(`cancel_raid_${i}`).setLabel(`슬롯 ${i+1} 취소`).setStyle(ButtonStyle.Danger);
            else button.setCustomId(`join_raid_${i}`).setLabel(slot.job).setStyle(ButtonStyle.Secondary).setDisabled(true);
        } else button.setCustomId(`join_raid_${i}`).setLabel(`슬롯 ${i+1} 참여`).setStyle(ButtonStyle.Success);
        
        if (i < 4) row1.addComponents(button);
        else row2.addComponents(button);
    }
    
    // ⭐ 신규: 업데이트 시에도 삭제 버튼을 계속 유지합니다.
    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('delete_raid').setLabel('삭제').setStyle(ButtonStyle.Danger)
    );
    const components = [row1, row2, controlRow];

    // ... (이하 로직은 생략 및 이전 코드와 동일)
}

// ==================================================================================
// 6. 봇 로그인
// ==================================================================================
client.login(process.env.DISCORD_TOKEN);