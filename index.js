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
    
    // ❗ 수정: 생략되었던 /지옥왼오 명령어 정의를 복원했습니다.
    new SlashCommandBuilder()
        .setName('지옥왼오')
        .setDescription('지옥 열쇠 등급에 따라 왼쪽/오른쪽 경로를 추천해줍니다.')
        .addStringOption(option =>
            option.setName('열쇠등급').setDescription('등급을 선택하세요.').setRequired(true)
                .addChoices({ name: '희귀', value: '희귀' }, { name: '영웅', value: '영웅' }, { name: '전설', value: '전설' })),

    // ❗ 수정: 생략되었던 /지옥보상 명령어 정의를 복원했습니다.
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
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('(/) 슬래시 명령어 등록이 완료되었습니다.');
    } catch (error) {
        console.error('슬래시 명령어 등록 중 오류:', error);
    }
})();

// ==================================================================================
// 4. 이벤트 핸들러 (이하 코드는 이전 버전과 거의 동일)
// ==================================================================================
// (이전 답변에서 제공한 이벤트 핸들러, 헬퍼 함수, 봇 로그인 코드가 여기에 들어갑니다.)
// ... client.once(Events.ClientReady, ... )
// ... client.on(Events.InteractionCreate, ... )
// ... async function updateRaidMessage(...)
// ... client.login(...)