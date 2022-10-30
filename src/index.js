const TelegramBot = require('node-telegram-bot-api')
const Token = '5684585962:AAF5FyilWSgcYgGyGGy2mOGtQCzvnS1b48g'
const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const dbpath = path.resolve(__dirname, './model/users.db')
const db = new sqlite3.Database(dbpath)
const {read, write} = require('./utils/FS')
const {texts} = require('./model/text')
const {channels} = require('./model/channel')

// db.serialize(() => {
//     db.run("CREATE TABLE users (id INTEGER NOT NULL, phone INTEGER NOT NULL, username TEXT, balance INTEGER, cash_money INTEGER)");
//     db.run(`CREATE TABLE invited_users (id INTEGER NOT NULL, ref_user_id INTEGER NOT NULL)`)
// // //     // db.run("CREATE TABLE keyboards (text TEXT NOT NULL)");
//         // db.run("DROP TABLE users")
// });

// db.close();


const bot = new TelegramBot(Token, {
    polling: true
})

bot.on("polling_error", (msg) => console.log(msg))

const botUserName = 'Gold_Pay_Bot'
const adminId = 238830786
let chatStep = []
let adminChatStep = []
const usersChannelId = -1001698134739
const paymentChannelId = -1001636276579
let sender


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text


    const refId = text.split(' ')[1]

    const user = chatStep.find(item => item.chatId === chatId)

    if(refId) {
        user.ref_user_id = refId
    }


    db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
        if (err) {
            console.log(err)
        } else {
            if (!row) {
                return login(chatId)
            }
            auth(chatId)
        }
    })
})



function login(id) {
    bot.sendMessage(id, texts.login,  {
        reply_markup: {
            keyboard: [
                [
                    {
                        text: '📞 Telefon raqamini ulashish',
                        request_contact: true
                    }
                ]
            ],
            resize_keyboard: true,
        }
    })
}


function auth(id) {
    let followedChannel = []
    let unFollowedChannel = []

    const user = chatStep.find(item => item.chatId === id)

    for(let i = 0; i < channels.length; i++) {
        bot.getChatMember(`@${channels[i].url}`, id).then(data => {
            if(data.status === "member" || data.status === "creator") {
                return followedChannel.push(channels[i])
            }
            unFollowedChannel.push(channels[i])
        }).catch(err => {
            unFollowedChannel.push(channels[i])
        })
    }
    
    setTimeout(() => {
        if(followedChannel.length == channels.length) {
            if(user.ref_user_id) {
                db.get(`SELECT * FROM users WHERE id = "${id}"`, (err, row) => {
                    if(err) {
                        return console.log(err)
                    }
                    if(row) {
                        return
                    }
                })
                db.get(`SELECT * FROM invited_users WHERE id = "${id}"`, (err, row) => {
                    if (err) {
                        console.log(err)
                    } else {
                        if (!row) {
                            if(id !== user.ref_user_id) {
                                db.run(`INSERT INTO invited_users (id, ref_user_id) VALUES (?, ?)`, id, user.ref_user_id,)
                                db.get(`SELECT * FROM users WHERE id = "${user.ref_user_id}"`, (err, row) => {
                                    if (err) {
                                        return console.log(err)
                                    }
                                    let data = [row.balance ? row.balance + texts.money : texts.money, user.ref_user_id]
                                    db.run(`UPDATE users SET balance = ? WHERE id = ?`, data, function(err) {
                                        if (err) {
                                            return console.error(err.message);
                                        }
                                    })
                                })
                            }
                        }
                    }
                })
            }
            return menu(id)
        } 
        if(unFollowedChannel.length > 0) {
            const keyboard = []
            for(let i = 0; i < unFollowedChannel.length; i++) {
                let arr = []
                arr.push({ text: `❌ ${unFollowedChannel[i].text}`, url: `https://t.me/${unFollowedChannel[i].url}`})
                keyboard.push(arr.filter(e => e))
            }
            keyboard.push([{text: '🔄 Tekshirish', callback_data: 'auth'}])

            bot.sendMessage(id, texts.follow, {
                reply_markup: JSON.stringify({
                    inline_keyboard: keyboard
                })
            })
        }
        followedChannel = []
        unFollowedChannel = []
    }, 500)
}

function menu(id) {
    let keyboard = []
    db.each("SELECT text FROM keyboards", (err, row) => {
        keyboard.push(row.text)
    });
    setTimeout(() => {
        let allKeys = []
        for(let i = 0; i < keyboard.length; i += 2) {
            let arr = []
            arr.push({ text: keyboard[i] }, keyboard[i + 1] ? { text: keyboard[i + 1] } : null)
            allKeys.push(arr.filter(e => e))
        }
        if(id === adminId) {
            allKeys.unshift([{ text: '🤖 Admin panel'}])
        }
        bot.sendMessage(id, texts.menu, {
            reply_markup: {
                keyboard: allKeys,
                resize_keyboard: true
            }
        })
    }, 300)
}

bot.on('contact', (msg) => {
    const chatId = msg.chat.id
    const username = msg.chat.username
    const phoneNumber = msg.contact.phone_number


    bot.sendMessage(usersChannelId, `✅ Yangi foydalanuvchi \n\n${msg.chat.first_name} \n\nID: ${chatId} \nTel: ${phoneNumber} ${username ? `\n@` + username : ''}`)
    db.run(`INSERT INTO users (id, phone, username) VALUES (?, ?, ?)`, chatId, phoneNumber, username)
    bot.sendMessage(msg.chat.id, texts.sign, {
        reply_markup: {
            remove_keyboard: true
        }
    })
    auth(chatId)
})

bot.on('callback_query', query => {
    const chatId = query.message.chat.id
    const messageId = query.message.message_id
    const data = query.data

    const user = chatStep.find(item => item.chatId === chatId)

    if (data === 'auth') {
        auth(chatId)
        bot.deleteMessage(chatId, messageId)
    }

    if (data === 'card') {
        db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
            if (err) {
                console.log(err)
            } else {
                if (row) {
                    if(row.balance < texts.minimalMoney) {
                        bot.sendMessage(chatId, `<b>💵 Hisobingiz:</b> ${row.balance || 0} so'm \n<b>💳 Minimal pul yechish miqdori: </b>${texts.minimalMoney} so'm`, {
                            parse_mode: 'HTML'
                        })
                    } else {
                        user.cashMoneyCard = 1
                        bot.sendMessage(chatId, `💵 Balansingiz: ${row.balance || 0} \nYechib olmoqchi bo'lgan summani kiriting`, {
                            reply_markup: {
                                keyboard: [
                                    ['❌ Bekor qilish']
                                ]
                            }
                        })
                    }
                }
            }
        })
        bot.deleteMessage(chatId, messageId)
    }
    if (data === 'number') {
        db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
            if (err) {
                console.log(err)
            } else {
                if (row) {
                    if(row.balance < texts.minimalMoney) {
                        bot.sendMessage(chatId, `<b>💵 Hisobingiz:</b> ${row.balance || 0} so'm \n<b>💳 Minimal pul yechish miqdori: </b>${texts.minimalMoney} so'm`, {
                            parse_mode: 'HTML'
                        })
                    } else {
                        user.cashMoneyNumber = 1
                        bot.sendMessage(chatId, `💵 Balansingiz: ${row.balance || 0} \nYechib olmoqchi bo'lgan summani kiriting`, {
                            reply_markup: {
                                keyboard: [
                                    ['❌ Bekor qilish']
                                ]
                            }
                        })
                    }
                }
            }
        })
        bot.deleteMessage(chatId, messageId)
    }
    if (data === 'earn-money') {
        bot.sendMessage(chatId, `✅ Botda pul ishlash juda oson, pul ishlash tugmasini bosing. Sizga berilgan unikal-havolani doʻstlaringizga yuboring. Doʻstingiz siz tarqatgan havola orqali botga kirib, bot bergan kanallarga a'zo bo‘lsa, biz sizning bot hisobingizga 🎁 ${texts.money} soʻm qoʻshiladi ✅`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `◀️ Orqaga`,
                            callback_data: 'back'
                        }
                    ]
                ],
            }
        })
        bot.deleteMessage(chatId, messageId)
    }
    if (data === 'bonus') {
        bot.sendMessage(chatId, `🎉 Siz BOS66 promokodi orqali 1xBet ilovasidan 🎁 3 million 🎁 soʻmgacha bonus olishingiz mumkin✅ 
        \n🎁Batafsil: ${texts.bonus} 👈\n🎁Batafsil: ${texts.bonus} 👈\n🎁Batafsil: ${texts.bonus} 👈`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `◀️ Orqaga`,
                            callback_data: 'back'
                        }
                    ]
                ],
            }
        })
        bot.deleteMessage(chatId, messageId)
    }
    if (data === 'back') {
        bot.deleteMessage(chatId, messageId)
        bot.sendMessage(chatId, `<b>📚 Quyidagilardan birini tanlang:</b>`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `❓ Botda pul ishlash`,
                            callback_data: 'earn-money'
                        },
                        {
                            text: `🎁 Bonus ✅`,
                            callback_data: 'bonus'
                        }
                    ]
                ],
                resize_keyboard: true,
            }
        })
    }
    if (data === 'users') {
        db.get(`SELECT COUNT(*) FROM users`, (err, row) => {
            if (err) {
                return console.log(err)
            } 
            if(row) {
                bot.sendMessage(chatId, `Bot foydalanuvchilari ${row['COUNT(*)']} ta`)
            }
        })
    }
    const admin = adminChatStep.find(item => item.chatId === chatId)
    if (data === 'edit-money') {
        admin.step = 1
        bot.sendMessage(chatId, `Summani kiriting...`, {
            reply_markup: {
                keyboard: [
                    ['🔙 Orqaga']
                ]
            }
        })
    }
    if (data === 'edit-minimal-money') {
        admin.step = 2
        bot.sendMessage(chatId, `Minimal ummani kiriting...`, {
            reply_markup: {
                keyboard: [
                    ['🔙 Orqaga']
                ]
            }
        })
    }
    if (data === 'send-answer') {
        sender = chatStep.find(user => user.sendAnswer === 1) 
        sender.sendAnswer = 2
        bot.sendMessage(chatId, `Xabarni kiriting...`, {
            reply_markup: {
                keyboard: [
                    ['🔙 Orqaga']
                ]
            }
        })
    }
})



bot.on('message', msg => {
    const chatId = msg.chat.id
    const text = msg.text

    chatStep.push({
        chatId
    })
    
    if(chatId === adminId) {
        adminChatStep.push({
            chatId
        })
    }
    
    const userStep = chatStep.find(item => item.chatId === chatId)
    const admin = adminChatStep.find(item => item.chatId === chatId)

    if (text === '💰 Pul ishlash') {
        return bot.sendMessage(chatId, `🔗 Sizning taklif havolangiz: \nhttps://t.me/${botUserName}?start=${chatId}
        \nYuqoridagi taklif havolangizni do'stlaringizga tarqating va har bir to'liq ro'yxatdan o'tgan taklifingiz uchun ${texts.money} so'm hisobingizga qo'shiladi.`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '↗️ Ulashish',
                            url: `https://t.me/share/url?url=https://t.me/${botUserName}?start=${chatId}`,
                        }
                    ]
                ],
                
            }
        })
        
    }
    if (text === '💵 Balans') {
        let invited_count = 0
        db.get(`SELECT COUNT(*) FROM invited_users WHERE ref_user_id = "${chatId}"`, (err, row) => {
            if (err) {
                return console.log(err)
            } 
            if(row) {
                invited_count = row['COUNT(*)']
            }
        })
        setTimeout(() => {
            db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
                if (err) {
                    console.log(err)
                } else {
                    if (row) {
                        bot.sendMessage(chatId, `<b>💵 Hisobingiz:</b> ${row.balance || 0} so'm \n\n<b>💸 Yechib olgan pullaringiz:</b> ${row.cash_money || 0}  so'm \n<b>👤 Takliflaringiz soni:</b> ${invited_count} ta`, {
                            parse_mode: 'HTML'
                        })
                    }
                }
            })
        }, 200)
        return
    }
    if (text === '💳 Pul yechish') {
        bot.sendMessage(chatId, `<b>Quyidagi to'lov tizimlaridan birini tanlang:</b>`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `💳 Kartaga`,
                            callback_data: 'card'
                        },
                        {
                            text: `📲 Raqamga`,
                            callback_data: 'number'
                        }
                    ]
                ]
            },
            parse_mode: 'HTML'
        })
        return
    }
    if (text === '📨 Yordam') {
        userStep.step = 1
        bot.sendMessage(chatId, '<b>Sizga qanday yordam bera olamiz?</b>', {
            reply_markup: {
                keyboard: [
                    ['◀️ Orqaga']
                ],
                resize_keyboard: true
            },
            parse_mode: 'HTML'
        })
        return
    }
    if (text !== '📨 Yordam' && text !== '◀️ Orqaga' && userStep.step === 1) {
        userStep.step = 0
        userStep.sendAnswer = 1
        bot.sendMessage(chatId, texts.help)
        bot.sendMessage(adminId, `Jo'natuvchi ${msg.chat.first_name} \n\nXabar: \n${text}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Javob yozish',
                            callback_data: 'send-answer'
                        }
                    ]
                ]
            }
        })
        return
    }
    if (text === '◀️ Orqaga') {
        userStep.step = 0
        menu(chatId)
        return
    }
    if (text === `📚 Qo'llanma`) {
        bot.sendMessage(chatId, `<b>📚 Quyidagilardan birini tanlang:</b>`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `❓ Botda pul ishlash`,
                            callback_data: 'earn-money'
                        },
                        {
                            text: `🎁 Bonus ✅`,
                            callback_data: 'bonus'
                        }
                    ]
                ],
                resize_keyboard: true,
            }
        })
        return
    } 

    if (text === '❌ Bekor qilish') {
        userStep.summa = 0
        userStep.cashMoneyCard = 0
        userStep.cashMoneyNumber = 0
        return menu(chatId)
    }

    if (text !== '❌ Bekor qilish' && userStep.cashMoneyCard === 1) {
        db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
            if (err) {
                console.log(err)
            } else {
                if (row) {
                    if (+text > row.balance) {
                        bot.sendMessage(chatId, `<b>❌ Balansingizda buncha pul mablag'i mavjud emas</b>`, {
                            parse_mode: 'HTML'
                        })
                    } else {
                        userStep.summa = +text
                        userStep.cashMoneyCard = 2
                        bot.sendMessage(chatId, `💳 Karta raqamingizni kiriting. Masalan: 8600 0000 1234 5678`, {
                            reply_markup: {
                                keyboard: [
                                    ['❌ Bekor qilish']
                                ]
                            }
                        })
                    }
                }
            }
        })
    }

    if (text !== '❌ Bekor qilish' && userStep.cashMoneyNumber === 1) {
        db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
            if (err) {
                console.log(err)
            } else {
                if (row) {
                    if (+text > row.balance) {
                        bot.sendMessage(chatId, `<b>❌ Balansingizda buncha pul mablag'i mavjud emas</b>`, {
                            parse_mode: 'HTML'
                        })
                    } else {
                        userStep.summa = +text
                        userStep.cashMoneyNumber = 2
                        bot.sendMessage(chatId, `📞 Telefon raqamingizni kiriting. Masalan: +998901234567`, {
                            reply_markup: {
                                keyboard: [
                                    ['❌ Bekor qilish']
                                ]
                            }
                        })
                    }
                }
            }
        })
    }

    if (text !== '❌ Bekor qilish' && userStep.cashMoneyCard === 2 && text !== userStep.summa) {
        if (text.split('').length !== 19) {
            return bot.sendMessage(chatId, `💳 Karta raqamini quyidagi formatda kiriting. Masalan: 8600 0000 1234 5678`)
        }
        db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
            if (err) {
                console.log(err)
            } else {
                if (row) {
                    let data = [row.balance - userStep.summa, row.cash_money ? row.cash_money + userStep.summa : userStep.summa, chatId]
                    db.run(`UPDATE users SET balance = ?, cash_money = ? WHERE id = ?`, data, function(err) {
                        if (err) {
                            return console.error(err);
                        }
                    })
                    userStep.summa = 0
                }
            }
        })
        userStep.cashMoneyCard = 0
        bot.sendMessage(chatId, `💰 Balansingizdan pul yechildi 2 soat ichida sizga pul tashlab beriladi`, {
            reply_markup: {
                remove_keyboard: true
            }
        })
        bot.sendMessage(paymentChannelId, `💳 Kartaga pul yechish \n\n${msg.chat.first_name} \nKarta raqami: ${text} \nSumma: ${userStep.summa}`)
        return menu(chatId)
    }

    if (text !== '❌ Bekor qilish' && userStep.cashMoneyNumber === 2 && text !== userStep.summa) {
        if (text.split('').length !== 13) {
            return bot.sendMessage(chatId, `📞 Telefon raqamingizni quyidagi formatda kiriting. Masalan: +998901234567`)
        }
        db.get(`SELECT * FROM users WHERE id = "${chatId}"`, (err, row) => {
            if (err) {
                console.log(err)
            } else {
                if (row) {
                    let data = [row.balance - userStep.summa, row.cash_money ? row.cash_money + userStep.summa : userStep.summa, chatId]
                    db.run(`UPDATE users SET balance = ?, cash_money = ? WHERE id = ?`, data, function(err) {
                        if (err) {
                            return console.error(err.message);
                        }
                    })
                    userStep.summa = 0
                }
            }
        })
        userStep.cashMoneyNumber = 0
        bot.sendMessage(chatId, `💰 Balansingizdan pul yechildi 2 soat ichida sizga pul tashlab beriladi`, {
            reply_markup: {
                remove_keyboard: true
            }
        })
        bot.sendMessage(paymentChannelId, `📞 Telefon raqamiga pul yechish \n\n${msg.chat.first_name} \nTelefon raqami: ${text} \nSumma: ${userStep.summa}`)
        return menu(chatId)
    }
    
    
    if (text === '🤖 Admin panel' && chatId === adminId) {
        bot.sendMessage(chatId, `<b>Quyidagilardan birini tanlang:</b>`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `Minimal summani o'zgartirish`,
                            callback_data: 'edit-minimal-money'
                        },
                        {
                            text: `Pulni o'zgartirish`,
                            callback_data: 'edit-money'
                        },
                    ],
                    [
                        {
                            text: `Bot foydalanuvchilari soni`,
                            callback_data: 'users'
                        }
                    ]
                ],
                resize_keyboard: true,
            }
        })
        return
    }

    if (text !== '🔙 Orqaga' && sender?.sendAnswer === 2) {
        bot.sendMessage(sender.chatId, text)
        bot.sendMessage(adminId, 'Xabar yuborildi')
        sender = {}
    }

    if (admin) {
        const jsonText = read(path.resolve(__dirname, '/text/texts.json'))
        const oldText = jsonText[0]
        if (text === '🔙 Orqaga') {
            return menu(chatId)
        }
        if (text !== '🔙 Orqaga' && admin.step === 1) {
            const money = [
                {
                    login: oldText.login,
                    restart: oldText.restart,
                    follow: oldText.follow,
                    sign: oldText.sign,
                    menu: oldText.menu,
                    pay: oldText.pay,
                    ref: oldText.ref,
                    money: +text,
                    minimalMoney: oldText.minimalMoney,
                    help: oldText.help,
                    bonus: oldText.bonus
                }
            ]

            write(path.resolve(__dirname, '/text/texts.json'), money)
            admin.step = 0
            bot.sendMessage(chatId, `Summa ${text} so'mga o'zgartirildi`)
            return
        }
        if (text !== '🔙 Orqaga' && admin.step === 2) {
            const money = [
                {
                    login: oldText.login,
                    restart: oldText.restart,
                    follow: oldText.follow,
                    sign: oldText.sign,
                    menu: oldText.menu,
                    pay: oldText.pay,
                    ref: oldText.ref,
                    money: oldText.money,
                    minimalMoney: +text,
                    help: oldText.help,
                    bonus: oldText.bonus
                }
            ]

            write(path.resolve(__dirname, '/text/texts.json'), money)
            admin.step = 0
            bot.sendMessage(chatId, `Minimsl summa ${text} so'mga o'zgartirildi`)
            return
        }
    }
})