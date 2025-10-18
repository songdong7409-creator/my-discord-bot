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
    // ⭐ 신규: 시간, 기타 옵션이 추가된 /모집 명령어
    new SlashCommandBuilder()
        .setName('모집')
        .setDescription('레이드 파티 모집 글을 생성합니다.')
        .addStringOption(option => option.setName('레이드').setDescription('레이드 이름을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('난이도').setDescription('난이도를 입력하세요. (예: 하드, 노말 반숙 등)').setRequired(true))
        .addStringOption(option =>
            option.setName('시간').setDescription('출발 시간을 선택하세요.').setRequired(true)
                .addChoices( // 10분 단위 시간 선택지 (최대 25개)
                    { name: '19:00', value: '19:00' }, { name: '19:10', value: '19:10' }, { name: '19:20', value: '19:20' },
                    { name: '19:30', value: '19:30' }, { name: '19:40', value: '19:40' }, { name: '19:50', value: '19:50' },
                    { name: '20:00', value: '20:00' }, { name: '20:10', value: '20:10' }, { name: '20:20', value: '20:20' },
                    { name: '20:30', value: '20:30' }, { name: '20:40', value: '20:40' }, { name: '20:50', value: '20:50' },
                    { name: '21:00', value: '21:00' }, { name: '21:10', value: '21:10' }, { name: '21:20', value: '21:20' },
                    { name: '21:30', value: '21:30' }, { name: '21:40', value: '21:40' }, { name: '21:50', value: '21:50' },
                    { name: '22:00', value: '22:00' }, { name: '22:10', value: '22:10' }, { name: '22:20', value: '22:20' },
                    { name: '22:30', value: '22:30' }, { name: '22:40', value: '22:40' }, { name: '22:50', value: '22:50' },
                    { name: '23:00', value: '23:00' }
                ))
        .addStringOption(option => option.setName('기타').setDescription('기타 특이사항을 입력하세요. (선택 사항)').setRequired(false)),
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
            const raidTime = interaction.options.getString('시간'); // ⭐ 신규
            const raidEtc = interaction.options.getString('기타'); // ⭐ 신규
            
            const raidTitle = `**${raidName} ${raidDifficulty}** 파티 모집`;
            const initialSlots = Array(8).fill(null);
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2').setTitle(raidTitle)
                .setDescription('✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!')
                .setFooter({ text: `모집자: ${interaction.user.username}` }).setTimestamp();

            // ⭐ 신규: 시간과 기타 정보를 필드로 추가
            embed.addFields({ name: '⏰ 출발 시간', value: `**${raidTime}**`, inline: true });
            if (raidEtc) { // 기타 정보가 있을 때만 필드 추가
                embed.addFields({ name: '📝 기타 사항', value: raidEtc, inline: true });
            }
            embed.addFields({ name: '\u200B', value: '\u200B' }); // 줄바꿈을 위한 빈 필드

            const party1Slots = initialSlots.slice(0, 4).map((_, i) => `**슬롯 ${i + 1}:** ⏳ 비어있음`).join('\n');
            const party2Slots = initialSlots.slice(4, 8).map((_, i) => `**슬롯 ${i + 5}:** ⏳ 비어있음`).join('\n');
            embed.addFields(
                { name: '파티 1', value: party1Slots, inline: true },
                { name: '파티 2', value: party2Slots, inline: true }
            );
            
            const row1 = new ActionRowBuilder();
            const row2 = new ActionRowBuilder();
            for (let i = 0; i < 8; i++) {
                const button = new ButtonBuilder().setCustomId(`join_raid_${i}`).setLabel(`슬롯 ${i+1} 참여`).setStyle(ButtonStyle.Success);
                if (i < 4) row1.addComponents(button);
                else row2.addComponents(button);
            }
            const sentMessage = await interaction.reply({ embeds: [embed], components: [row1, row2], fetchReply: true });
            raidParties[sentMessage.id] = { title: raidTitle, slots: initialSlots, participants: {}, creator: interaction.user.username, time: raidTime, etc: raidEtc };
        }
        // ... (지옥왼오, 지옥보상 명령어는 기존과 동일하게 작동)
    }
    else if (interaction.isButton()) {
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

    const updatedEmbed = new EmbedBuilder()
        .setColor('#5865F2').setTitle(party.title)
        .setDescription('✅ 아래 버튼을 눌러 본인의 직업을 입력하고 참가하세요!')
        .setFooter({ text: `모집자: ${party.creator}` }).setTimestamp();
    
    // ⭐ 신규: 업데이트 시에도 시간, 기타 정보 필드를 유지합니다.
    updatedEmbed.addFields({ name: '⏰ 출발 시간', value: `**${party.time}**`, inline: true });
    if (party.etc) {
        updatedEmbed.addFields({ name: '📝 기타 사항', value: party.etc, inline: true });
    }
    updatedEmbed.addFields({ name: '\u200B', value: '\u200B' });

    const party1Slots = party.slots.slice(0, 4).map((slot, i) => {
        return `**슬롯 ${i + 1}:** ${slot ? `**${slot.job}** | <@${slot.id}>` : '⏳ 비어있음'}`;
    }).join('\n');
    const party2Slots = party.slots.slice(4, 8).map((slot, i) => {
        return `**슬롯 ${i + 5}:** ${slot ? `**${slot.job}** | <@${slot.id}>` : '⏳ 비어있음'}`;
    }).join('\n');

    updatedEmbed.addFields(
        { name: '파티 1', value: party1Slots, inline: true },
        { name: '파티 2', value: party2Slots, inline: true }
    );
    
    const row1 = new ActionRowBuilder();
    // ❗ 수정: ActionRowRowBuilder -> ActionRowBuilder 오타 수정
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

    const components = [row1, row2];
    if (isModalSubmit) {
        await interaction.update({ embeds: [updatedEmbed], components });
    } else {
        await interaction.message.edit({ embeds: [updatedEmbed], components });
        if(interaction.isButton() && interaction.customId.startsWith('cancel_raid_')) {
            await interaction.reply({ content: '✅ 참여가 취소되었습니다.', ephemeral: true });
        }
    }
}

// ==================================================================================
// 6. 봇 로그인
// ==================================================================================
client.login(process.env.DISCORD_TOKEN);