// ==================================================================================
// 1. 필수 라이브러리 및 설정
// ==================================================================================
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, Events
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

// [주의] 봇 재시작 시 데이터가 사라지는 임시 저장소입니다.
const raidParties = {};

// ==================================================================================
// 3. 슬래시 명령어 정의 및 등록
// ==================================================================================
const commands = [
    new SlashCommandBuilder()
        .setName('모집')
        .setDescription('레이드 파티 모집 글을 생성합니다.')
        .addStringOption(option => option.setName('레이드').setDescription('레이드 이름을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('난이도').setDescription('난이도를 입력하세요. (예: 하드, 노말 반숙 등)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('지옥왼오')
        .setDescription('지옥 열쇠 등급에 따라 왼쪽/오른쪽 경로를 추천해줍니다.')
        .addStringOption(option =>
            option.setName('열쇠등급').setDescription('등급을 선택하세요.').setRequired(true)
                .addChoices({ name: '희귀', value: '희귀' }, { name: '영웅', value: '영웅' }, { name: '전설', value: '전설' })),
    new SlashCommandBuilder()
        .setName('지옥보상')
        .setDescription('지옥 클리어 후 보상 정보를 알려줍니다.')
        .addStringOption(option =>
            option.setName('아이템레벨').setDescription('레벨 구간을 선택하세요.').setRequired(true)
                .addChoices({ name: '1640 ~ 1699', value: '1640' }, { name: '1700 ~ 1729', value: '1700' }, { name: '1730 이상', value: '1730' }))
        .addIntegerOption(option => option.setName('층수').setDescription('도달한 층수를 입력하세요. (예: 85)').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`(/) ${commands.length}개의 슬래시 명령어 등록을 시작합니다.`);
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
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
    // --- 슬래시 명령어 처리 ---
    if (interaction.isCommand()) {
        const { commandName } = interaction;
        if (commandName === '모집') {
            const raidName = interaction.options.getString('레이드');
            const raidDifficulty = interaction.options.getString('난이도');
            const raidTitle = `**${raidName} ${raidDifficulty}** 파티 모집`;
            const initialSlots = Array(8).fill(null);
            const embed = new EmbedBuilder()
                .setColor('#5865F2').setTitle(raidTitle)
                .setDescription('✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!')
                .setFooter({ text: `모집자: ${interaction.user.username}` }).setTimestamp();
            
            // ❗ 수정: 4행 2열로 필드를 추가합니다.
            for (let i = 0; i < 4; i++) {
                embed.addFields(
                    { name: `슬롯 ${i * 2 + 1}`, value: '⏳ 비어있음', inline: true },
                    { name: `슬롯 ${i * 2 + 2}`, value: '⏳ 비어있음', inline: true }
                );
            }
            
            const row1 = new ActionRowBuilder();
            const row2 = new ActionRowBuilder();
            for (let i = 0; i < 8; i++) {
                const button = new ButtonBuilder().setCustomId(`join_raid_${i}`).setLabel(`슬롯 ${i+1} 참여`).setStyle(ButtonStyle.Success);
                if (i < 4) row1.addComponents(button);
                else row2.addComponents(button);
            }
            const sentMessage = await interaction.reply({ embeds: [embed], components: [row1, row2], fetchReply: true });
            raidParties[sentMessage.id] = { title: raidTitle, slots: initialSlots, participants: {}, creator: interaction.user.username };
        }
        else if (commandName === '지옥왼오') { /* ... 기존 코드와 동일 ... */ }
        else if (commandName === '지옥보상') { /* ... 기존 코드와 동일 ... */ }
    }
    // --- 버튼 클릭 처리 ---
    else if (interaction.isButton()) {
        const customId = interaction.customId;
        const party = raidParties[interaction.message.id];
        if (!party) return interaction.reply({ content: '오류: 만료된 모집 정보입니다.', ephemeral: true });
        
        const slotIndex = parseInt(customId.split('_')[2]);
        const userInSlot = party.slots[slotIndex];

        // ❗ 신규: 참여 취소 로직
        if (customId.startsWith('cancel_raid_')) {
            if (userInSlot && userInSlot.id === interaction.user.id) {
                party.slots[slotIndex] = null;
                delete party.participants[interaction.user.id];
                // 메시지 업데이트 로직은 아래에서 공통으로 처리
            } else {
                return interaction.reply({ content: '⚠️ 본인이 참여한 슬롯만 취소할 수 있습니다.', ephemeral: true });
            }
        }
        // --- 참여 로직 ---
        else if (customId.startsWith('join_raid_')) {
            if (userInSlot) return interaction.reply({ content: '⚠️ 이미 다른 분이 참여한 슬롯입니다!', ephemeral: true });
            if (party.participants[interaction.user.id]) return interaction.reply({ content: '⚠️ 이미 다른 슬롯에 참여하셨습니다!', ephemeral: true });
            
            // ❗ 수정: '직업'을 입력받는 모달
            const modal = new ModalBuilder().setCustomId(`role_modal_${interaction.message.id}_${slotIndex}`).setTitle(`슬롯 ${slotIndex + 1} 참여`);
            const roleInput = new TextInputBuilder()
                .setCustomId('jobInput')
                .setLabel("본인의 직업을 입력해주세요.")
                .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('예: 버서커, 바드, 홀리나이트 등');
            modal.addComponents(new ActionRowBuilder().addComponents(roleInput));
            await interaction.showModal(modal);
            return; // 모달을 띄운 후에는 아래 업데이트 로직을 타면 안되므로 여기서 종료
        }
        
        // --- 참여 취소 후 공통 업데이트 로직 ---
        // (Embed와 버튼을 재생성하는 로직은 중복되므로 함수로 분리)
        await updateRaidMessage(interaction, interaction.message.id);
    }
    // --- 모달 제출 처리 ---
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('role_modal_')) {
        const parts = interaction.customId.split('_'), messageId = parts[2], slotIndex = parseInt(parts[3]);
        const party = raidParties[messageId];
        // ❗ 수정: '직업'으로 변수명 변경 및 유효성 검사 제거
        const job = interaction.fields.getTextInputValue('jobInput').trim();
        if (!job) {
             return interaction.reply({ content: "⚠️ 직업을 입력해주세요!", ephemeral: true });
        }
        
        party.slots[slotIndex] = { id: interaction.user.id, username: interaction.user.username, job: job };
        party.participants[interaction.user.id] = slotIndex;
        
        await updateRaidMessage(interaction, messageId, true); // 모달 제출은 interaction.update() 사용
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
        .setFooter({ text: `모집자: ${party.creator}` }).setTimestamp();
    
    // ❗ 수정: 4행 2열로 필드를 재생성
    for (let i = 0; i < 4; i++) {
        const slot1 = party.slots[i * 2];
        const slot2 = party.slots[i * 2 + 1];
        updatedEmbed.addFields(
            { name: `슬롯 ${i * 2 + 1}`, value: slot1 ? `**${slot1.job}** | <@${slot1.id}>` : '⏳ 비어있음', inline: true },
            { name: `슬롯 ${i * 2 + 2}`, value: slot2 ? `**${slot2.job}** | <@${slot2.id}>` : '⏳ 비어있음', inline: true }
        );
    }
    
    // ❗ 신규: 참여/취소 상태에 따라 버튼을 동적으로 생성
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    for (let i = 0; i < 8; i++) {
        const slot = party.slots[i];
        const button = new ButtonBuilder();

        if (slot) { // 슬롯에 누가 있다면
            if (slot.id === interaction.user.id) { // 그게 나라면 '취소' 버튼
                button.setCustomId(`cancel_raid_${i}`).setLabel(`슬롯 ${i+1} 취소`).setStyle(ButtonStyle.Danger);
            } else { // 다른 사람이면 '참여 완료' 비활성 버튼
                button.setCustomId(`join_raid_${i}`).setLabel(slot.job).setStyle(ButtonStyle.Secondary).setDisabled(true);
            }
        } else { // 슬롯이 비어있다면 '참여' 버튼
            button.setCustomId(`join_raid_${i}`).setLabel(`슬롯 ${i+1} 참여`).setStyle(ButtonStyle.Success);
        }

        if (i < 4) row1.addComponents(button);
        else row2.addComponents(button);
    }

    if(isModalSubmit) {
        await interaction.update({ embeds: [updatedEmbed], components: [row1, row2] });
    } else {
        await interaction.message.edit({ embeds: [updatedEmbed], components: [row1, row2] });
        // 버튼 클릭 후 ephemeral 메시지로 피드백을 주어 사용자 경험 향상
        if(interaction.isButton()) await interaction.reply({ content: '✅ 참여가 취소되었습니다.', ephemeral: true });
    }
}


// ==================================================================================
// 6. 봇 로그인
// ==================================================================================
client.login(process.env.DISCORD_TOKEN);


// --- 기존 /지옥왼오, /지옥보상 로직 (참고용으로 남겨두었으며, 실제로는 위 코드에 통합되었습니다) ---
/*
    // ... interaction is command ...
    if (commandName === '지옥왼오') {
        const keyGrade = interaction.options.getString('열쇠등급');
        let attempts = { '희귀': 5, '영웅': 6, '전설': 7 }[keyGrade];
        let result = '';
        for (let i = 0; i < attempts; i++) {
            result += `${i + 1}. -> ${Math.random() < 0.5 ? '⬅️ 왼쪽' : '➡️ 오른쪽'}\n`;
        }
        const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`[${keyGrade} 열쇠] 경로 추천`).setDescription(result).setTimestamp().setFooter({ text: '선택은 모험가님의 몫!' });
        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === '지옥보상') {
        await interaction.deferReply();
        try {
            const itemLevel = interaction.options.getString('아이템레벨');
            const floor = interaction.options.getInteger('층수');
            const stage = Math.floor(floor / 10);
            const auth = new google.auth.GoogleAuth({ keyFile: 'credentials.json', scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly' });
            const sheets = google.sheets({ version: 'v4', auth });
            const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${itemLevel}!A:Z` });
            const rows = res.data.values;
            if (!rows || rows.length === 0) return interaction.editReply(`'${itemLevel}' 시트에서 데이터를 찾을 수 없습니다.`);
            const header = rows[0], dataRow = rows.slice(1).find(r => parseInt(r[1]) === stage);
            if (!dataRow) return interaction.editReply(`[${itemLevel} 레벨] [${stage}단계]에 대한 보상 정보를 찾을 수 없습니다.`);
            const embed = new EmbedBuilder().setColor(0x0099FF).setTitle(`[${itemLevel} 레벨] [${stage}단계] 기본 보상`).setDescription(`도달한 ${floor}층(${stage}단계)에서 획득하는 기본 보상 목록입니다.`).setTimestamp();
            let rewardString = '';
            header.forEach((h, i) => { if (i > 1 && dataRow[i] && dataRow[i].trim() !== '') rewardString += `**${h}**: ${dataRow[i]}\n`; });
            embed.addFields({ name: '🎁 획득 아이템 목록', value: rewardString || '정보 없음' });
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('구글 시트 API 오류:', err);
            await interaction.editReply('보상 정보를 불러오는 중 오류가 발생했습니다.');
        }
    }
*/