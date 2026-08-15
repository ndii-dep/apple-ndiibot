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
    Browsers,
    makeInMemoryStore
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const NodeCache = require('node-cache')
const os = require('os')
const axios = require('axios')

// ==================== CONFIGURATION ====================
const CONFIG = {
    sessionName: 'apple-ndii-session',
    prefix: ['.', '/'],
    ownerNumber: ['6285800650661'],
    botName: 'Apple-NDIIBot',
    version: '1.0.0',
    maxFileSize: 100 * 1024 * 1024,
    autoRead: true,
    autoTyping: false,
    autoRecording: false,
    autoOnline: true,
    autoReplyUnknown: true,
    reminderCheckInterval: 10000,
    reconnectDelay: 5000,
    maxReconnectAttempts: 10,
}

// ==================== DATABASE MANAGER ====================
class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'db')
        this.cache = new NodeCache({ stdTTL: 300 })
        this.ensureDatabase()
    }

    ensureDatabase() {
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true })
            console.log('📁 Created database directory')
        }

        const files = ['owner.json', 'users.json', 'partner.json', 'reminder.json']
        files.forEach(file => {
            const filePath = path.join(this.dbPath, file)
            if (!fs.existsSync(filePath)) {
                const initialData = this.getInitialData(file)
                fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2))
                console.log(`📄 Created ${file}`)
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
                        autoread: CONFIG.autoRead,
                        autotyping: CONFIG.autoTyping,
                        autorecording: CONFIG.autoRecording,
                        prefix: CONFIG.prefix,
                        autoReplyUnknown: CONFIG.autoReplyUnknown
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
        try {
            fs.writeFileSync(path.join(this.dbPath, filename), JSON.stringify(data, null, 2))
            return true
        } catch (error) {
            console.error(`Error saving ${filename}:`, error)
            return false
        }
    }

    cleanJid(jid) {
        return jid.replace(/:\d+@/, '@')
    }

    formatJid(number) {
        if (number.includes('@s.whatsapp.net')) return number
        const cleanNumber = number.replace(/[^0-9]/g, '')
        return `${cleanNumber}@s.whatsapp.net`
    }

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
                seller: false,
                partner: false,
                limit: 20,
                balance: 0,
                commandUsed: 0,
                totalTransactions: 0,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                afk: {
                    status: false,
                    reason: '',
                    timestamp: null
                },
                stats: {
                    totalCommands: 0,
                    totalPremiumCommands: 0,
                    totalOwnerCommands: 0,
                    totalGroupCommands: 0
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
            const updatedUser = { 
                ...user, 
                ...updates, 
                lastSeen: new Date().toISOString() 
            }
            this.saveUser(cleanJid, updatedUser)
            return updatedUser
        }
        return null
    }

    isOwner(jid) {
        const ownerData = this.load('owner.json')
        const cleanJid = this.cleanJid(jid)
        const senderNumber = cleanJid.split('@')[0]
        
        return ownerData.mainOwner.includes(senderNumber) || 
               ownerData.additionalOwners.includes(senderNumber)
    }

    addReminder(reminderData) {
        const reminders = this.load('reminder.json')
        const newReminder = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user: reminderData.user,
            message: reminderData.message,
            executeAt: reminderData.executeAt,
            status: 'pending',
            repeat: reminderData.repeat || false,
            repeatInterval: reminderData.repeatInterval || null,
            created_at: new Date().toISOString(),
            executed_at: null
        }
        reminders.push(newReminder)
        this.save('reminder.json', reminders)
        return newReminder
    }

    getPendingReminders() {
        const reminders = this.load('reminder.json')
        const now = new Date().getTime()
        return reminders.filter(r => 
            r.status === 'pending' && 
            new Date(r.executeAt).getTime() <= now
        )
    }

    updateReminderStatus(id, status) {
        const reminders = this.load('reminder.json')
        const reminder = reminders.find(r => r.id === id)
        
        if (reminder) {
            reminder.status = status
            reminder.executed_at = new Date().toISOString()
            
            if (reminder.repeat && status === 'executed') {
                const executeAt = new Date(reminder.executeAt)
                executeAt.setDate(executeAt.getDate() + 1)
                reminder.executeAt = executeAt.toISOString()
                reminder.status = 'pending'
                reminder.executed_at = null
            }
            
            this.save('reminder.json', reminders)
            return reminder
        }
        return null
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
            databaseSize: this.getDirectorySize(this.dbPath),
            lastUpdated: new Date().toISOString()
        }
    }

    getDirectorySize(dirPath) {
        let size = 0
        try {
            const files = fs.readdirSync(dirPath)
            files.forEach(file => {
                const filePath = path.join(dirPath, file)
                const stats = fs.statSync(filePath)
                if (stats.isFile()) {
                    size += stats.size
                }
            })
        } catch (error) {
            console.error('Error calculating directory size:', error)
        }
        return size
    }

    clearCache() {
        this.cache.flushAll()
        return true
    }
}

// ==================== PLUGIN MANAGER ====================
class PluginManager {
    constructor() {
        this.pluginsDir = path.join(__dirname, 'plugins')
        this.plugins = new Map()
        this.loadPlugins()
    }

    loadPlugins() {
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true })
            console.log('📁 Created plugins directory')
            return
        }

        const files = fs.readdirSync(this.pluginsDir)
        
        files.forEach(file => {
            if (file.endsWith('.js')) {
                try {
                    const pluginPath = path.join(this.pluginsDir, file)
                    delete require.cache[require.resolve(pluginPath)]
                    const plugin = require(pluginPath)
                    
                    if (plugin && plugin.name && plugin.commands) {
                        this.plugins.set(plugin.name, plugin)
                        console.log(`✅ Plugin loaded: ${plugin.name} (${plugin.commands.length} commands)`)
                    }
                } catch (error) {
                    console.error(`❌ Failed to load plugin ${file}:`, error.message)
                }
            }
        })
    }

    getPluginInfo() {
        const info = []
        this.plugins.forEach((plugin, name) => {
            info.push({
                name: name,
                commands: plugin.commands,
                description: plugin.description || 'No description',
                version: plugin.version || '1.0.0',
                author: plugin.author || 'Unknown'
            })
        })
        return info
    }

    getPluginCommands() {
        const commands = new Map()
        this.plugins.forEach((plugin) => {
            plugin.commands.forEach(cmd => {
                commands.set(cmd.command, {
                    handler: cmd.handler,
                    permission: cmd.permission || 0,
                    category: cmd.category || plugin.name,
                    description: cmd.description || 'No description'
                })
            })
        })
        return commands
    }

    executePluginCommand(command, context, args) {
        const pluginCommands = this.getPluginCommands()
        const cmd = pluginCommands.get(command)
        
        if (cmd) {
            return cmd.handler(context, args)
        }
        return null
    }
}

// ==================== WHATSAPP BOT ====================
class WhatsAppBot {
    constructor() {
        this.db = new DatabaseManager()
        this.pluginManager = new PluginManager()
        this.sock = null
        this.isConnected = false
        this.startTime = Date.now()
        this.messageCount = 0
        this.commandCount = 0
        this.reconnectAttempts = 0
        this.store = null
        this.reminderInterval = null
    }

    async start() {
        this.printBanner()
        await this.initializeStore()
        await this.connectToWhatsApp()
        this.startReminderEngine()
        this.startHealthCheck()
        this.setupGracefulShutdown()
    }

    printBanner() {
        console.log('=================================')
        console.log('     APPLE-NDIIBOT STARTING')
        console.log('=================================')
        console.log(`🤖 Bot Name: ${CONFIG.botName}`)
        console.log(`📌 Version: ${CONFIG.version}`)
        console.log(`👑 Owner: ${CONFIG.ownerNumber.join(', ')}`)
        console.log(`⚡ Prefix: ${CONFIG.prefix.join(' ')}`)
        console.log(`💾 Session: ${CONFIG.sessionName}`)
        console.log(`📦 Plugins: ${this.pluginManager.plugins.size} loaded`)
        console.log('=================================\n')
    }

    async initializeStore() {
        this.store = makeInMemoryStore({ 
            logger: pino({ level: 'silent' }) 
        })
        
        this.store.readFromFile(path.join(__dirname, 'store.json'))
        
        setInterval(() => {
            this.store.writeToFile(path.join(__dirname, 'store.json'))
        }, 10000)
    }

    async connectToWhatsApp() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionName)
            const { version, isLatest } = await fetchLatestBaileysVersion()
            
            console.log(`📱 WhatsApp Version: ${version.join('.')} (${isLatest ? 'Latest' : 'Update Available'})`)

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
                },
                browser: Browsers.ubuntu('Chrome'),
                markOnlineOnConnect: CONFIG.autoOnline,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                getMessage: async (key) => {
                    return { conversation: '' }
                }
            })

            this.store.bind(this.sock.ev)

            this.sock.ev.on('creds.update', saveCreds)

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update

                if (qr) {
                    console.log('📱 QR Code received (using pairing code instead)')
                }

                if (connection === 'open') {
                    this.isConnected = true
                    this.reconnectAttempts = 0
                    console.log('✅ Connected to WhatsApp')
                    
                    await this.updateBotInfo()
                    await this.sendStartupMessage()
                }

                if (connection === 'close') {
                    this.isConnected = false
                    const statusCode = lastDisconnect?.error?.output?.statusCode
                    
                    console.log(`❌ Connection closed (Status: ${statusCode})`)
                    
                    await this.handleDisconnect(statusCode)
                }
            })

            this.sock.ev.on('messages.upsert', async (m) => {
                await this.handleMessages(m)
            })

            this.sock.ev.on('group-participants.update', async (update) => {
                await this.handleGroupUpdate(update)
            })

            if (!this.sock.authState.creds.registered) {
                await this.requestPairingCode()
            }

        } catch (error) {
            console.error('❌ Error connecting to WhatsApp:', error)
            console.log(`🔄 Reconnecting in ${CONFIG.reconnectDelay / 1000} seconds...`)
            setTimeout(() => this.connectToWhatsApp(), CONFIG.reconnectDelay)
        }
    }

    async handleDisconnect(statusCode) {
        if (this.reconnectAttempts >= CONFIG.maxReconnectAttempts) {
            console.log('❌ Max reconnect attempts reached. Please restart manually.')
            process.exit(1)
        }

        switch(statusCode) {
            case DisconnectReason.loggedOut:
                console.log('❌ Logged out. Need to re-pair.')
                await this.requestPairingCode()
                break
                
            case DisconnectReason.badSession:
                console.log('❌ Bad session. Re-pairing needed.')
                await this.requestPairingCode()
                break
                
            case DisconnectReason.connectionClosed:
                console.log('🔄 Connection closed. Reconnecting...')
                await this.reconnect()
                break
                
            case DisconnectReason.connectionLost:
                console.log('🔄 Connection lost. Reconnecting...')
                await this.reconnect()
                break
                
            case DisconnectReason.connectionReplaced:
                console.log('🔄 Connection replaced. Reconnecting...')
                await this.reconnect()
                break
                
            case DisconnectReason.timedOut:
                console.log('🔄 Connection timed out. Reconnecting...')
                await this.reconnect()
                break
                
            default:
                console.log('🔄 Unknown disconnect reason. Reconnecting...')
                await this.reconnect()
        }
    }

    async reconnect() {
        this.reconnectAttempts++
        console.log(`🔄 Reconnecting... (Attempt ${this.reconnectAttempts}/${CONFIG.maxReconnectAttempts})`)
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.reconnectDelay))
        await this.connectToWhatsApp()
    }

    async requestPairingCode() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        rl.question('📱 Masukkan nomor WhatsApp untuk bot (contoh: 6281234567890): ', async (phoneNumber) => {
            rl.close()
            
            try {
                const formattedNumber = phoneNumber.replace(/[^0-9]/g, '')
                if (!formattedNumber || formattedNumber.length < 10) {
                    console.log('❌ Nomor tidak valid. Harap masukkan nomor yang benar.')
                    await this.requestPairingCode()
                    return
                }

                console.log('🔄 Generating pairing code...')
                const pairingCode = await this.sock.requestPairingCode(formattedNumber)
                
                console.log('\n=================================')
                console.log('     PAIRING CODE GENERATED')
                console.log('=================================')
                console.log(`📱 Code: ${pairingCode}`)
                console.log('=================================')
                console.log('Langkah pairing:')
                console.log('1. Buka WhatsApp di HP Anda')
                console.log('2. Klik menu (⋮) > Linked devices')
                console.log('3. Klik "Link a device"')
                console.log('4. Masukkan code di atas')
                console.log('=================================\n')
                
            } catch (error) {
                console.error('❌ Error generating pairing code:', error)
                await this.requestPairingCode()
            }
        })
    }

    async updateBotInfo() {
        try {
            const ownerData = this.db.load('owner.json')
            const botJid = this.sock.user.id
            const cleanBotJid = this.db.cleanJid(botJid)
            
            ownerData.botNumber = cleanBotJid
            this.db.save('owner.json', ownerData)
            
            console.log(`📱 Bot Number: ${cleanBotJid.split('@')[0]}`)
        } catch (error) {
            console.error('Error updating bot info:', error)
        }
    }

    async handleMessages(messages) {
        if (!messages.messages) return
        
        for (const message of messages.messages) {
            try {
                if (!message.message) continue
                if (message.key.fromMe) continue
                
                // Handle button responses
                if (message.message.buttonsResponseMessage) {
                    await this.handleButtonResponse(message)
                    continue
                }
                
                const msgType = this.getMessageType(message.message)
                const content = this.getMessageContent(message.message, msgType)
                const from = message.key.remoteJid
                const sender = message.key.participant || from
                const isGroup = from.endsWith('@g.us')
                const pushName = message.pushName || 'Unknown'
                
                this.messageCount++
                
                // Add user to database
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
                                commandUsed: (user.commandUsed || 0) + 1
                            })
                        }
                        
                        // Try plugin commands first
                        const pluginResult = this.pluginManager.executePluginCommand(
                            command.toLowerCase(), 
                            {
                                sock: this.sock,
                                from,
                                sender,
                                isGroup,
                                pushName,
                                msgType,
                                content,
                                message,
                                db: this.db,
                                config: CONFIG,
                                startTime: this.startTime
                            }, 
                            args
                        )
                        
                        // If plugin command not found, try built-in commands
                        if (pluginResult === null) {
                            await this.executeBuiltInCommand(command.toLowerCase(), args, {
                                sock: this.sock,
                                from,
                                sender,
                                isGroup,
                                pushName,
                                msgType,
                                content,
                                message,
                                db: this.db,
                                config: CONFIG,
                                startTime: this.startTime
                            })
                        }
                    }
                }
                
                // Auto read if enabled
                const ownerData = this.db.load('owner.json')
                if (ownerData.config.autoread) {
                    await this.sock.readMessages([message.key])
                }
                
            } catch (error) {
                console.error('Error handling message:', error)
            }
        }
    }

    async handleButtonResponse(message) {
        try {
            const buttonResponse = message.message.buttonsResponseMessage
            const buttonId = buttonResponse.selectedButtonId
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            
            console.log(`🔘 Button clicked: ${buttonId} by @${sender.split('@')[0]}`)
            
            // Handle logo creator buttons
            if (buttonId.startsWith('logo_')) {
                await this.handleLogoButton(buttonId, from, sender)
            }
            
            // Handle pinterest buttons
            if (buttonId.startsWith('pin_')) {
                await this.handlePinterestButton(buttonId, from, sender)
            }
            
        } catch (error) {
            console.error('Error handling button response:', error)
        }
    }

    async handleLogoButton(buttonId, from, sender) {
        try {
            const parts = buttonId.split('_')
            const action = parts[1]
            
            const logoModule = require('./plugins/logocreator')
            const logoSessions = logoModule.getLogoSessions ? logoModule.getLogoSessions() : new Map()
            
            if (action === 'cancel') {
                logoSessions.delete(sender)
                await this.sock.sendMessage(from, {
                    text: '❌ *Pembuatan logo dibatalkan*'
                })
                return
            }
            
            const session = logoSessions.get(sender)
            
            if (!session) {
                await this.sock.sendMessage(from, {
                    text: '❌ *SESSION EXPIRED*\n\nSilakan buat prompt baru dengan .createlogo'
                })
                return
            }
            
            const prompt = session.prompt
            const model = action === 'sora' ? 'Sora AI' : 'Photiu AI'
            
            await this.sock.sendMessage(from, {
                text: `⏳ *Membuat logo menggunakan ${model}...*\n\n` +
                      `📝 Prompt: ${prompt}\n\n` +
                      `_Mohon tunggu 1-3 menit..._`
            })
            
            let imageUrl
            
            if (action === 'sora') {
                const api = `https://api.ikyyxd.my.id/ai/text2img?apikey=kyzz&text=${encodeURIComponent(prompt)}`
                const { data } = await axios.get(api, { timeout: 0 })
                imageUrl = data?.result?.url || data?.result?.image || data?.url
            } else if (action === 'photiu') {
                const api = `https://api.ikyyxd.my.id/ai/photiu?prompt=${encodeURIComponent(prompt)}`
                const { data } = await axios.get(api, { timeout: 0 })
                imageUrl = data?.result?.image || data?.result?.url || data?.url
            }
            
            if (!imageUrl) {
                throw new Error('Image tidak ditemukan')
            }
            
            await this.sock.sendMessage(from, { text: '📥 Downloading logo...' })
            
            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 120000
            })
            
            const imageBuffer = Buffer.from(response.data)
            
            await this.sock.sendMessage(from, {
                image: imageBuffer,
                caption: `✅ *Logo berhasil dibuat*\n\n` +
                        `🎨 Model: ${model}\n` +
                        `📝 Prompt: ${prompt}`
            })
            
            logoSessions.delete(sender)
            
        } catch (error) {
            console.error('Error generating logo:', error)
            await this.sock.sendMessage(from, {
                text: '❌ *Gagal membuat logo*\n\nSilakan coba lagi.'
            })
        }
    }

    async handlePinterestButton(buttonId, from, sender) {
        try {
            const parts = buttonId.split('_')
            const action = parts[1]
            const key = parts[2]
            
            const pinterestModule = require('./plugins/pinterest')
            const pinMemory = pinterestModule.getPinMemory ? pinterestModule.getPinMemory() : new Map()
            
            if (action === 'stop') {
                pinMemory.delete(key)
                await this.sock.sendMessage(from, {
                    text: '❌ *Pencarian dihentikan*'
                })
                return
            }
            
            if (action === 'next') {
                const data = pinMemory.get(key)
                
                if (!data) {
                    await this.sock.sendMessage(from, {
                        text: '❌ *SESSION EXPIRED*\n\nSilakan cari lagi dengan .pin'
                    })
                    return
                }
                
                if (data.sender !== sender) {
                    await this.sock.sendMessage(from, {
                        text: '❌ Ini bukan sesi pencarian kamu'
                    })
                    return
                }
                
                await this.sock.sendMessage(from, {
                    text: '⏳ *Mengambil halaman berikutnya...*'
                })
                
                if (pinterestModule.sendPinterestPage) {
                    await pinterestModule.sendPinterestPage(
                        this.sock,
                        from,
                        sender,
                        key,
                        pinMemory,
                        CONFIG
                    )
                }
            }
            
        } catch (error) {
            console.error('Error in handlePinterestButton:', error)
        }
    }

    async handleGroupUpdate(update) {
        try {
            const { id, participants, action } = update
            
            if (action === 'add') {
                for (const participant of participants) {
                    const welcomeMsg = `👋 *WELCOME*\n\n` +
                                      `Selamat datang @${participant.split('@')[0]}`
                    
                    await this.sock.sendMessage(id, {
                        text: welcomeMsg,
                        mentions: [participant]
                    })
                }
            } else if (action === 'remove') {
                for (const participant of participants) {
                    const leaveMsg = `👋 *GOODBYE*\n\n` +
                                    `@${participant.split('@')[0]} telah meninggalkan group`
                    
                    await this.sock.sendMessage(id, {
                        text: leaveMsg,
                        mentions: [participant]
                    })
                }
            }
        } catch (error) {
            console.error('Error handling group update:', error)
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
        if (message.listResponseMessage) return 'listResponse'
        if (message.reactionMessage) return 'reaction'
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
            case 'document':
                return message.documentMessage.caption || ''
            default:
                return ''
        }
    }

    async executeBuiltInCommand(command, args, context) {
        try {
            const cleanSender = this.db.cleanJid(context.sender)
            const senderNumber = cleanSender.split('@')[0]
            console.log(`⚡ Command: ${context.config.prefix[0]}${command} | User: @${senderNumber}`)
            
            // Built-in commands
            switch(command) {
                case 'menu':
                    await this.sendMenu(context)
                    break
                    
                case 'ping':
                    await this.sock.sendMessage(context.from, { text: '🏓 Pong!' })
                    break
                    
                case 'owner':
                    const ownerData = this.db.load('owner.json')
                    await this.sock.sendMessage(context.from, {
                        text: `👑 *OWNER*\n\n@${ownerData.mainOwner[0]}`,
                        mentions: [`${ownerData.mainOwner[0]}@s.whatsapp.net`]
                    })
                    break
                    
                default:
                    if (CONFIG.autoReplyUnknown) {
                        await this.sock.sendMessage(context.from, {
                            text: `❌ Command tidak ditemukan\nKetik ${CONFIG.prefix[0]}menu`
                        })
                    }
            }
            
        } catch (error) {
            console.error(`Error executing command ${command}:`, error)
        }
    }

    async sendMenu(context) {
        const plugins = this.pluginManager.getPluginInfo()
        let menuText = `🤖 *${CONFIG.botName}*\n\n` +
                      `⚡ Prefix: ${CONFIG.prefix.join(' ')}\n\n` +
                      `📦 *Plugins (${plugins.length}):*\n`
        
        plugins.forEach(plugin => {
            menuText += `• ${plugin.name} - ${plugin.commands.length} commands\n`
        })
        
        menuText += `\n📝 *Built-in Commands:*\n` +
                   `• menu - Tampilkan menu\n` +
                   `• ping - Cek kecepatan\n` +
                   `• owner - Info owner`
        
        await this.sock.sendMessage(context.from, { text: menuText })
    }

    async sendStartupMessage() {
        try {
            const ownerData = this.db.load('owner.json')
            const mainOwnerJid = this.db.formatJid(ownerData.mainOwner[0])
            
            if (!mainOwnerJid) return
            
            const stats = this.db.getDatabaseStats()
            const pluginsInfo = this.pluginManager.getPluginInfo()
            
            const startupMessage = `🤖 *${CONFIG.botName} CONNECTED*\n\n` +
                                  `✅ Status: Online\n` +
                                  `📦 Plugins: ${pluginsInfo.length}\n` +
                                  `👥 Users: ${stats.totalUsers}\n\n` +
                                  `Ketik .menu untuk melihat commands`
            
            await this.sock.sendMessage(mainOwnerJid, { text: startupMessage })
            console.log('📤 Startup message sent to owner')
            
        } catch (error) {
            console.error('Error sending startup message:', error)
        }
    }

    startReminderEngine() {
        console.log('⏰ Reminder engine started')
        
        this.reminderInterval = setInterval(async () => {
            try {
                const pendingReminders = this.db.getPendingReminders()
                
                for (const reminder of pendingReminders) {
                    const jid = this.db.formatJid(reminder.user)
                    
                    if (jid) {
                        await this.sock.sendMessage(jid, {
                            text: `⏰ *REMINDER*\n\n${reminder.message}`
                        })
                        
                        this.db.updateReminderStatus(reminder.id, 'executed')
                    }
                }
            } catch (error) {
                console.error('Error in reminder engine:', error)
            }
        }, CONFIG.reminderCheckInterval)
    }

    startHealthCheck() {
        console.log('🏥 Health check started')
        
        setInterval(() => {
            const memoryUsage = process.memoryUsage()
            
            if (this.messageCount % 500 === 0 && this.messageCount > 0) {
                console.log(`📊 Status: ${this.messageCount} messages, ${this.commandCount} commands, Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`)
            }
        }, 60000)
    }

    setupGracefulShutdown() {
        process.on('SIGINT', async () => {
            console.log('\n👋 Shutting down...')
            
            if (this.reminderInterval) {
                clearInterval(this.reminderInterval)
            }
            
            if (this.store) {
                this.store.writeToFile(path.join(__dirname, 'store.json'))
            }
            
            this.db.clearCache()
            
            process.exit(0)
        })

        process.on('unhandledRejection', (error) => {
            console.error('❌ Unhandled rejection:', error)
        })

        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught exception:', error)
        })
    }
}

// ==================== MAIN ====================
const bot = new WhatsAppBot()

bot.start().catch(error => {
    console.error('❌ Fatal error starting bot:', error)
    process.exit(1)
})

module.exports = WhatsAppBot
