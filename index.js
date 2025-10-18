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
    if (interaction.isCommand()) {
        const { commandName } = interaction;
        if (commandName === '모집') {
            const raidName = interaction.options.getString('레이드');
            const raidDifficulty = interaction.options.getString('난이도');
            const raidTitle = `**${raidName} ${raidDifficulty}** 파티 모집`;
            const initialSlots = Array(8).fill(null);
            
            // ❗ 수정: 초기 설명 텍스트를 생성합니다.
            let description = '✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!\n\n';
            const slotTexts = initialSlots.map((slot, i) => `**슬롯 ${i + 1}:** ⏳ 비어있음`);
            description += slotTexts.slice(0, 4).join(' | ') + '\n';
            description += slotTexts.slice(4, 8).join(' | ');

            const embed = new EmbedBuilder()
                .setColor('#5865F2').setTitle(raidTitle)
                .setDescription(description) // Description에 슬롯 텍스트를 넣습니다.
                .setFooter({ text: `모집자: ${interaction.user.username}` }).setTimestamp();
            
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
        else if (commandName === '지옥왼오') { /* ... 기존과 동일 ... */ }
        else if (commandName === '지옥보상') { /* ... 기존과 동일 ... */ }
    }
    else if (interaction.isButton()) {
        // ... (이하 버튼 및 모달 처리 로직은 아래 헬퍼 함수를 통해 동일하게 작동)
        const customId = interaction.customId;
        const party = raidParties[interaction.message.id];
        if (!party) return interaction.reply({ content: '오류: 만료된 모집 정보입니다.', ephemeral: true });
        
        const slotIndex = parseInt(customId.split('_')[2]);
        const userInSlot = party.slots[slotIndex];

        if (customId.startsWith('cancel_raid_')) {
            if (userInSlot && userInSlot.id === interaction.user.id) {
                party.slots[slotIndex] = null;
                delete party.participants[interaction.user.id];
                await updateRaidMessage(interaction, interaction.message.id);
            } else {
                return interaction.reply({ content: '⚠️ 본인이 참여한 슬롯만 취소할 수 있습니다.', ephemeral: true });
            }
        }
        else if (customId.startsWith('join_raid_')) {
            if (userInSlot) return interaction.reply({ content: '⚠️ 이미 다른 분이 참여한 슬롯입니다!', ephemeral: true });
            if (party.participants[interaction.user.id]) return interaction.reply({ content: '⚠️ 이미 다른 슬롯에 참여하셨습니다!', ephemeral: true });
            
            const modal = new ModalBuilder().setCustomId(`role_modal_${interaction.message.id}_${slotIndex}`).setTitle(`슬롯 ${slotIndex + 1} 참여`);
            const roleInput = new TextInputBuilder()
                .setCustomId('jobInput')
                .setLabel("본인의 직업을 입력해주세요.")
                .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('예: 버서커, 바드, 홀리나이트 등');
            modal.addComponents(new ActionRowBuilder().addComponents(roleInput));
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

    // ❗ 수정: 설명(Description)을 4x2 레이아웃으로 동적으로 생성합니다.
    let description = '✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!\n\n';
    const slotTexts = party.slots.map((slot, i) => {
        // 참여자가 있으면 직업과 멘션을, 없으면 '비어있음' 표시
        return `**슬롯 ${i + 1}:** ${slot ? `${slot.job} | <@${slot.id}>` : '⏳ 비어있음'}`;
    });
    description += slotTexts.slice(0, 4).join(' | ') + '\n';
    description += slotTexts.slice(4, 8).join(' | ');

    const updatedEmbed = new EmbedBuilder()
        .setColor('#5865F2').setTitle(party.title)
        .setDescription(description) // Description을 업데이트된 내용으로 설정
        .setFooter({ text: `모집자: ${party.creator}` }).setTimestamp();
    
    // 버튼 상태 업데이트 (참여/취소 동적 변경)
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    for (let i = 0; i < 8; i++) {
        const slot = party.slots[i];
        const button = new ButtonBuilder();
        if (slot) {
            if (slot.id === interaction.user.id) {
                button.setCustomId(`cancel_raid_${i}`).setLabel(`슬롯 ${i+1} 취소`).setStyle(ButtonStyle.Danger);
            } else {
                button.setCustomId(`join_raid_${i}`).setLabel(slot.job).setStyle(ButtonStyle.Secondary).setDisabled(true);
            }
        } else {
            button.setCustomId(`join_raid_${i}`).setLabel(`슬롯 ${i+1} 참여`).setStyle(ButtonStyle.Success);
        }
        if (i < 4) row1.addComponents(button);
        else row2.addComponents(button);
    }

    if(isModalSubmit) {
        await interaction.update({ embeds: [updatedEmbed], components: [row1, row2] });
    } else {
        await interaction.message.edit({ embeds: [updatedEmbed], components: [row1, row2] });
        if(interaction.isButton() && interaction.customId.startsWith('cancel_raid_')) {
            await interaction.reply({ content: '✅ 참여가 취소되었습니다.', ephemeral: true });
        }
    }
}

// ==================================================================================
// 6. 봇 로그인 및 기존 코드 (참고용)
// ==================================================================================
client.login(process.env.DISCORD_TOKEN);

// 기존 /지옥왼오, /지옥보상 로직은 위 코드에 완벽하게 통합되었으므로 이 주석은 제거해도 됩니다.
/* ... */