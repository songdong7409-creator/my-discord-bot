// 필요한 라이브러리들을 불러옵니다.
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, Collection } = require('discord.js');
const { google } = require('googleapis');
const express = require('express');
require('dotenv').config();

// ==================================================================================
// 1. Render.com 포트 바인딩을 위한 웹서버 코드 (가장 먼저 실행)
// ==================================================================================
const app = express();
const port = process.env.PORT || 10000; // Render는 10000번 포트를 선호합니다.

app.get('/', (req, res) => {
  res.send('OK. 아도봇이 활성화 상태입니다.');
});

app.listen(port, () => {
  console.log(`웹서버가 ${port} 포트에서 실행 중입니다.`);
});


// ==================================================================================
// 2. 디스코드 봇 설정 및 코드
// ==================================================================================

// ------------------- ▼▼▼ 본인의 정보로 수정해주세요 ▼▼▼ -------------------
// 1. 구글 시트 ID (시트 URL에서 .../d/여기가ID/... 부분)
const SPREADSHEET_ID = '13bli8gZlcrBuLxicxefjyaTGuq1POYGfiQLt6j7-O1I';
// 2. 디스코드 봇 클라이언트 ID (개발자 포털 General Information -> APPLICATION ID)
const CLIENT_ID = '1427502996962541621';
// 3. 테스트할 디스코드 서버 ID (서버 아이콘 우클릭 -> 서버 ID 복사)
const GUILD_ID = '1347088029294133259';
// ------------------- ▲▲▲ 여기까지 수정해주세요 ▲▲▲ -------------------

// 디스코드 클라이언트(봇)를 생성합니다.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 봇이 사용할 명령어들을 정의합니다.
const commands = [
    new SlashCommandBuilder()
        .setName('지옥왼오')
        .setDescription('지옥 열쇠 등급에 따라 왼쪽/오른쪽 경로를 추천해줍니다.')
        .addStringOption(option =>
            option.setName('열쇠등급')
                .setDescription('가지고 있는 열쇠의 등급을 선택하세요.')
                .setRequired(true)
                .addChoices(
                    { name: '희귀', value: '희귀' },
                    { name: '영웅', value: '영웅' },
                    { name: '전설', value: '전설' }
                )),
    new SlashCommandBuilder()
        .setName('지옥보상')
        .setDescription('지옥 클리어 후 보상 정보를 알려줍니다.')
        .addStringOption(option =>
            option.setName('아이템레벨')
                .setDescription('캐릭터의 아이템 레벨 구간을 선택하세요.')
                .setRequired(true)
                .addChoices(
                    { name: '1640 ~ 1699', value: '1640' },
                    { name: '1700 ~ 1729', value: '1700' },
                    { name: '1730 이상', value: '1730' }
                ))
        .addIntegerOption(option =>
            option.setName('층수')
                .setDescription('도달한 층수를 입력하세요. (예: 85)')
                .setRequired(true)
        )
].map(command => command.toJSON());

// 디스코드 API에 위에서 정의한 명령어들을 등록합니다.
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('(/) 슬래시 명령어 등록을 시작합니다.');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('(/) 슬래시 명령어 등록이 완료되었습니다.');
    } catch (error) {
        console.error('슬래시 명령어 등록 중 오류:', error);
    }
})();

// 봇이 준비되었을 때 한 번 실행되는 이벤트입니다.
client.on('ready', () => { // ★ 참고: clientReady 이벤트는 discord.js v14부터 'ready'로 변경되었습니다.
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

// 사용자가 슬래시(/) 명령어를 사용했을 때 실행되는 이벤트입니다.
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    // '/지옥왼오' 명령어 처리
    if (commandName === '지옥왼오') {
        const keyGrade = interaction.options.getString('열쇠등급');
        let attempts = 0;
        if (keyGrade === '희귀') attempts = 5;
        else if (keyGrade === '영웅') attempts = 6;
        else if (keyGrade === '전설') attempts = 7;

        let result = '';
        for (let i = 0; i < attempts; i++) {
            const choice = Math.random() < 0.5 ? '⬅️ 왼쪽' : '➡️ 오른쪽';
            result += `${i + 1}. -> ${choice}\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`[${keyGrade} 열쇠] 경로 추천`)
            .setDescription(result)
            .setTimestamp()
            .setFooter({ text: '선택은 모험가님의 몫!' });

        await interaction.reply({ embeds: [embed] });
    }

    // '/지옥보상' 명령어 처리
    if (commandName === '지옥보상') {
        await interaction.deferReply();

        const itemLevel = interaction.options.getString('아이템레벨');
        const floor = interaction.options.getInteger('층수');
        const stage = Math.floor(floor / 10);

        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: 'credentials.json',
                scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
            });
            const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${itemLevel}!A:Z`,
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                await interaction.editReply(`'${itemLevel}' 시트에서 데이터를 찾을 수 없습니다. 시트 탭 이름을 확인해주세요.`);
                return;
            }

            const header = rows[0];
            const dataRow = rows.slice(1).find(row => parseInt(row[1]) === stage);

            if (!dataRow) {
                await interaction.editReply(`[${itemLevel} 레벨] [${stage}단계]에 대한 보상 정보를 시트에서 찾을 수 없습니다.`);
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`[${itemLevel} 레벨] [${stage}단계] 기본 보상 정보`)
                .setDescription(`도달한 ${floor}층(${stage}단계)에서 획득하는 기본 보상 목록입니다.`)
                .setTimestamp();

            let rewardString = '';
            header.forEach((colName, index) => {
                if (index > 1 && dataRow[index] && dataRow[index].trim() !== '') {
                    rewardString += `**${colName}**: ${dataRow[index]}\n`;
                }
            });

            embed.addFields({ 
                name: '🎁 획득 아이템 목록', 
                value: rewardString || '표시할 정보가 없습니다.'
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            if (err.message && err.message.includes('Unable to parse range')) {
                await interaction.editReply(`오류: '${itemLevel}' 이라는 이름의 시트 탭을 찾을 수 없습니다. 시트 탭 이름을 확인해주세요!`);
            } else {
                console.error('구글 시트 API 또는 명령어 처리 오류:', err);
                await interaction.editReply('보상 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        }
    }
});

// .env 파일에 저장된 봇 토큰으로 디스코드에 로그인합니다.
client.login(process.env.DISCORD_TOKEN);