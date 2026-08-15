/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    PHONENUMBER_MCC,
    Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const NodeCache = require('node-cache')
const caseHandler = require('./case')

// Configuration
const CONFIG = {
    sessionName: 'applendii-session',
    prefix: ['.', '#', '!', '/'],
    ownerNumber: ['6285800650661'], // Ganti dengan nomor owner
    botName: 'Apple-NDIIBot',
    version: '1.0.0',
    maxFileSize: 100 * 1024 * 1024, // 100MB
}

// Database Manager
class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'db')
        this.cache = new NodeCache({ stdTTL: 300 }) // Cache 5 menit
        this.ensureDatabase()
    }

    ensureDatabase() {
        const files = ['owner.json', 'users.json', 'partner.json', 'reminder.json']
        files.forEach(file => {
            const filePath = path.join(this.dbPath, file)
            if (!fs.existsSync(filePath)) {
                const initialData = this.getInitialData(file)
                fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2))
            }
        })
    }

    getInitialData(filename) {
        switch(filename) {
            case 'owner.json':
                return {
                    mainOwner: CONFIG.ownerNumber,
                    additionalOwners: [],
                    botNumber: '',
                    config: {
                        autoread: true,
                        autotyping: false,
                        autobio: true,
                        prefix: CONFIG.prefix
                    }
                }
            case 'users.json':
                return {}
            case 'partner.json':
                return {}
            case 'reminder.json':
                return []
            default:
                return {}
        }
    }

    load(filename) {
        const cacheKey = `db_${filename}`
        const cached = this.cache.get(cacheKey)
        if (cached) return cached

        try {
            const data = JSON.parse(fs.readFileSync(path.join(this.dbPath, filename), 'utf8'))
            this.cache.set(cacheKey, data)
            return data
        } catch (error) {
            console.error(`Error loading ${filename}:`, error)
            return this.getInitialData(filename)
        }
    }

    save(filename, data) {
        const cacheKey = `db_${filename}`
        this.cache.set(cacheKey, data)
        fs.writeFileSync(path.join(this.dbPath, filename), JSON.stringify(data, null, 2))
    }

    // User Management
    getUser(jid) {
        const users = this.load('users.json')
        const cleanJid = this.cleanJid(jid)
        return users[cleanJid] || null
    }

    saveUser(jid, userData) {
        const users = this.load('users.json')
        const cleanJid = this.cleanJid(jid)
        users[cleanJid] = userData
        this.save('users.json', users)
    }

    addUserIfNotExists(jid, name = '') {
        const cleanJid = this.cleanJid(jid)
        const user = this.getUser(cleanJid)
        
        if (!user) {
            const newUser = {
                jid: cleanJid,
                name: name,
                premium: false,
                limit: 20,
                balance: 0,
                commandUsed: 0,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                stats: {
                    totalCommands: 0,
                    totalPremiumCommands: 0,
                    totalOwnerCommands: 0
                }
            }
            this.saveUser(cleanJid, newUser)
            return newUser
        }
        
        return user
    }

    updateUser(jid, updates) {
        const cleanJid = this.cleanJid(jid)
        const user = this.getUser(cleanJid)
        if (user) {
            const updatedUser = { ...user, ...updates, lastSeen: new Date().toISOString() }
            this.saveUser(cleanJid, updatedUser)
            return updatedUser
        }
        return null
    }

    // Reminder Management
    addReminder(reminder) {
        const reminders = this.load('reminder.json')
        const newReminder = {
            id: Date.now().toString(),
            user: reminder.user,
            message: reminder.message,
            executeAt: reminder.executeAt,
            status: 'pending',
            repeat: reminder.repeat || false,
            created_at: new Date().toISOString()
        }
        reminders.push(newReminder)
        this.save('reminder.json', reminders)
        return newReminder
    }

    getPendingReminders() {
        const reminders = this.load('reminder.json')
        const now = new Date().getTime()
        return reminders.filter(r => r.status === 'pending' && new Date(r.executeAt).getTime() <= now)
    }

    updateReminderStatus(id, status) {
        const reminders = this.load('reminder.json')
        const reminder = reminders.find(r => r.id === id)
        if (reminder) {
            reminder.status = status
            if (reminder.repeat && status === 'executed') {
                // Reset for repeat
                const executeAt = new Date(reminder.executeAt)
                executeAt.setDate(executeAt.getDate() + 1)
                reminder.executeAt = executeAt.toISOString()
                reminder.status = 'pending'
            }
            this.save('reminder.json', reminders)
            return reminder
        }
        return null
    }

    cleanJid(jid) {
        return jid.replace(/:\d+@/, '@') // Remove device ID for multi-device
    }

    getDatabaseStats() {
        const users = this.load('users.json')
        const partners = this.load('partner.json')
        const reminders = this.load('reminder.json')
        
        return {
            totalUsers: Object.keys(users).length,
            totalPartners: Object.keys(partners).length,
            totalReminders: reminders.length,
            totalPremium: Object.values(users).filter(u => u.premium).length,
            databaseSize: this.getDirectorySize(this.dbPath)
        }
    }

    getDirectorySize(dirPath) {
        let size = 0
        const files = fs.readdirSync(dirPath)
        files.forEach(file => {
            const filePath = path.join(dirPath, file)
            const stats = fs.statSync(filePath)
            if (stats.isFile()) {
                size += stats.size
            }
        })
        return size
    }
}

// WhatsApp Connection Manager
class WhatsAppBot {
    constructor() {
        this.db = new DatabaseManager()
        this.sock = null
        this.pairingCode = null
        this.isConnected = false
        this.startTime = Date.now()
        this.messageCount = 0
        this.commandCount = 0
    }

    async start() {
        console.log('=================================')
        console.log('     APPLE-NDIIBOT STARTING')
        console.log('=================================')
        console.log(`Bot Name: ${CONFIG.botName}`)
        console.log(`Version: ${CONFIG.version}`)
        console.log(`Owner: ${CONFIG.ownerNumber}`)
        console.log('=================================')
        
        await this.connectToWhatsApp()
        this.startReminderEngine()
    }

    async connectToWhatsApp() {
        const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionName)
        const { version, isLatest } = await fetchLatestBaileysVersion()
        
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`)

        this.sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                // Implement message retrieval if needed
                return { conversation: '' }
            }
        })

        this.sock.ev.on('creds.update', saveCreds)

        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                console.log('QR Code received (but using pairing code)')
            }

            if (connection === 'open') {
                this.isConnected = true
                console.log('✅ Connected to WhatsApp')
                
                // Update bot number in owner database
                const ownerData = this.db.load('owner.json')
                ownerData.botNumber = this.sock.user.id.split(':')[0] + '@s.whatsapp.net'
                this.db.save('owner.json', ownerData)
                
                console.log(`Bot Number: ${ownerData.botNumber}`)
                this.sendStartupMessage()
            }

            if (connection === 'close') {
                this.isConnected = false
                const statusCode = lastDisconnect?.error?.output?.statusCode
                console.log('Connection closed with status:', statusCode)
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('❌ Logged out. Need to re-pair.')
                    this.requestPairingCode()
                } else if (statusCode === DisconnectReason.badSession) {
                    console.log('❌ Bad session. Re-pairing needed.')
                    this.requestPairingCode()
                } else {
                    console.log('🔄 Reconnecting...')
                    setTimeout(() => this.connectToWhatsApp(), 5000)
                }
            }
        })

        this.sock.ev.on('messages.upsert', async (m) => {
            await this.handleMessages(m)
        })

        // Handle pairing if not registered
        if (!this.sock.authState.creds.registered) {
            this.requestPairingCode()
        }
    }

    async requestPairingCode() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        rl.question('Masukkan nomor WhatsApp (contoh: 6281234567890): ', async (phoneNumber) => {
            rl.close()
            
            try {
                const formattedNumber = phoneNumber.replace(/[^0-9]/g, '')
                if (!formattedNumber) {
                    console.log('❌ Nomor tidak valid')
                    this.requestPairingCode()
                    return
                }

                const pairingCode = await this.sock.requestPairingCode(formattedNumber)
                console.log('\n=================================')
                console.log('PAIRING CODE GENERATED')
                console.log('=================================')
                console.log(`Code: ${pairingCode}`)
                console.log('=================================')
                console.log('Langkah pairing:')
                console.log('1. Buka WhatsApp di HP')
                console.log('2. Klik menu (⋮) > Linked devices')
                console.log('3. Klik "Link a device"')
                console.log('4. Masukkan code di atas')
                console.log('=================================\n')
            } catch (error) {
                console.error('❌ Error generating pairing code:', error)
                this.requestPairingCode()
            }
        })
    }

    async handleMessages(messages) {
        if (!messages.messages) return
        
        for (const message of messages.messages) {
            if (!message.message) continue
            if (message.key.fromMe) continue
            
            const msgType = this.getMessageType(message.message)
            const content = this.getMessageContent(message.message, msgType)
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            const isGroup = from.endsWith('@g.us')
            const pushName = message.pushName || 'Unknown'
            
            this.messageCount++
            
            // Add user to database if not exists
            this.db.addUserIfNotExists(sender, pushName)
            
            // Parse command
            const prefix = this.detectPrefix(content)
            if (prefix) {
                const commandText = content.slice(prefix.length).trim()
                if (commandText) {
                    const [command, ...args] = commandText.split(' ')
                    this.commandCount++
                    
                    // Update user command count
                    const user = this.db.getUser(sender)
                    if (user) {
                        this.db.updateUser(sender, {
                            commandUsed: user.commandUsed + 1,
                            stats: {
                                ...user.stats,
                                totalCommands: user.stats.totalCommands + 1
                            }
                        })
                    }
                    
                    // Execute command
                    await this.executeCommand(command.toLowerCase(), args, {
                        sock: this.sock,
                        from,
                        sender,
                        isGroup,
                        pushName,
                        msgType,
                        content,
                        message,
                        db: this.db,
                        config: CONFIG
                    })
                }
            }
            
            // Auto read if enabled
            const ownerData = this.db.load('owner.json')
            if (ownerData.config.autoread) {
                await this.sock.readMessages([message.key])
            }
        }
    }

    detectPrefix(content) {
        if (!content) return null
        for (const prefix of CONFIG.prefix) {
            if (content.startsWith(prefix)) {
                return prefix
            }
        }
        return null
    }

    getMessageType(message) {
        if (message.conversation) return 'conversation'
        if (message.extendedTextMessage) return 'extendedText'
        if (message.imageMessage) return 'image'
        if (message.videoMessage) return 'video'
        if (message.audioMessage) return 'audio'
        if (message.stickerMessage) return 'sticker'
        if (message.documentMessage) return 'document'
        if (message.contactMessage) return 'contact'
        if (message.locationMessage) return 'location'
        if (message.buttonsResponseMessage) return 'buttonsResponse'
        if (message.templateButtonReplyMessage) return 'templateButtonReply'
        if (message.listResponseMessage) return 'listResponse'
        return 'unknown'
    }

    getMessageContent(message, type) {
        switch(type) {
            case 'conversation':
                return message.conversation
            case 'extendedText':
                return message.extendedTextMessage.text
            case 'image':
                return message.imageMessage.caption || ''
            case 'video':
                return message.videoMessage.caption || ''
            default:
                return ''
        }
    }

    async executeCommand(command, args, context) {
        try {
            const handler = caseHandler[command]
            if (handler) {
                await handler(context, args)
            } else {
                // Unknown command
                if (context.config.autoReplyUnknown) {
                    await this.sock.sendMessage(context.from, {
                        text: `❌ Command tidak ditemukan: ${command}\nKetik .menu untuk daftar command`
                    })
                }
            }
        } catch (error) {
            console.error(`Error executing command ${command}:`, error)
            await this.sock.sendMessage(context.from, {
                text: `❌ Terjadi kesalahan saat menjalankan command ${command}`
            })
        }
    }

    async sendStartupMessage() {
        const ownerData = this.db.load('owner.json')
        const mainOwnerJid = this.formatJid(ownerData.mainOwner[0])
        
        if (mainOwnerJid) {
            const uptime = this.getUptime()
            const stats = this.db.getDatabaseStats()
            
            const startupMessage = `🤖 *${CONFIG.botName} Connected*\n\n` +
                `⏰ Time: ${new Date().toLocaleString('id-ID')}\n` +
                `📊 Stats:\n` +
                `  - Users: ${stats.totalUsers}\n` +
                `  - Commands: ${this.commandCount}\n` +
                `  - Uptime: ${uptime}\n\n` +
                `Bot siap digunakan!`
            
            await this.sock.sendMessage(mainOwnerJid, { text: startupMessage })
        }
    }

    async startReminderEngine() {
        setInterval(async () => {
            try {
                const pendingReminders = this.db.getPendingReminders()
                
                for (const reminder of pendingReminders) {
                    const jid = this.formatJid(reminder.user)
                    if (jid) {
                        await this.sock.sendMessage(jid, {
                            text: `⏰ *REMINDER*\n\n${reminder.message}\n\nWaktu: ${new Date(reminder.executeAt).toLocaleString('id-ID')}`
                        })
                        
                        this.db.updateReminderStatus(reminder.id, 'executed')
                        console.log(`Reminder executed for user: ${reminder.user}`)
                    }
                }
            } catch (error) {
                console.error('Error in reminder engine:', error)
            }
        }, 10000) // Check every 10 seconds
    }

    formatJid(number) {
        if (number.includes('@s.whatsapp.net')) return number
        const cleanNumber = number.replace(/[^0-9]/g, '')
        return `${cleanNumber}@s.whatsapp.net`
    }

    getUptime() {
        const uptimeMs = Date.now() - this.startTime
        const hours = Math.floor(uptimeMs / 3600000)
        const minutes = Math.floor((uptimeMs % 3600000) / 60000)
        const seconds = Math.floor((uptimeMs % 60000) / 1000)
        return `${hours}h ${minutes}m ${seconds}s`
    }
}

// Start bot
const bot = new WhatsAppBot()
bot.start().catch(error => {
    console.error('Fatal error starting bot:', error)
    process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...')
    process.exit(0)
})

module.exports = WhatsAppBot
